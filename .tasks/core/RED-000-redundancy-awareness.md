---
id: RED-000
title: "Redundancy Awareness & Cross-Location File Comparison"
status: To Do
assignee: jamiepine
priority: High
tags: [epic, core, interface, redundancy, deduplication, volumes, locations]
related_tasks: [CORE-003, VOL-000, SEARCH-000]
whitepaper: Section 4.2 (Content Identity)
last_updated: 2026-04-14
---

## Description

Enable users to see at a glance which files are safely backed up across multiple storage locations and which are at risk (single-copy). The goal is to make it trivially easy to answer: "If this drive dies, what do I lose?" and "What can I safely delete because it already exists on my NAS?"

This feature builds on the existing Content Identity system (CORE-003) which already links duplicate files via `content_id` foreign keys and tracks `entry_count` per content hash. The Volume system (VOL-000) already computes `unique_bytes` per volume. What's missing is the **query layer** to surface this data in useful ways and the **UI** to visualize it.

## Use Cases

1. **At-Risk Detection** - "Show me all files that exist on only one volume in my entire library" (non-redundant data)
2. **Location Comparison** - "Show me files on Drive A that are NOT on my NAS" (so I can decide what to copy/delete)
3. **Redundancy Summary** - "Across all my volumes, how much data is safe vs at-risk?" (colored bar per volume)
4. **Selective Comparison** - Filter/select which volumes to compare against each other
5. **Drill-Down** - From any summary view, click through to see the actual files

## Architecture

### Existing Foundation (Already Built)

| Component | Location | What It Does |
|-----------|----------|--------------|
| Content Identity | `core/src/domain/content_identity.rs` | BLAKE3 content hashing, deterministic UUIDs, `entry_count` |
| Alternate Instances | `core/src/ops/files/query/alternate_instances.rs` | Given a file, find all other copies |
| File.alternate_paths | `core/src/domain/file.rs` | `Vec<SdPath>` of all locations with same content |
| Volume.unique_bytes | `core/src/volume/manager.rs` | Deduplicated byte count per volume |
| Entry.content_id FK | `core/src/infra/db/entities/entry.rs` | Links entries to shared ContentIdentity |
| Entry.volume_id FK | `core/src/infra/db/entities/entry.rs` | Links entries to their volume |

### New Backend: Query Endpoints

All new queries go in `core/src/ops/redundancy/` and use `register_library_query!`.

#### 1. `redundancy.summary` - High-Level Redundancy Overview

**Purpose:** Powers the overview/dashboard view. For each volume (or location), returns how much data is safe vs at risk.

```rust
// Input
pub struct RedundancySummaryInput {
    /// Which volumes/locations to include. None = all.
    pub scope: Option<Vec<Uuid>>,
    /// Whether to scope by volume or location
    pub scope_type: ScopeType, // Volume | Location
}

// Output (one per volume/location in scope)
pub struct RedundancySummaryOutput {
    pub items: Vec<RedundancySummaryItem>,
    pub library_totals: LibraryRedundancyTotals,
}

pub struct RedundancySummaryItem {
    pub id: Uuid,                    // volume or location UUID
    pub name: String,
    pub total_bytes: u64,            // total data on this volume/location
    pub unique_bytes: u64,           // data unique to THIS volume (at risk if it dies)
    pub redundant_bytes: u64,        // data also on at least one other volume
    pub at_risk_file_count: u64,     // files with entry_count == 1
    pub redundant_file_count: u64,   // files with entry_count > 1
    pub total_file_count: u64,
}

pub struct LibraryRedundancyTotals {
    pub total_unique_content_bytes: u64,  // deduplicated total across library
    pub total_at_risk_bytes: u64,         // content that exists on only one volume
    pub total_redundant_bytes: u64,       // content that exists on 2+ volumes
    pub replication_score: f32,           // 0.0-1.0, ratio of redundant to total
}
```

