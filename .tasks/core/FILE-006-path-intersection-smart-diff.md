---
id: FILE-006
title: Path Intersection & Smart Diff
status: To Do
assignee: jamiepine
parent: FILE-000
priority: High
tags: [files, operations, diff, copy, index, deduplication]
last_updated: 2026-02-07
related_tasks: [INDEX-010, INDEX-011, FILE-001, FSYNC-003]
---

## Description

Implement a path intersection operation that compares two paths (potentially on different volumes or devices) and returns the set difference: files present at path A that don't exist at path B. This enables "smart copy" — transferring only what's missing without re-copying files that already exist at the destination.

Primary use case: an external drive with files, a NAS with a partial backup. Select both, see what's missing, copy the diff.

## Problem

- No way to compare two directories and find what's missing
- Copying an entire folder to a NAS re-transfers files that are already there
- Users resort to rsync or manual comparison for this workflow
- The index has all the data needed for this comparison but no operation exposes it

## Architecture

### Three Matching Strategies

**1. Heuristic Match (fast, default)**
Compare by relative path + file size + modification time. No hashing required. Suitable for most backup/copy scenarios where files haven't been modified in place.

**2. Content Match (exact)**
Compare by BLAKE3 content hash (`content_id`). Catches files that have been renamed or moved. Requires Phase 4 content identification on both sides — either from the persistent index or computed on demand.

**3. Hybrid Match**
Heuristic first, then content-verify ambiguous cases (same name, different size or mtime). Best balance of speed and accuracy.

### Operation Flow

```
Input: source_path (SdPath), target_path (SdPath), strategy
                          ↓
      Ensure both paths are indexed (ephemeral or persistent)
      Use complete scan if needed (INDEX-011)
                          ↓
      Build relative path maps for both directories
                          ↓
      Apply matching strategy:
        Heuristic → compare (rel_path, size, mtime) tuples
        Content   → compare content_id hashes
        Hybrid    → heuristic first, hash verify edge cases
                          ↓
      Output: PathDiffResult {
        only_in_source: Vec<DiffEntry>,     // Missing from target
        only_in_target: Vec<DiffEntry>,     // Extra at target
        modified: Vec<DiffEntry>,           // Same path, different content
        matched: usize,                     // Count of identical files
        total_copy_size: u64,               // Bytes needed to sync
      }
```

### Integration with FileCopyJob

The diff result feeds directly into a copy operation:

```rust
let diff = path_intersection(source, target, Strategy::Heuristic).await?;

// Copy only what's missing
let copy_input = FileCopyInput {
    sources: SdPathBatch::from_paths(
        diff.only_in_source.iter().map(|e| e.sd_path.clone())
    ),
    destination: target_path,
    overwrite: false,
    ..Default::default()
};
```

## Implementation Steps

### 1. Define Core Types

```rust
// core/src/ops/files/diff/mod.rs

pub struct PathDiffInput {
    pub source: SdPath,
    pub target: SdPath,
    pub strategy: DiffStrategy,
    pub use_index_rules: bool,  // false = complete scan for full coverage
}

pub enum DiffStrategy {
    /// Compare by relative path + size + mtime. Fast, no hashing.
    Heuristic,
    /// Compare by BLAKE3 content hash. Catches renames/moves.
    Content,
    /// Heuristic first, content-verify ambiguous matches.
    Hybrid,
}

pub struct PathDiffResult {
    /// Files at source that don't exist at target.
    pub only_in_source: Vec<DiffEntry>,
    /// Files at target that don't exist at source.
    pub only_in_target: Vec<DiffEntry>,
    /// Files at both paths but with different content.
    pub modified: Vec<DiffEntry>,
    /// Number of files that matched exactly.
    pub matched_count: usize,
    /// Total bytes that would need to be copied (only_in_source + modified).
    pub copy_size: u64,
    /// Total number of files scanned.
    pub total_scanned: usize,
}

pub struct DiffEntry {
    pub relative_path: PathBuf,
    pub sd_path: SdPath,
    pub uuid: Option<Uuid>,
    pub size: u64,
    pub modified_at: DateTime<Utc>,
    pub content_id: Option<String>,  // BLAKE3 hash if available
    pub kind: EntryKind,
}
```

### 2. Implement Index Acquisition

Before diffing, ensure both paths are indexed. Check ephemeral cache first, then request a scan if needed.

```rust
// core/src/ops/files/diff/resolver.rs

async fn ensure_indexed(
    path: &SdPath,
    use_rules: bool,
    ctx: &ActionContext,
) -> Result<()> {
    let cache = ctx.core_context().ephemeral_cache();

    let abs_path = path.resolve(ctx)?;
    if cache.is_indexed(&abs_path).await {
        return Ok(());
    }

    // Request index scan
    let config = if use_rules {
        IndexerJobConfig::ephemeral_browse(path.clone(), IndexScope::Recursive, false)
    } else {
        IndexerJobConfig::complete_scan(path.clone(), IndexScope::Recursive)
    };

    let job_id = ctx.job_manager().submit(IndexerJob::new(config)).await?;
    ctx.job_manager().wait_for(job_id).await?;

    Ok(())
}
```

### 3. Build Relative Path Maps

Extract entries from the ephemeral index and build maps keyed by relative path for comparison.

