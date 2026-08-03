---
id: SHARE-002
title: PublicShare Schema, Sync, Migrations
status: To Do
assignee: jamiepine
parent: SHARE-000
priority: High
tags: [sharing, database, sync]
related_tasks: [SEC-007]
---

## Description

Database entity and sync support for `PublicShare`. Shares are owner-scoped within a library and sync across the owner's devices so any device can serve the share when online.

## Implementation Steps

1. New entity `core/src/infra/db/entities/public_share.rs`:
   - `id` UUID, `token` (unique, indexed)
   - `target_kind` enum: `Space` | `Entry` | `Path`
   - `target_ref` (UUID or sdpath, depending on kind)
   - `password_hash` nullable, `password_kdf_params` nullable
   - `expires_at` nullable, `revoked_at` nullable
   - `permissions` bitfield (read, download, list)
   - `created_at`, `created_by_device`, `last_published_at`
   - `public_metadata` JSON (name override, cover image entry id)
2. Migration under `core/src/infra/db/migration/`
3. Implement `Syncable` trait so share metadata flows across owner's devices in the library
4. Indexes: `token` unique, `(target_kind, target_ref, revoked_at)`, `(expires_at)`

## Acceptance Criteria

- [ ] Migration applies cleanly on existing libraries
- [ ] `PublicShare` rows sync across paired devices in the same library
- [ ] Schema supports Space, single Entry, and arbitrary Path targets
- [ ] Token field has DB-level uniqueness constraint
