---
id: INDEX-011
title: Rules-Free Ephemeral Scan Mode
status: To Do
assignee: jamiepine
parent: INDEX-000
priority: High
tags: [indexing, ephemeral, rules, file-sync, completeness]
last_updated: 2026-02-07
related_tasks: [INDEX-005, INDEX-010, FSYNC-003, FILE-006]
---

## Description

The ephemeral and persistent indexers share the same `RuleToggles` configuration, which filters out `node_modules`, `.git`, gitignored files, and other development artifacts by default. For browsing this is correct. For file sync and smart copy it's wrong — these operations need to see every file on disk to guarantee completeness.

This task adds a "complete scan" mode to ephemeral indexing that bypasses all filtering rules. Operations like file sync and path intersection request this mode when they need full filesystem coverage.

## Problem

- File sync between two locations silently skips files excluded by indexer rules
- A user syncing their project folder won't get `node_modules`, `dist/`, or gitignored files
- There's no way to distinguish "file doesn't exist on target" from "file was filtered by rules"
- The `sync_conduit` schema has `use_index_rules` and `index_mode_override` fields but neither is wired into anything

## Design

### RuleToggles Addition

```rust
// core/src/ops/indexing/rules.rs

impl RuleToggles {
    /// All rules disabled. Indexes every file on disk.
    /// Used by file sync, smart copy, and path intersection operations.
    pub fn complete() -> Self {
        Self {
            no_system_files: false,
            no_hidden: false,
            no_git: false,
            gitignore: false,
            only_images: false,
            no_dev_dirs: false,
        }
    }
}
```

### IndexerJobConfig Integration

The ephemeral indexer already accepts `RuleToggles` via `IndexerJobConfig`. Complete scan mode is just a configuration option, not a new code path.

```rust
// core/src/ops/indexing/input.rs

impl IndexerJobConfig {
    /// Ephemeral scan with no filtering rules.
    /// Returns complete filesystem state for sync and diff operations.
    pub fn complete_scan(path: SdPath, scope: IndexScope) -> Self {
        Self {
            persistence: IndexPersistence::Ephemeral,
            rule_toggles: RuleToggles::complete(),
            is_volume_indexing: false,
            ..Self::ephemeral_browse(path, scope, false)
        }
    }
}
```

### Invocation from File Sync / Smart Copy

When file sync or path intersection needs complete coverage, it requests a complete scan instead of a regular ephemeral browse:

```rust
// In SyncResolver or PathIntersection operation

let config = IndexerJobConfig::complete_scan(
    source_path.clone(),
    IndexScope::Recursive,
);

// Submit indexing job and wait for completion
let job_id = ctx.job_manager().submit(IndexerJob::new(config)).await?;
ctx.job_manager().wait_for(job_id).await?;

// Now the ephemeral cache has complete filesystem state for source_path
```

### Coexistence with Filtered Indexes

A path can be indexed with rules (for browsing) and without rules (for sync) in the same session. The ephemeral index is additive — a complete scan adds entries that were previously filtered, it doesn't remove existing entries. Entries already present from a filtered scan keep their UUIDs.

```rust
// core/src/ops/indexing/ephemeral/index.rs

impl EphemeralIndex {
    // add_entry() already skips duplicates:
    // "Only adds if path not already indexed (prevents duplicates)"
    // So a complete scan after a filtered scan fills gaps without overwriting.
}
```

### Sync Conduit Schema Wiring

Wire the existing `use_index_rules` column on `sync_conduit` to control whether the resolver requests a complete scan or uses the existing filtered index:

```rust
// core/src/service/file_sync/resolver.rs

impl SyncResolver {
    async fn ensure_index_coverage(
        &self,
        conduit: &sync_conduit::Model,
        path: &SdPath,
    ) -> Result<()> {
        if !conduit.use_index_rules {
            // Request complete ephemeral scan
            let config = IndexerJobConfig::complete_scan(
                path.clone(),
                IndexScope::Recursive,
            );
            self.job_manager.submit_and_wait(IndexerJob::new(config)).await?;
        }
        // If use_index_rules is true, use whatever is already indexed
        Ok(())
    }
}
```

## Implementation Steps

### 1. Add `RuleToggles::complete()` Constructor

Single method on the existing struct. No structural changes needed.

**File:** `core/src/ops/indexing/rules.rs`

### 2. Add `IndexerJobConfig::complete_scan()` Constructor

New constructor that sets `RuleToggles::complete()` and ephemeral persistence. Follows the same pattern as existing `ephemeral_browse()` and `persistent_index()` constructors.

**File:** `core/src/ops/indexing/input.rs`

### 3. Wire `use_index_rules` in SyncResolver

When `sync_conduit.use_index_rules` is false, the resolver triggers a complete ephemeral scan before calculating operations. This ensures the ephemeral cache has full filesystem state.

**File:** `core/src/service/file_sync/resolver.rs`

### 4. Verify Additive Behavior

Confirm that running a complete scan on an already-indexed path adds new entries (previously filtered) without removing or duplicating existing ones. The current `add_entry()` logic already skips duplicates, but verify this works correctly when a filtered scan happened first.

**File:** `core/src/ops/indexing/ephemeral/index.rs` (verification, may not need changes)

## Files to Create/Modify

**Modified Files:**
- `core/src/ops/indexing/rules.rs` - Add `RuleToggles::complete()`
- `core/src/ops/indexing/input.rs` - Add `IndexerJobConfig::complete_scan()`
- `core/src/service/file_sync/resolver.rs` - Wire `use_index_rules` to trigger complete scans

## Acceptance Criteria

- [ ] `RuleToggles::complete()` disables all filtering rules
- [ ] `IndexerJobConfig::complete_scan()` creates ephemeral config with no rules
- [ ] Complete scan indexes files that would be filtered by default rules (node_modules, .git, etc.)
- [ ] Complete scan after a filtered scan adds missing entries without duplicating existing ones
- [ ] Existing ephemeral UUIDs are preserved when a complete scan fills gaps
- [ ] `sync_conduit.use_index_rules = false` triggers complete scan in resolver
- [ ] Integration test: complete scan includes node_modules directory
- [ ] Integration test: complete scan includes hidden files and .git
- [ ] Integration test: complete scan after filtered scan preserves original UUIDs

## Technical Notes

### Why Not a Separate Cache?

The ephemeral index is already a single shared instance. Creating a separate "complete" index would double memory usage and complicate UUID management. The additive approach (fill gaps in the existing index) is simpler and uses the same UUID reconciliation from INDEX-010.

### Performance Expectation

A complete scan of a large project directory will index more entries than a filtered scan (potentially 10-100x more for projects with heavy node_modules). The ephemeral index handles this well at ~50 bytes/entry, but memory usage should be monitored for volume-level complete scans.

### System Files Exception

Even in complete mode, the OS kernel virtual filesystems (`/dev`, `/sys`, `/proc`) should probably still be excluded since they contain pseudo-files that can cause hangs. Consider keeping a minimal `NEVER_INDEX` rule that can't be disabled for truly dangerous paths.

## Related Tasks

- INDEX-005 - Indexer Rules Engine (the rules system this extends)
- INDEX-010 - Bidirectional UUID Reconciliation (reconcile complete scan UUIDs with persistent)
- FSYNC-003 - FileSyncService Core (primary consumer of complete scans)
- FILE-006 - Path Intersection & Smart Diff (needs complete coverage for accuracy)
