---
id: NET-004
title: First-Class Tailscale Support
status: To Do
assignee: jamiepine
parent: NET-000
priority: Medium
tags: [networking, tailscale, p2p, discovery]
---

## Description

Add first-class Tailscale support to the Spacedrive networking layer. While iroh's QUIC transport already works transparently over Tailscale's WireGuard tunnel, explicit support would improve discovery, reduce unnecessary relay traffic, and provide a better experience for users who already have Tailscale deployed across their devices.

## Context

Spacedrive's P2P stack (`core/src/service/network/core/mod.rs`) currently initializes an iroh `Endpoint` with:
- `RelayMode::Default` — uses iroh's hosted relay servers as fallback
- `MdnsDiscovery` — local network peer discovery
- `PkarrPublisher::n0_dns()` / `DnsDiscovery::n0_dns()` — remote discovery via `dns.iroh.link`

When two nodes are on the same Tailscale network, direct UDP connectivity already exists via the `100.x.y.z` address space. iroh will use this path naturally, but it still:
1. Publishes to and queries iroh's DNS infrastructure unnecessarily
2. Maintains relay server connections that will never be used
3. Requires the standard mDNS or pkarr discovery flow instead of instant Tailscale peer resolution

## Implementation Steps

### Phase 1: Configurable Relay Mode

1. Add a `network_transport` setting to library/app config with options: `"auto"` (default), `"tailscale"`, `"relay-only"`, `"local-only"`.
2. When set to `"tailscale"`:
   - Set `relay_mode(iroh::RelayMode::Disabled)` on the endpoint builder
   - Skip `PkarrPublisher` and `DnsDiscovery` registration
   - Keep mDNS active (works over Tailscale interface)
3. Wire the setting through to the endpoint initialization in `core/src/service/network/core/mod.rs`.
4. Expose the setting in the P2P/network settings UI.

### Phase 2: Tailscale-Aware Discovery

1. Implement a `TailscaleDiscovery` struct that conforms to iroh's `Discovery` trait.
2. Query the Tailscale local API (`GET http://127.0.0.1:41112/localapi/v0/status`) to enumerate peers on the tailnet.
3. For each Tailscale peer, attempt a direct QUIC connection on a known Spacedrive port to check if it's running Spacedrive.
4. Register discovered Spacedrive peers with the iroh endpoint via `add_node_addr`.
5. Optionally use Tailscale's DNS (MagicDNS) to resolve device names to IPs.

### Phase 3: Bind to Tailscale Interface (Optional)

1. Detect the Tailscale interface IP (typically `100.x.y.z` on the `utun` interface).
2. Add option to bind the iroh endpoint specifically to this interface instead of `UNSPECIFIED`.
3. This ensures all P2P traffic is exclusively routed through the WireGuard tunnel.

## Key Files

- `core/src/service/network/core/mod.rs` — Endpoint initialization, discovery setup
- `core/src/service/network/core/event_loop.rs` — Connection handling, ALPN routing
- `core/src/service/network/utils/connection.rs` — Connection caching
- `core/src/config/app_config.rs` — App configuration (add network_transport setting)

## Acceptance Criteria

- [ ] A `network_transport` config option exists with `auto`, `tailscale`, `local-only`, and `relay-only` modes.
- [ ] In `tailscale` mode, iroh relay servers are disabled and pkarr/DNS discovery is skipped.
- [ ] A `TailscaleDiscovery` implementation queries the Tailscale local API for peers.
- [ ] Two Spacedrive nodes on the same tailnet can discover and connect to each other using Tailscale discovery without iroh relays.
- [ ] The network settings UI exposes the transport mode option.
- [ ] Pairing works correctly in tailscale mode (mDNS or Tailscale discovery path).
- [ ] Graceful fallback: if Tailscale is not running, warn the user and suggest switching to `auto` mode.
