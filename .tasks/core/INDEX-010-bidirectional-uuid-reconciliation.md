---
id: INDEX-010
title: Bidirectional UUID Reconciliation (Ephemeral ↔ Persistent)
status: To Do
assignee: jamiepine
parent: INDEX-000
priority: Critical
tags: [indexing, ephemeral, persistent, uuid, foundation]
last_updated: 2026-05-10
related_tasks: [INDEX-001, FSYNC-003, FILE-006]
---

## Description

The ephemeral and persistent indexes currently share UUIDs in one direction only: ephemeral → persistent (when promoting a browsed folder to a managed location). The reverse doesn't happen. When you volume-index or ephemerally browse a path that already has persistent entries, the ephemeral index generates new v4 UUIDs, orphaning metadata and breaking identity between the two layers.

This task makes the ephemeral index a true superset layer on top of the persistent index by reusing persistent UUIDs when they exist. This is the foundational primitive for file sync, smart copy, and path intersection operations.

The core can have multiple libraries loaded at the same time and does not have a global "active library". Reconciliation must therefore be library-scoped: the filesystem structure can stay shared in the global ephemeral index, but UUID identity must be resolved per library.

## Problem

- Volume indexing an already-persistent location generates new UUIDs, duplicating identity
- Tags, selections, and metadata attached to persistent entries become invisible in ephemeral views
- File sync and smart copy need a unified view across both layers, which requires stable identity
- No mechanism exists to query "does this ephemeral path have a persistent UUID?"

## Architecture

### Current Flow (One-Way)

```
Ephemeral Browse → Assign v4 UUIDs → [promote] → Persistent stores same UUIDs
                                                    ✅ Identity preserved
```

### Target Flow (Bidirectional)

```
Library-scoped ephemeral browse → Assign temporary UUIDs for that library
                                → [reconcile] → Check that library's persistent index
                                               ├── Match found → adopt persistent UUID
                                               └── No match → keep library-local v4 UUID
```

### Design Constraints

1. **Do not slow down ephemeral discovery.** The ephemeral indexer must remain fast (~50K files/sec). No database queries during the filesystem walk.
2. **Reconciliation is a separate pass.** After ephemeral discovery completes, run a background reconciliation against the persistent index for overlapping paths.
3. **Lazy resolution as fallback.** If reconciliation hasn't run yet, UUID lookups can check the persistent index on demand.
4. **Single shared filesystem index.** The global `EphemeralIndexCache` should keep one shared path and metadata structure for memory efficiency.
5. **Library-scoped UUID overlay.** Reconciliation must not overwrite one global UUID per path. UUIDs are scoped by `(library_id, entry_id)` so two loaded libraries can map the same physical path to different persistent entry UUIDs.

### Library Scoping

The ephemeral cache is process-local and shared across all loaded libraries. Persistent databases are per-library. The same absolute path may exist in more than one loaded library, and each library can have different entry UUIDs, tags, metadata, sync state, and permissions.

The correct model is:

```text
Shared ephemeral structure:
  path -> EntryId
  EntryId -> metadata
  EntryId -> content kind

Library identity overlay:
  library_id -> EntryId -> UUID
```

This lets expensive filesystem discovery stay shared while keeping persistent identity correct for each loaded library.

## Implementation Steps

### 1. Add Library-Scoped UUID Storage to EphemeralIndex

Replace the single global `entry_uuids: HashMap<EntryId, Uuid>` with a library-scoped overlay. Existing call sites should pass the library ID when reading or assigning UUIDs.

```rust
// core/src/ops/indexing/ephemeral/index.rs

pub type LibraryId = Uuid;

pub struct EphemeralIndex {
    // path and metadata fields stay shared
    entry_uuids_by_library: HashMap<LibraryId, HashMap<EntryId, Uuid>>,
}

impl EphemeralIndex {
    pub fn get_entry_uuid(&self, library_id: Uuid, path: &Path) -> Option<Uuid> {
        let entry_id = self.path_index.get(path)?;
        self.entry_uuids_by_library
            .get(&library_id)?
            .get(entry_id)
            .copied()
    }

    pub fn get_or_assign_uuid(&mut self, library_id: Uuid, path: &Path) -> Uuid {
        let Some(&entry_id) = self.path_index.get(path) else {
            return Uuid::new_v4();
        };

        let uuids = self.entry_uuids_by_library.entry(library_id).or_default();
        *uuids.entry(entry_id).or_insert_with(Uuid::new_v4)
    }

    pub fn reconcile_persistent_uuids(
        &mut self,
        library_id: Uuid,
        persistent_uuids: &HashMap<PathBuf, Uuid>,
    ) -> Vec<(PathBuf, Uuid)> {
        let uuids = self.entry_uuids_by_library.entry(library_id).or_default();
        let mut changed = Vec::new();

        let mut count = 0;
        for (path, persistent_uuid) in persistent_uuids {
            if let Some(&entry_id) = self.path_index.get(path) {
                let existing = uuids.insert(entry_id, *persistent_uuid);
                if existing != Some(*persistent_uuid) {
                    changed.push((path.clone(), *persistent_uuid));
                }
            }
        }

        changed
    }
}
```

