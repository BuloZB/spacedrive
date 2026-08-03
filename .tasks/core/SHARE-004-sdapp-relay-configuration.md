---
id: SHARE-004
title: Custom sd.app Relay Configuration
status: To Do
assignee: jamiepine
parent: SHARE-000
priority: High
tags: [sharing, networking, iroh, relay, cloud]
related_tasks: [CLOUD-002, NET-001]
---

## Description

Replace Iroh's default relay with sd.app-operated relays for hosted Spacedrive clients. Self-hosted users retain the option to point at Iroh defaults or their own relay.

## Implementation Steps

1. Add `relay_config` to networking settings:
   - `Default` — Iroh network defaults
   - `SdApp` — sd.app relay pool URLs (default for hosted builds)
   - `Custom(Vec<RelayUrl>)`
2. Plumb config through `NetworkingService` Iroh `Endpoint` construction
3. Document sd.app relay endpoint URLs + region selection
4. Surface current relay URL in `NetworkStatus` output (already partially exposed in `core/src/ops/network/status/output.rs`)
5. CLI setting + interface setting under network preferences
6. sd.app relay infrastructure itself is built in the separate sd.app repo; this task is purely the core-side configuration

## Acceptance Criteria

- [ ] Default desktop builds use sd.app relays
- [ ] Users can override via settings without recompiling
- [ ] Existing pairing and file transfer flows continue to work over sd.app relays
- [ ] Relay URL change takes effect without app restart where Iroh permits

## Notes

`CLOUD-002` is re-scoped: rather than building a store-and-forward relay, sd.app operates standard Iroh relays. The asynchronous coordination need is satisfied at the share-registry layer instead (see SHARE-008).
