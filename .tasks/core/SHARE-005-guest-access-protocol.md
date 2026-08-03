---
id: SHARE-005
title: Guest Access Protocol over Iroh
status: To Do
assignee: jamiepine
parent: SHARE-000
priority: High
tags: [sharing, networking, protocol, iroh]
---

## Description

New ALPN and protocol handler in core to serve unauthenticated share visitors over Iroh QUIC streams. This is what the browser viewer dials.

## Implementation Steps

1. Register ALPN `sd/share/1` on the Iroh endpoint
2. Handler `core/src/service/network/protocol/share.rs`:
   - Handshake: client sends `{token, optional password_proof}`
   - Server validates token against `PublicShare`, checks `revoked_at` / `expires_at`, validates password proof against challenge nonce
   - On success, opens a scoped session bound to the share's target
3. RPC over the session — matches existing protocol conventions (4-byte big-endian length prefix + JSON for control frames, 1MB cap; raw bytes follow a JSON header for binary payloads):
   - `ListContents { path }` — directory listing within share scope only
   - `GetMetadata { path }` — name, size, mime, thumbnail availability
   - `ReadRange { path, offset, length }` — JSON header `{bytes: N}` then N raw bytes; no base64 wrapping
4. Scope enforcement: all paths resolved relative to the share target; reject path traversal and any access outside scope
5. Thumbnails: serve from existing thumbnailer output if available, otherwise on-demand
6. Integration tests `core/tests/share_guest_protocol_test.rs` — valid token, wrong password, revoked share, expired share, path traversal, scope escape, range reads over 1 GB

## Acceptance Criteria

- [ ] A browser-style client can list and download share contents end-to-end through the relay
- [ ] Token, password, expiry, and revocation gates are all enforced server-side
- [ ] Path traversal attacks are rejected (covered by tests)
- [ ] Range requests work for files of any size
