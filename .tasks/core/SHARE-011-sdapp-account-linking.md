---
id: SHARE-011
title: sd.app Account Linking
status: To Do
assignee: jamiepine
parent: SHARE-000
priority: High
tags: [sharing, cloud, accounts, auth]
---

## Description

Link a desktop device to an sd.app account so shares can be created, published, and managed from the web. v1 uses device-key-signed requests; the account binding is a lightweight `{account_id ↔ device_pubkey}` record on sd.app.

## Implementation Steps

1. Desktop link flow: open browser to `sd.app/link?code=…`; user signs in or signs up; sd.app records `{device_pubkey → account_id}`
2. Per-device session token cached locally, encrypted via the existing keyring integration
3. Cloud client (`core/src/service/cloud/`) attaches the session token and signs requests with the device key
4. Unlink/sign-out clears local credentials and notifies sd.app
5. Multiple devices per account supported; any linked device can publish or revoke shares the account owns

## Acceptance Criteria

- [ ] User can link a desktop device to an sd.app account end-to-end
- [ ] Linked device can create and publish shares
- [ ] User can unlink without affecting other linked devices
- [ ] Compromised device sessions can be revoked from sd.app; the desktop UI surfaces the linked-device list
