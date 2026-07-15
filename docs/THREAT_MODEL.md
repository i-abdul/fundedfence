# Threat model

## Assets and trust boundaries

Assets: account state, user identity, rule definitions, connector credentials, audit evidence, alerts, and firm/community source records. Boundaries exist between browser/hosting identity, MT5 terminal/EA, public API edge, application worker, D1, admin reviewers, and future notification/community providers.

| Threat | Current mitigation | Residual work |
|---|---|---|
| Fake connector events | Account-scoped signed envelope, device record, strict validation | Device attestation and signed release policy |
| Account impersonation | Single-use user-owned code; hashed login/server bound at pair | User confirmation of observed MT5 account before activation |
| Event replay | Fresh `sentAt`, HMAC, sequence, idempotency | Regional clock-skew monitoring and nonce telemetry |
| Modified EA | Public reviewable source, connector version record | Signed binary, hash allowlist, attestation |
| Stolen pairing code | Ten-minute expiry, single use, source throttle, no plaintext storage | User confirmation screen and edge rate policy |
| API flooding | Pairing source throttle and bounded payloads | Cloudflare rate limits, queue backpressure, budgets |
| Cross-tenant access | Trusted user identity plus owner join; token account scope | Automated isolation tests for every future API |
| Insider access | Audit model and least-data design | Production RBAC, approval separation, access reviews |
| Community-data abuse | No production publication path in first loop | Moderation, evidence policy, neutral language, appeal |
| Rule manipulation | Immutable versions, source hash, reviewer fields | Protected admin UI, two-person approval, recalculation audit |
| Notification spoofing | Notifications not yet shipped | Signed provider webhooks, verified templates, user preference audit |
| Credential theft at rest | Hosted secrets, EA credentials memory-only | Windows-protected connector store and key rotation |
| Stale-data false confidence | Connection timestamps/freshness model and UI warning design | Scheduled state transitions and critical offline alerts |
| Audit tampering | Previous/event hash chain | External anchor, export signatures, append-only enforcement |

## Abuse cases

- A connector submitting another account ID is rejected before storage.
- A captured signed event with a new transport attempt outside the send window is rejected.
- A legitimate offline event can be re-sent only in a new envelope with fresh `sentAt`, retained `occurredAt`, next sequence, and valid signature.
- A normal user cannot activate or edit rules because no admin endpoints are exposed.
- An illustrative ruleset cannot silently become confirmed; UI and docs label it and the database verification state defaults to draft.

## Review triggers

Repeat threat review before public deployment, installer signing, real firm rules, community ingestion, notification providers, R2 evidence, exports, and any admin surface.
