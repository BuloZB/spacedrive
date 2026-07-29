---
id: SHARE-006
title: File & Folder Share Scope
status: To Do
assignee: jamiepine
parent: SHARE-000
priority: Medium
tags: [sharing, scope]
---

## Description

Extend share creation beyond Spaces to support sharing a single file or an arbitrary folder selection.

## Implementation Steps

1. `target_kind` already supports `Entry` and `Path` from SHARE-002
2. Share-creation surface from explorer right-click menu (single file, folder, or multi-selection)
3. For folder shares, the guest protocol resolves the share path as `/` from the visitor's perspective
4. For multi-file selection: wrap the selection in an implicit ephemeral SpaceItem set tagged with the share id so the listing API does not need a separate code path
5. Stable addressing: file shares are pinned by entry UUID, not path, so renames do not break the link

## Acceptance Criteria

- [ ] User can share a single file from the explorer right-click menu
- [ ] User can share a multi-selection of files and folders as one share
- [ ] Renaming a shared file or folder does not break the share link
