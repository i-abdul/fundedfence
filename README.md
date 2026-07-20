# FundedFence

FundedFence is a read-only prop-account risk-monitoring foundation. It pairs a lightweight MT5 Expert Advisor with a responsive web application, accepts signed account events, and calculates explainable rule buffers on the server.

FundedFence is not financial advice, a trading signal service, a copy-trading tool, or a guarantee that a user will pass a challenge. The connector must never place, modify, or close trades.

## Current milestone

The first coherent product loop includes:

- Premium marketing, dashboard, onboarding, pairing, rules, and identity screens.
- App-owned email/password identity with Google OAuth hooks and server-side tenant checks.
- PostgreSQL-ready schema for users, accounts, versioned rules, pairing, connector state, snapshots, positions, alerts, and a hash-linked audit ledger.
- Single-use six-digit pairing, source throttling, short-lived device tokens, refresh tokens, signed envelopes, replay protection, sequencing, and idempotency.
- Exact minor-unit drawdown calculations with deterministic tests.
- A reviewable read-only `connector/FundedFenceConnector.mq5` prototype with snapshots, heartbeats, trade-transaction capture, HMAC signing, retries, and ordered offline buffering.
- An illustrative dashboard that clearly labels all non-live values and unverified rules.

## Local development

Requirements: Node.js 22.13 or later.

```text
npm install
npm run dev
```

Open `http://localhost:3000`. To exercise authenticated write flows, configure the runtime secrets listed in `.env.example`.

## OCI Docker deployment

The OCI target is Docker Compose with the app, PostgreSQL, Caddy reverse proxy, connection monitor, and opt-in calendar monitor. It defaults to host ports `8080` and `8443` so it can sit beside PTA until we decide whether port `80` is free.

```text
cp deploy/env.oci.example .env.oci
npm run db:migrate:postgres
docker compose --env-file .env.oci up -d --build
```

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` after creating a Google OAuth client. SMTP is intentionally left as a later password-reset setup item.

Authenticated workspaces use a server-validated inactivity timeout. Set `SESSION_IDLE_TIMEOUT_MINUTES` to the desired limit; it defaults to 30 minutes and activity is synchronized across open tabs.

## Verification

```text
npm test
npm run typecheck
npm run lint
npm run build
npm run test:integration
```

The MT5 source requires MetaEditor/MT5 for compilation and terminal tests; those tools are not bundled in this workspace.

## Documentation

- Product and MVP: `docs/PRODUCT.md`
- Architecture: `docs/ARCHITECTURE.md`
- Domain and database: `docs/DOMAIN_MODEL.md`
- Rule semantics: `docs/RULE_ENGINE.md`
- API contracts: `docs/API_CONTRACTS.md`
- MT5 connector: `docs/MT5_CONNECTOR.md`
- Security and threats: `docs/SECURITY.md`, `docs/THREAT_MODEL.md`
- Delivery state: `docs/STATUS.md`, `docs/KNOWN_LIMITATIONS.md`, `docs/NEXT_STEPS.md`
