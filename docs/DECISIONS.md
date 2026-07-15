# Architecture and product decisions

## ADR-001 — TypeScript modular monolith

Status: accepted. The empty repository was initialized with the supported Vinext/Cloudflare Sites structure. One TypeScript deployable keeps identity, API, risk, and audit changes reviewable during MVP while module seams preserve an extraction path.

## ADR-002 — Hosting identity, not app passwords

Status: accepted. Dispatch-owned Sign in with ChatGPT supplies browser identity. PropShield stores a tenant user record but no password, reset token, or external OAuth secret. Sign-up/login screens hand off to the hosting flow.

## ADR-003 — D1 for structured durable state

Status: accepted. Accounts, rules, events, snapshots, positions, alerts, and audit records require durable relational ownership and indexes. R2 is deferred until evidence/export blobs exist.

## ADR-004 — Exact integer domain arithmetic

Status: accepted. Money is a canonical minor-unit string at storage/API boundaries and `bigint` in calculations. Rule ratios are integer basis points. Browser floating-point calculations are prohibited.

## ADR-005 — No guessed prop-firm rules

Status: accepted. No real firm/program formula is active because no official source and reviewer were supplied. Visible values use an “illustrative ruleset” banner; rule verification defaults to draft.

## ADR-006 — Stateless signed device tokens plus revocation record

Status: accepted for MVP. Pairing returns 15-minute access and seven-day refresh tokens signed by a deployment secret. D1 retains device state, latest access fingerprint, sequence, and revocation. Production key rotation requires a two-key grace window.

## ADR-007 — Separate occurrence and send time

Status: accepted. `occurredAt` preserves original offline event time; `sentAt` drives the five-minute replay window. This permits ordered recovery without weakening captured-request replay protection.

## ADR-008 — Reviewable EA source before installer

Status: accepted. The first loop ships `.mq5` source and manual instructions. A signed installer/binary is not claimed until MetaEditor/terminal testing, Windows-protected credential storage, update signing, and code signing are available.

## Assumptions

- Initial account currency exponent is explicitly configured; default 2 is not safe for every currency.
- Personal workspace maps one hosting identity to one organization during MVP.
- D1 batch semantics are sufficient for first-loop ingestion; sustained event load is unmeasured.
- Five-minute send skew and ten-minute pairing windows are initial policy values subject to security/operational review.
- Rule, news, and session timezones will be stored as IANA zones; browser local time is never authoritative.