### 2. Add Persistent UUID Extraction Query

Query all persistent entries under a given path using `directory_paths` and the closure table. Returns a map of absolute path → UUID for reconciliation.

```rust
// core/src/ops/indexing/database_storage.rs (or new file: reconciliation.rs)

pub async fn extract_persistent_uuids_for_path(
    db: &DatabaseConnection,
    root_path: &Path,
) -> Result<HashMap<PathBuf, Uuid>> {
    let root_str = root_path.to_string_lossy().to_string();

    // Find the directory_paths entry for root
    let root_dir = directory_paths::Entity::find()
        .filter(directory_paths::Column::Path.eq(&root_str))
        .one(db)
        .await?;

    let Some(root_dir) = root_dir else {
        return Ok(HashMap::new()); // Path not in persistent index
    };

    // Get all descendants via closure table
    let descendants = entry::Entity::find()
        .inner_join(entry_closure::Entity)
        .filter(entry_closure::Column::AncestorId.eq(root_dir.entry_id))
        .filter(entry::Column::Uuid.is_not_null())
        .all(db)
        .await?;

    // Resolve full paths using directory_paths cache + filename
    let mut result = HashMap::with_capacity(descendants.len());
    for entry in descendants {
        if let Ok(full_path) = PathResolver::get_full_path(db, entry.id).await {
            if let Some(uuid) = entry.uuid {
                result.insert(full_path, uuid);
            }
        }
    }

    Ok(result)
}
```

For large persistent locations this query could return thousands of entries. Batch the path resolution and use the `directory_paths` cache (O(1) per directory) to keep it fast.

### 3. Library-Scoped Reconciliation Pass on EphemeralIndexCache

After ephemeral discovery completes for a path, reconcile against the library that requested the operation. Do not scan all loaded libraries and overwrite global UUIDs.

```rust
// core/src/ops/indexing/ephemeral/cache.rs

impl EphemeralIndexCache {
    pub async fn reconcile_with_persistent(
        &self,
        library_id: Uuid,
        scanned_path: &Path,
        db: &DatabaseConnection,
    ) -> Result<Vec<(PathBuf, Uuid)>> {
        let persistent_uuids = extract_persistent_uuids_for_path(db, scanned_path).await?;

        if persistent_uuids.is_empty() {
            return Ok(Vec::new());
        }

        let mut index = self.index.write().await;
        Ok(index.reconcile_persistent_uuids(library_id, &persistent_uuids))
    }
}
```

### 4. Integration Point: After Ephemeral Indexing Completes

Wire reconciliation into the ephemeral indexing job completion path. The indexer job already calls `cache.mark_indexing_complete(path)` — add reconciliation right after.

```rust
// core/src/ops/indexing/job.rs (in the ephemeral completion path)

cache.mark_indexing_complete(&path);

// Reconcile with this library's persistent index in the background.
let cache_clone = cache.clone();
let library_id = ctx.library().id();
let db = ctx.library().db().clone();
let path_clone = path.clone();
tokio::spawn(async move {
    let _ = cache_clone
        .reconcile_with_persistent(library_id, &path_clone, db.conn())
        .await;
});
```

Spawning as a background task keeps the indexing job fast. The UI shows library-local ephemeral UUIDs immediately, then corrects them when reconciliation completes. Since UUIDs are library-scoped, another loaded library viewing the same path is unaffected.

### 5. Lazy Fallback: On-Demand UUID Resolution

For cases where reconciliation hasn't completed yet (or the user queries a UUID immediately), add a fallback that checks the persistent index during UUID access.

```rust
// core/src/ops/indexing/ephemeral/index.rs

impl EphemeralIndex {
    /// Get UUID for a path, checking persistent index as fallback.
    /// Used when reconciliation hasn't completed yet.
    pub async fn get_or_resolve_uuid(
        &mut self,
        library_id: Uuid,
        path: &PathBuf,
        persistent_lookup: Option<&dyn PersistentUuidLookup>,
    ) -> Option<Uuid> {
        // Fast path: already have a UUID (either generated or reconciled)
        if let Some(uuid) = self.get_entry_uuid(library_id, path) {
            return Some(uuid);
        }

        // Slow path: check persistent index
        if let Some(lookup) = persistent_lookup {
            if let Some(persistent_uuid) = lookup.lookup_uuid(path).await {
                // Cache for future access
                if let Some(&entry_id) = self.path_index.get(path) {
                    self.entry_uuids_by_library
                        .entry(library_id)
                        .or_default()
                        .insert(entry_id, persistent_uuid);
                }
                return Some(persistent_uuid);
            }
        }

        None
    }
}
```

