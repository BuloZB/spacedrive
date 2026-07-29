---
id: SHARE-010
title: "Interface: Share Management View"
status: To Do
assignee: jamiepine
parent: SHARE-000
priority: Medium
tags: [interface, sharing, ui]
---

## Description

Per-Space and global "My Shares" view to inspect, edit, and revoke shares.

## Implementation Steps

1. "Active shares" tab on Space settings
2. Global "Shares" route in settings, listing across all spaces
3. Per-row actions: copy link, edit password/expiry, regenerate token (revoke old, mint new), revoke
4. Show: created date, expiry, last accessed, access count (when sd.app provides them)
5. Sync indicator per row: published / pending / failed (visualizes SHARE-008 state)

## Acceptance Criteria

- [ ] User can see all active shares for a given Space
- [ ] User can revoke a share and the link stops resolving within seconds
- [ ] User can regenerate a token without losing the underlying share
