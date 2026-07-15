# Known limitations

- No real prop-firm program or official rule source is loaded. All displayed figures are illustrative and cannot protect a live account.
- The EA source has not been compiled in MetaEditor or exercised in an MT5 terminal in this workspace.
- EA credentials are memory-only. Terminal restart requires a new pairing code until Windows-protected persistence is implemented.
- The manual `.mq5` download is not a code-signed `.ex5` or Windows installer.
- Pending orders and completed deals remain in raw events; normalized `Order` and `Deal` tables are not yet implemented.
- API routes have unit/static coverage but not yet isolated-D1 integration coverage.
- The dashboard renders illustrative data; authenticated live-state binding/SSE is not yet connected to the visual dashboard component.
- Connection state is derived on reads; no scheduled stale/offline transition or critical offline notification exists.
- Admin rule management, independent approval, rollback, affected-account recalculation, and audit export UI are not implemented.
- Consistency, news/session restrictions, notifications, simulation, behavioral risk, community intelligence, subscription, deletion/export, and support cases are planned only.
- HMAC cross-language test vectors still require confirmation against compiled MQL5 output.
- Access-token secret rotation, edge-wide rate policy, durable queue, backup/restore, retention, legal/privacy review, and production operations are incomplete.
- The CSP permits inline script/style required by the current rendering stack; nonce-based hardening remains open.
