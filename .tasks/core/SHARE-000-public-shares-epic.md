---
id: SHARE-000
title: "Epic: Public Shares via sd.app"
status: To Do
assignee: jamiepine
priority: High
tags: [epic, sharing, cloud, networking]
related_tasks: [CLOUD-000, CLOUD-002, SEC-007, NET-001]
---

## Description

Public sharing of Spacedrive Spaces (and individual files/folders) via sd.app. A user creates a share from their local instance, gets a `sd.app/s/{token}` link, and visitors browse/download content in a web viewer. sd.app provides the Iroh relay, share registry, viewer SPA, and account management. Bytes never transit sd.app — the browser dials the user's core directly through our relay over QUIC.

## Architecture (decided)

- **Bytes path**: direct-dial. Browser → sd.app relay → user's core (QUIC). sd.app does not proxy file content.
- **sd.app responsibilities**: Iroh relay infrastructure, share registry (token → node_id/relay_url), public viewer SPA, user accounts for share management.
- **Share unit**: Spaces (primary), plus single files and arbitrary folder selections.
- **Permissions**: read-only public, optional password, optional expiry.
- **Repo layout**: sd.app cloud service lives in a separate repo; this epic covers core + desktop interface only.

## Sub-tasks

- `SHARE-001` — Design: share architecture & wire protocol spec
- `SHARE-002` — Core: PublicShare schema, sync, migrations
- `SHARE-003` — Core: share CRUD operations & RPC surface
- `SHARE-004` — Core: custom relay configuration (sd.app)
- `SHARE-005` — Core: guest access protocol over Iroh
- `SHARE-006` — Core: file/folder share scope (beyond Spaces)
- `SHARE-007` — Core: expiry & revocation enforcement
- `SHARE-008` — Core: share registration with sd.app registry
- `SHARE-009` — Interface: share creation UI
- `SHARE-010` — Interface: share management view
- `SHARE-011` — Core + Interface: sd.app account linking

## Related Work

- `CLOUD-000` — Cloud as a Peer (parent rationale)
- `CLOUD-002` — Asynchronous Relay Server (re-scoped; see SHARE-004 note)
- `SEC-007` — Per-Library Encryption Policies for Public Sharing
- `NET-001` — Iroh P2P stack (foundation, already Done)
