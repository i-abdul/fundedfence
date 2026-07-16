# Architecture

## Shape

FundedFence starts as a TypeScript modular monolith deployed as a Cloudflare-compatible Vinext application. The web UI, API routes, domain calculations, persistence adapters, and scheduled work share one deployable boundary while retaining domain module seams. This keeps the MVP operable without premature microservices.

```text
MT5 EA -> HTTPS pairing/ingestion -> validation + connector auth
      -> raw event ledger -> normalization -> account state
      -> rule calculations -> alerts -> dashboard/API
                                      -> audit evidence
```

## Modules

| Module | Responsibility | Current location |
|---|---|---|
| Identity | App-owned email/password sessions plus Google OAuth hooks | `lib/server/auth.ts` |
| Pairing | Single-use codes, source throttling, device issuance, refresh | `app/api/v1/pairing-codes`, `app/api/v1/connector` |
| Connector protocol | Canonical envelopes, HMAC signatures, device tokens, replay window | `lib/domain/connector-protocol.ts` |
| Ingestion | Sequence/idempotency checks, raw events, snapshots, positions, freshness | `app/api/v1/connector/events` |
| Connection monitor | Persists delayed/offline transitions and creates one alert per interrupted heartbeat episode | `scripts/monitor-connections.mjs` |
| Rules | Versioned definitions and sources; no UI hard-coding | `db/schema.ts`, `docs/RULE_ENGINE.md` |
| Risk | Exact minor-unit drawdown and position-risk functions | `lib/domain` |
| Audit | Append-oriented, hash-linked organization ledger | `audit_events` |
| Experience | Public product story and responsive account workspace | `app`, `components` |

## Data flow and consistency

1. Pairing binds a device to one trading account and organization.
2. The connector issues a strictly increasing sequence and unique idempotency key.
3. The API verifies the device token, account scope, fresh `sentAt`, and HMAC over canonical JSON.
4. Duplicate idempotency keys return success without a second write. Older non-duplicate sequences return reconciliation-required.
5. Raw normalized event and audit records are written before derived state is exposed.
6. Snapshot processing updates current positions and connection freshness in the same D1 batch.
7. Risk calculations consume an immutable rule version plus exact monetary inputs. Browser code only renders results.

Historical `occurredAt` values are allowed for buffered events; replay protection is applied to `sentAt`. This preserves offline recovery without accepting a captured request sent outside the five-minute window.

## Storage

- D1 is the transactional MVP store for structured product data.
- Exact monetary amounts are canonical integer strings in currency minor units; prices and volumes use documented integer scales.
- Raw payload JSON is retained for dispute reconstruction, with retention and archival policy to be finalized before production.
- R2 remains disabled in this loop. It will be enabled for dispute exports and source evidence only when those blobs are implemented.
- Redis/durable queue are deferred until alert throughput or cross-region fan-out requires them.

## Real-time model

The ingestion API is the durable source of truth. The web app currently reads a latest-state endpoint. The next loop adds server-sent events backed by durable account-state notifications; clients must always reconcile with the latest API state after reconnecting.

Connection states derive from heartbeat age: live at 15 seconds or less, delayed through 60 seconds, offline after 60 seconds. A future scheduled job will materialize these transitions and emit alerts even when no user has the page open.

## Authentication and authorization

Browser identity is owned by FundedFence through signed HTTP-only sessions. Email/password works without an external provider; Google OAuth is enabled when the deployment has Google client credentials. Public marketing pages remain anonymous. Every account API checks the signed session on the server and joins through the account owner; client-side visibility is never authorization. Connector identity is separate, short-lived, account-scoped, refreshable, and revocable.

## Deployment

The site builds to a Cloudflare Worker-compatible bundle. Logical D1 binding `DB` lives in `.openai/hosting.json`; secrets are configured through Sites runtime values. The production boundary is one private deployment until real firm data, legal review, admin workflows, alert operations, and EA compilation/testing are complete.

## Scaling path

Extract only under measured pressure:

- durable ingestion queue if D1 write latency threatens the EA acknowledgement budget;
- calculation workers if account recalculation exceeds interactive latency;
- notification service when channel fan-out and provider retries become independently operable;
- time-series archive when retention and analytics outgrow D1.