**Core SQL:**
```sql
-- Per-volume at-risk bytes: content that ONLY exists on this volume
SELECT v.id as volume_id,
       COALESCE(SUM(ci.total_size), 0) as at_risk_bytes,
       COUNT(*) as at_risk_count
FROM content_identities ci
INNER JOIN entries e ON e.content_id = ci.id
WHERE e.volume_id = ?
AND ci.id NOT IN (
    SELECT e2.content_id FROM entries e2
    WHERE e2.volume_id != ? AND e2.content_id IS NOT NULL
)
GROUP BY v.id;

-- Per-volume redundant bytes: content that also exists on other volumes
SELECT COALESCE(SUM(DISTINCT ci.total_size), 0) as redundant_bytes
FROM entries e
INNER JOIN content_identities ci ON e.content_id = ci.id
WHERE e.volume_id = ?
AND ci.id IN (
    SELECT e2.content_id FROM entries e2
    WHERE e2.volume_id != ? AND e2.content_id IS NOT NULL
);
```

#### 2. Search Filters (extend `search.files`)

File-level redundancy queries are handled as filters on the existing `search.files` endpoint. This reuses search infrastructure (pagination, sorting, explorer UI, file structure in results).

**New filter fields on `SearchFilters`:**

```rust
pub struct SearchFilters {
    // ... existing filters (file types, tags, dates, sizes) ...

    /// Only return files that are at risk (content exists on exactly one volume)
    pub at_risk: Option<bool>,

    /// Only return files present on these volumes
    pub on_volumes: Option<Vec<Uuid>>,

    /// Only return files NOT present on these volumes
    pub not_on_volumes: Option<Vec<Uuid>>,

    /// Minimum number of volumes content must exist on
    pub min_volume_count: Option<u32>,

    /// Maximum number of volumes content can exist on
    pub max_volume_count: Option<u32>,
}
```

**Example queries these filters enable:**

```
// "At-risk files on my external SSD"
{ scope: Volume(ext_ssd_id), filters: { at_risk: true } }

// "Files on Drive A but NOT on NAS"
{ filters: { on_volumes: [drive_a_id], not_on_volumes: [nas_id] } }

// "Files only on one volume" (library-wide at-risk)
{ filters: { max_volume_count: 1 } }

// "Files shared across 3+ volumes" (well-backed-up)
{ filters: { min_volume_count: 3 } }
```

**Core SQL additions to search query builder:**

```sql
-- at_risk filter: content exists on exactly one volume
AND ci.id IN (
    SELECT e2.content_id FROM entries e2
    WHERE e2.content_id IS NOT NULL
    GROUP BY e2.content_id
    HAVING COUNT(DISTINCT e2.volume_id) = 1
)

-- not_on_volumes filter: content NOT present on specified volumes
AND ci.id NOT IN (
    SELECT e2.content_id FROM entries e2
    WHERE e2.volume_id IN (?, ?)
    AND e2.content_id IS NOT NULL
)
```

> **Note:** `entry_count` tracks entries within a single library. For cross-device scenarios where synced libraries have their own entry counts, the query may need to consider all entries across synced instances. This should be validated during implementation.

### New Frontend

#### Overview Enhancement: Redundancy Bars

Extend `VolumeBar` (`packages/interface/src/routes/overview/VolumeBar.tsx`) to show:

```
[████████████░░░░░░░░] Volume: External SSD
 ^^^^^^^^^^^  ^^^^^^
 redundant    at-risk
 (safe)       (single copy)
```

- **Green/blue segment:** Data that exists on at least one other volume (safe)
- **Amber/red segment:** Data unique to this volume (at risk)
- Tooltip with exact byte counts and file counts
- Click either segment to drill into file list

Data source: `redundancy.summary` query.

#### New Route: `/redundancy`

Location: `packages/interface/src/routes/redundancy/`

**Sub-views:**

1. **Dashboard** (`index.tsx`)
   - Library-wide `replication_score` (0-100% of data redundantly stored)
   - Per-volume redundancy bars (reuses VolumeBar pattern)
   - "At-Risk Data" callout card with total bytes and file count
   - Quick actions: "Show at-risk files", "Compare volumes"