```rust
async fn build_path_map(
    root: &Path,
    cache: &EphemeralIndexCache,
) -> Result<HashMap<PathBuf, DiffEntry>> {
    let index = cache.get_for_path(root)
        .ok_or_else(|| anyhow!("Path not indexed: {}", root.display()))?;

    let index_read = index.read().await;
    let mut map = HashMap::new();

    for (abs_path, _entry_id) in index_read.entries() {
        if let Ok(relative) = abs_path.strip_prefix(root) {
            let entry = build_diff_entry(&index_read, abs_path, relative)?;
            map.insert(relative.to_path_buf(), entry);
        }
    }

    Ok(map)
}
```

### 4. Implement Matching Strategies

**Heuristic:**
```rust
fn diff_heuristic(
    source_map: &HashMap<PathBuf, DiffEntry>,
    target_map: &HashMap<PathBuf, DiffEntry>,
) -> PathDiffResult {
    let mut result = PathDiffResult::default();

    for (rel_path, source_entry) in source_map {
        match target_map.get(rel_path) {
            None => result.only_in_source.push(source_entry.clone()),
            Some(target_entry) => {
                if source_entry.size != target_entry.size
                    || source_entry.modified_at != target_entry.modified_at
                {
                    result.modified.push(source_entry.clone());
                } else {
                    result.matched_count += 1;
                }
            }
        }
    }

    for (rel_path, target_entry) in target_map {
        if !source_map.contains_key(rel_path) {
            result.only_in_target.push(target_entry.clone());
        }
    }

    result.copy_size = result.only_in_source.iter().map(|e| e.size).sum::<u64>()
        + result.modified.iter().map(|e| e.size).sum::<u64>();

    result
}
```

**Content:** Same structure but matches on `content_id` instead of (path, size, mtime). Can detect files that were renamed or moved. Falls back to heuristic for entries without content IDs.

**Hybrid:** Runs heuristic first. For entries where path matches but size/mtime differ, checks content_id to determine if the file actually changed or just had its timestamp updated.

### 5. Register as Action

```rust
// core/src/ops/files/diff/action.rs

pub struct PathDiffAction;
crate::register_library_action!(PathDiffAction, "files.diff");

impl Action for PathDiffAction {
    type Input = PathDiffInput;
    type Output = PathDiffResult;

    async fn run(input: Self::Input, ctx: &ActionContext) -> Result<Self::Output> {
        // 1. Ensure both paths indexed
        ensure_indexed(&input.source, input.use_index_rules, ctx).await?;
        ensure_indexed(&input.target, input.use_index_rules, ctx).await?;

        // 2. Build path maps
        let source_map = build_path_map(&input.source.resolve(ctx)?, cache).await?;
        let target_map = build_path_map(&input.target.resolve(ctx)?, cache).await?;

        // 3. Run strategy
        match input.strategy {
            DiffStrategy::Heuristic => Ok(diff_heuristic(&source_map, &target_map)),
            DiffStrategy::Content => Ok(diff_content(&source_map, &target_map)),
            DiffStrategy::Hybrid => Ok(diff_hybrid(&source_map, &target_map)),
        }
    }
}
```

### 6. CLI Integration

```bash
# Show what's missing on the NAS
sd-cli files diff /Volumes/ExtDrive/Photos /Volumes/NAS/Photos

# Copy only what's missing
sd-cli files diff /Volumes/ExtDrive/Photos /Volumes/NAS/Photos --copy

# Content-based matching (catches renames)
sd-cli files diff /Volumes/ExtDrive /Volumes/NAS --strategy content

# Include normally-filtered files
sd-cli files diff /path/a /path/b --no-rules
```

## Files to Create

- `core/src/ops/files/diff/mod.rs` - Module definition, types
- `core/src/ops/files/diff/action.rs` - PathDiffAction registration
- `core/src/ops/files/diff/resolver.rs` - Index acquisition and path map building
- `core/src/ops/files/diff/strategies.rs` - Heuristic, Content, and Hybrid matching

**Modified Files:**
- `core/src/ops/files/mod.rs` - Add `diff` module
- CLI command registration for `files diff`

## Acceptance Criteria

- [ ] PathDiffAction registered and callable via API
- [ ] Heuristic strategy correctly identifies files missing from target
- [ ] Heuristic strategy correctly identifies modified files (same path, different size/mtime)
- [ ] Content strategy matches by BLAKE3 hash, detects renames
- [ ] Hybrid strategy uses heuristic first, falls back to content for ambiguous cases
- [ ] Auto-indexes paths that aren't in the ephemeral cache before diffing
- [ ] `use_index_rules: false` triggers complete scan via INDEX-011
- [ ] Diff result feeds directly into FileCopyJob input
- [ ] CLI `files diff` command shows human-readable summary
- [ ] CLI `files diff --copy` triggers copy of missing files
- [ ] Integration test: diff two directories, copy diff, re-diff shows zero missing
- [ ] Handles cross-volume paths (local drive vs NAS)
- [ ] Handles directories with 100K+ files without excessive memory usage

## Performance Notes

- Path map building is O(n) where n = entries under the root
- Heuristic comparison is O(n + m) — one pass over each map
- Content comparison is O(n + m) for indexed entries, O(n * hash_time) if hashing on demand
- For the NAS use case (100K files, heuristic), expect sub-second comparison on indexed data
- The expensive part is the initial indexing, not the diff itself

## Related Tasks

- INDEX-010 - Bidirectional UUID Reconciliation (stable UUIDs across index layers)
- INDEX-011 - Rules-Free Ephemeral Scan Mode (complete coverage for diff accuracy)
- FILE-001 - File Copy Job (executes the copy after diff)
- FSYNC-003 - FileSyncService Core (uses diff logic internally for sync resolution)
