---
id: SHARE-003
title: Share CRUD Operations
status: To Do
assignee: jamiepine
parent: SHARE-000
priority: High
tags: [sharing, ops]
---

## Description

Library operations for managing shares from the desktop client. Each action is registered via `register_library_action!` and reached by the interface through the existing JSON-RPC daemon transport (`core/src/infra/daemon/rpc.rs`) — no separate router wiring needed.

## Implementation Steps

1. Ops under `core/src/ops/shares/`:
   - `CreateShareAction` (`shares.create`) — generate token, hash password, persist row, trigger publish (SHARE-008)
   - `ListSharesAction` (`shares.list`) — filter by space / by device / all
   - `UpdateShareAction` (`shares.update`) — change expiry, password, permissions, metadata
   - `RevokeShareAction` (`shares.revoke`) — set `revoked_at`, push revocation to sd.app
2. Token generation: 128-bit CSPRNG → base32, collision-check at insert
3. Password handling: argon2id — add a `password` module to `crates/crypto` (the crate currently exposes only BLAKE3); thin wrapper over the `argon2` crate exposing `hash(password) -> PasswordHash` and `verify(password, hash) -> bool`
4. Register each action with `register_library_action!`; type metadata is picked up automatically by the inventory-based extractor
5. Authorization: only owner-class devices can create/revoke shares; enforced at op layer

## Acceptance Criteria

- [ ] All four ops have unit tests covering happy path and auth boundary
- [ ] Tokens are cryptographically random and uniqueness-enforced
- [ ] Password updates re-hash with fresh salt
- [ ] Revoking a share blocks subsequent guest access (verified in SHARE-005 tests)