2. **Compare** (`compare.tsx`)
   - Multi-select volume/location picker
   - Toggle: "Unique to [first]" / "Shared by all" / "Full matrix"
   - Results render in existing explorer grid/list components
   - Sortable by size (biggest gaps first)
   - Bulk action: "Copy missing files to..."

3. **At-Risk Files** (`at-risk.tsx`)
   - Paginated file list (reuses explorer components)
   - Filter by volume, min size, file type
   - Sort by size descending (largest risk first)
   - Per-file: show which volume it's on, suggest where to back up

#### Sidebar Integration

Add "Redundancy" entry to SpacesSidebar, likely under a new group or alongside Volumes:
- Icon: shield or layers
- Badge showing at-risk file count or replication score
- Links to `/redundancy` route

### File Structure

```
core/src/ops/redundancy/
├── mod.rs                 # Module declaration
├── input.rs               # RedundancySummaryInput
├── output.rs              # RedundancySummaryOutput, RedundancySummaryItem, LibraryRedundancyTotals
└── summary_query.rs       # RedundancySummaryQuery (register_library_query!)

core/src/ops/search/
├── input.rs               # Add redundancy filter fields to SearchFilters
└── query.rs               # Add redundancy filter SQL to query builder

packages/interface/src/routes/redundancy/
├── index.tsx              # Dashboard view (summary data + volume bars)
├── compare.tsx            # Volume comparison (search with on_volumes/not_on_volumes filters)
└── at-risk.tsx            # At-risk file list (search with at_risk filter)
```

## Acceptance Criteria

### Backend
- [ ] `redundancy.summary` query returns per-volume redundancy breakdown (at-risk bytes, redundant bytes, file counts, replication score)
- [ ] `search.files` supports `at_risk` filter (content on exactly one volume)
- [ ] `search.files` supports `on_volumes` / `not_on_volumes` filters for cross-volume comparison
- [ ] `search.files` supports `min_volume_count` / `max_volume_count` filters
- [ ] TypeScript types are auto-generated via the existing type extraction pipeline
- [ ] Queries perform acceptably on libraries with 100k+ files (indexed queries, no full scans)

### Frontend
- [ ] VolumeBar shows redundant vs at-risk segments with accurate data
- [ ] `/redundancy` route exists with dashboard, compare, and at-risk sub-views
- [ ] Volume/location multi-select comparison works
- [ ] Drill-down from summary to file list works
- [ ] At-risk files view is paginated, sortable, and filterable
- [ ] Sidebar entry for redundancy view

### Integration
- [ ] Data updates when new locations are indexed
- [ ] Data updates when files are deleted or moved
- [ ] Works across synced devices (content identity UUIDs are deterministic)

## Performance Considerations

- The `entry_count` field on `content_identities` is already maintained during indexing, making at-risk queries fast (just `WHERE entry_count = 1`)
- Cross-volume comparisons need `(volume_id, content_id)` index on entries table - verify this exists or add it
- For the summary query, consider caching results and invalidating on index completion rather than computing on every request
- The `not_on_volumes` filter uses a subquery — for large libraries, ensure `(volume_id, content_id)` composite index exists on entries

## Design Decisions

1. **Failure domains:** Volume-level. "At risk" = content exists on only one volume. No device-level grouping for now.
2. **Cloud volumes:** No special treatment. Cloud volumes are treated the same as any other volume — you can lose access to a cloud provider, so a file only on S3 is still at risk.
3. **RAID awareness:** Out of scope. No per-volume redundancy metadata. RAID is invisible to us and not our concern.
4. **Terminology:** "At risk" for single-copy data. Used consistently across backend and frontend.
5. **API split:** Two concerns, two endpoint families:
   - **`redundancy.summary`** — high-level per-volume/library stats (bytes, counts, replication score). Powers the dashboard and volume bars. Returns aggregate numbers, not files.
   - **`search.files`** with redundancy filters — file-level queries like "on A but not B" or "at-risk files only". Returns file structure (entries with paths, content identity, etc.). Reuses existing search infrastructure, pagination, sorting, and explorer UI.
