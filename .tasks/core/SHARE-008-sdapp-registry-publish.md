---
id: SHARE-008
title: Publish Shares to sd.app Registry
status: To Do
assignee: jamiepine
parent: SHARE-000
priority: High
tags: [sharing, cloud, sync]
related_tasks: [CLOUD-002]
---

## Description

Core publishes share metadata to sd.app's registry so `sd.app/s/{token}` can resolve to a dial target. Re-publishes on relay address changes; revokes on lifecycle changes.

## Implementation Steps

1. Cloud client module `core/src/service/cloud/share_registry.rs`:
   - `publish(share)` — signed POST with `{token, node_id, relay_url, public_metadata}`
   - `refresh(token)` — heartbeat (e.g., every 10 minutes) so the registry has a fresh address
   - `revoke(token)`
2. Authentication: per-device key signs requests (see SHARE-011 for account binding)
3. Retry with backoff; queue in local DB so transient cloud outages do not drop publishes
4. On core startup: reconcile by re-publishing any active local shares whose `last_published_at` is stale or whose relay URL has changed
5. Wire the publish/revoke calls into `CreateShareAction`, `UpdateShareAction`, `RevokeShareAction`

## Acceptance Criteria

- [ ] Created shares appear in the sd.app registry within seconds (online case)
- [ ] Relay URL changes are reflected in the registry on next heartbeat
- [ ] Revocations are pushed immediately
- [ ] Cloud outages do not block local share creation; queued publishes drain when cloud returns

## Notes

This is the only piece of the original "asynchronous relay" idea (CLOUD-002) we actually need: store-and-forward at the metadata layer, not the data layer.