The `PersistentUuidLookup` trait abstracts over the database query so the ephemeral index doesn't depend directly on SeaORM:

```rust
#[async_trait]
pub trait PersistentUuidLookup: Send + Sync {
    async fn lookup_uuid(&self, path: &Path) -> Option<Uuid>;
}
```

### 6. Emit Events on UUID Reconciliation

When a UUID changes from a temporary library-local v4 to a persistent UUID, emit a `ResourceChanged` event for that library/session so the frontend updates references.

```rust
// In reconcile_persistent_uuids(), collect changed entries:
if existing_uuid != *persistent_uuid {
    changed.push((path.clone(), *persistent_uuid));
}
// After reconciliation, emit events for changed UUIDs
```

This is important because the frontend may have cached the temporary UUID in selection state or view context. The event lets it update without a full refresh.

## Files to Create/Modify

**New Files:**
- `core/src/ops/indexing/reconciliation.rs` - `extract_persistent_uuids_for_path()` and `PersistentUuidLookup` trait

**Modified Files:**
- `core/src/ops/indexing/ephemeral/index.rs` - Add `reconcile_persistent_uuids()` and `get_or_resolve_uuid()`
- `core/src/ops/indexing/ephemeral/cache.rs` - Add `reconcile_with_persistent()`
- `core/src/ops/indexing/job.rs` - Wire reconciliation after ephemeral completion
- `core/src/ops/indexing/mod.rs` - Add `reconciliation` module
- Ephemeral query/search call sites - Pass `library_id` into UUID reads and lazy assignment

## Acceptance Criteria

- [ ] Ephemeral indexing of a persistently-indexed path reuses persistent UUIDs after reconciliation
- [ ] Volume indexing reuses persistent UUIDs for all overlapping locations
- [ ] Reconciliation runs as a background task and does not block ephemeral discovery
- [ ] Lazy fallback resolves persistent UUIDs on demand when reconciliation hasn't completed
- [ ] ResourceChanged events emitted when ephemeral UUIDs are replaced with persistent ones
- [ ] Tags and metadata attached to persistent entries are visible in ephemeral views after reconciliation
- [ ] Multiple loaded libraries with overlapping paths are handled via separate UUID overlays
- [ ] Reconciliation for one library does not overwrite UUIDs returned for another loaded library
- [ ] Paths with no persistent overlap are unaffected (keep v4 UUIDs)
- [ ] Integration test: ephemeral index of persistent location produces same UUIDs
- [ ] Integration test: two loaded libraries can reconcile the same path to different UUIDs
- [ ] Integration test: volume index reconciles UUIDs for all persistent locations on volume
- [ ] Performance: reconciliation of 100K entries completes in under 2 seconds

## Technical Notes

### Why Not Query During Discovery?

The ephemeral indexer processes ~50K files/sec. A database query per file would drop throughput by 10-100x. Batch reconciliation after discovery avoids this by doing one bulk query per persistent location.

### Why Background Task?

Users expect ephemeral browsing to feel instant. Reconciliation involves database I/O which could add 100-500ms for large locations. Running it in the background means the UI shows results immediately, with UUIDs silently correcting within a second.

### Overlap Detection

A persistent location at `/Users/james/Documents` overlaps with an ephemeral scan of `/Users/james` (the ephemeral path is a parent). The reconciliation needs to check both directions: persistent roots that are children of the scanned path, and persistent roots that are parents of the scanned path.

### Multiple Loaded Libraries

Core does not know an active library. It only knows loaded libraries and library-scoped operations. Directory listing, search, and volume indexing must pass the library ID from their operation context into ephemeral UUID access.

Do not reconcile against all loaded libraries into a single global `path -> uuid` map. That would make whichever library reconciles last win, causing the wrong tags and metadata to appear for other libraries.

### Memory Impact

The path tree, metadata, name cache, and content kind storage remain shared. Only UUID mappings become per-library. Memory overhead is proportional to the number of ephemeral entries that have been viewed or reconciled in each loaded library, not to the full filesystem metadata structure.

## Related Tasks

- INDEX-001 - Hybrid Indexing Architecture (foundation this builds on)
- INDEX-011 - Rules-Free Ephemeral Scan Mode (complements this for file sync)
- FILE-006 - Path Intersection & Smart Diff (depends on unified UUID layer)
- FSYNC-003 - FileSyncService Core (depends on unified index layer)
