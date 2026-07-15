# Deployment

## Environments

- Local: Vinext dev worker, local D1 placeholder, no production secrets, illustrative UI.
- Preview/private: Sites deployment, owner-only access, logical D1 `DB`, runtime secrets, migrations, structured logs.
- Production: blocked until external gates in `KNOWN_LIMITATIONS.md` are closed.

## Configuration

`.openai/hosting.json` contains only `project_id` when assigned plus logical `d1: DB` and `r2: null`. Runtime values:

- `PAIRING_PEPPER`: high-entropy pairing hash pepper.
- `CONNECTOR_TOKEN_SECRET`: high-entropy device token signing secret.

Local `.env` values are ignored. `.env.example` documents names only.

## Build and migration

Run unit tests, lint, typecheck, database generation, production build, rendered integration tests, and critical journeys. Inspect every generated SQL migration. Package the exact validated `dist` output, hosting metadata, and migrations. A deployment must reference the exact pushed source commit.

## Health and observability

Initial health signals: request error rate, ingestion latency, duplicate count, out-of-order count, pairing rejection/rate-limit count, heartbeat age, stale-account count, calculation latency, and connector version distribution. Logs use correlation IDs and exclude tokens, pairing codes, raw account login, and full payloads.

## Rollback

Application rollback redeploys the last known-good saved version. Database changes must be forward-compatible; destructive schema rollback is prohibited. Rule rollback activates a new reviewed version transition and recalculates affected accounts without mutating history.

## Production gates

Legal/privacy review, real sourced rule approval, admin RBAC, device revocation UI, scheduled freshness alerts, D1 integration tests, MT5 compile/terminal matrix, signed installer/EA, credential persistence, retention/deletion/export, monitoring/on-call, backup restore, and security assessment.
