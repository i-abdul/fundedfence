# PropShield

PropShield is a read-only prop-account risk-monitoring foundation. It pairs a lightweight MT5 Expert Advisor with a responsive web application, accepts signed account events, and calculates explainable rule buffers on the server.

PropShield is not financial advice, a trading signal service, a copy-trading tool, or a guarantee that a user will pass a challenge. The connector must never place, modify, or close trades.

## Current milestone

The first coherent product loop includes:

- Premium marketing, dashboard, onboarding, pairing, rules, and identity screens.
- Hosting-managed identity and server-side tenant checks.
- D1 schema for users, accounts, versioned rules, pairing, connector state, snapshots, positions, alerts, and a hash-linked audit ledger.
- Single-use six-digit pairing, source throttling, short-lived device tokens, refresh tokens, signed envelopes, replay protection, sequencing, and idempotency.
- Exact minor-unit drawdown calculations with deterministic tests.
- A reviewable read-only `connector/PropShieldConnector.mq5` prototype with snapshots, heartbeats, trade-transaction capture, HMAC signing, retries, and ordered offline buffering.
- An illustrative dashboard that clearly labels all non-live values and unverified rules.

## Local development

Requirements: Node.js 22.13 or later.

```text
npm install
npm run dev
```

Open `http://localhost:3000`. To exercise authenticated write flows, run through the Sites hosting identity layer and configure the two runtime secrets listed in `.env.example`.

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
