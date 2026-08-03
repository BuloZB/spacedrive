---
id: SHARE-009
title: "Interface: Share Creation UI"
status: To Do
assignee: jamiepine
parent: SHARE-000
priority: High
tags: [interface, sharing, ui]
---

## Description

Desktop UI for creating shares from Spaces, files, and folder selections.

## Implementation Steps

1. "Share" action in Space context menu and explorer right-click menu (including multi-select)
2. Share dialog:
   - Permissions (read-only for v1)
   - Optional password
   - Optional expiry — presets (1 day / 7 days / 30 days / never) plus custom datetime
   - Cover image picker (defaults to space icon)
3. On create: show generated `sd.app/s/{token}` link with copy and QR code
4. Inline status if cloud is unreachable — share is created locally, link will resolve once SHARE-008 publishes
5. Reuse existing component primitives in `packages/interface`

## Acceptance Criteria

- [ ] Share dialog reachable from Space context menu, file right-click, and multi-select right-click
- [ ] Generated link is copyable and QR-renderable
- [ ] Password and expiry inputs validated client-side
- [ ] Works against a mocked cloud during development
