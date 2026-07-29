---
id: SHARE-001
title: "Design: Share Architecture & Wire Protocols"
status: In Progress
assignee: jamiepine
parent: SHARE-000
priority: High
tags: [sharing, design, protocol, cloud]
last_updated: 2026-05-25
---

## Description

Produce the contracts between core, sd.app, and the browser viewer. This is the source-of-truth design that both repos build against.

## Scope

1. **Sequence diagrams** for: share creation, share resolution (visitor lands on link), file listing, file streaming, share revocation, share expiry.
2. **Wire protocol: core ↔ sd.app registry** (HTTPS / signed requests)
   - `POST /api/shares` — `{token, node_id, relay_url, public_metadata, password_required, expires_at}`
   - `POST /api/shares/{token}/heartbeat` — refresh relay address
   - `DELETE /api/shares/{token}` — revoke
   - `GET /s/{token}` — public resolver returning dial info to the viewer
   - Authenticated via device-key signature; rate-limited per device
3. **Wire protocol: browser viewer ↔ core** (over Iroh QUIC, new ALPN `sd/share/1`)
   - Capability handshake (token + optional password proof)
   - `list_contents(path)` — directory listing scoped to share root
   - `get_metadata(path)` — file metadata
   - `read_range(path, offset, length)` — byte range stream
   - All requests gated by share scope on the core side
4. **Token format**: 128-bit CSPRNG → base32 (no padding, no ambiguous chars). URL shape: `https://sd.app/s/{token}`. Optional `#k={key}` fragment reserved for client-side decryption keys (never sent to server).
5. **Password handling**: argon2id hash stored on core. Password proof = HMAC over server-issued challenge nonce; password never sent in cleartext.
6. **Public metadata**: name, item count, optional cover image, password_required flag. Owner identity is NOT exposed by default.

## Deliverables

- `docs/design/shares.md` with diagrams and protocol specs
- ALPN string reserved for guest protocol
- API schema (typed Rust structs + JSON schema) shared between core and sd.app

## Acceptance Criteria

- [ ] Design document covers all six sequence diagrams listed above
- [ ] Wire protocols are typed and machine-checkable on both sides
- [ ] Token / URL / password protocols are specified with rationale
- [ ] Design is approved before SHARE-002+ begins
