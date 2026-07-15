# Implementation status — loop 1

Updated: 2026-07-15

## Completed

- Greenfield repository assessment and supported project initialization.
- Product/MVP, architecture, domain, rule, API, connector, security, threat, testing, deployment, decisions, limitations, and next-loop documentation.
- Premium landing page, responsive product shell, account-health dashboard, onboarding, pairing diagnostics, rule monitor, sign-in/sign-up/recovery screens.
- Hosting-managed auth foundation and tenant-scoped live-account API.
- D1 schema for core identity, rules, account, connector, snapshot, position, event, alert, and audit entities.
- Pairing-code issuance, source throttling, device pairing, short-lived/refresh credentials, signature verification, replay control, idempotency, reconciliation path, and live-state read API.
- Exact daily/maximum/trailing drawdown kernel and position-risk foundation.
- Read-only `.mq5` prototype with pairing, snapshots, heartbeats, trade callbacks, HMAC, token refresh, backoff, and offline buffer.

## Verification state

- Starter baseline production build and two starter tests passed before replacement.
- Nine deterministic domain/security tests pass: drawdown, trail lock, breach status, pairing, token scope, HMAC tamper detection, and offline/replay semantics.
- Strict TypeScript checking passes.
- ESLint passes across application, components, domain/server modules, database, worker, tests, and configuration.
- The 17-table D1 migration was generated and inspected.
- The production Vinext build passes with public, dynamic, and API routes classified.
- Rendered worker integration tests pass for landing/dashboard content, security headers, preview provenance, and starter removal; anonymous API-denial coverage is included.
- Browser journey passes: landing -> onboarding -> required rule confirmation -> pairing diagnostics.
- Mobile dashboard passes at 390 x 844: desktop sidebar hidden, mobile navigation shown, illustrative banner present, and document width equals scroll width.
- Connector static safety scan finds no order-send/trade-class/modify/close calls and confirms transaction, WebRequest, HMAC, and buffer capabilities.
- MetaEditor compile and live MT5 terminal tests are not available in this workspace and are not claimed.

## Product data status

- No live prop-firm rules are approved.
- No connector is paired in the visible preview.
- Dashboard values and restriction warnings are explicitly illustrative.

## Risks

- Financial correctness is proven only for the first illustrative formula variant.
- Cross-language connector signing still needs compiled test vectors.
- Production operations, legal/privacy controls, admin review, and alert reliability remain incomplete.

## Next loop

Compile and terminal-test the EA, add isolated-D1 connector integration tests, bind the dashboard to live state/SSE, implement stale protection warnings, and then build the protected rule-review workflow.
