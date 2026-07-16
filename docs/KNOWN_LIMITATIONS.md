# Known limitations

- No real prop-firm program or official rule source is loaded. All displayed figures are illustrative and cannot protect a live account.
- The EA source has not been compiled in MetaEditor or exercised in an MT5 terminal in this workspace.
- EA credentials currently use an MT5 common data file. Operating-system protected secret storage remains future hardening work.
- The manual `.mq5` download is not a code-signed `.ex5` or Windows installer.
- Deal and pending-order normalization is implemented, but the new EA 0.4 source still requires MetaEditor compilation and live partial-close/commission verification.
- API routes have unit/static coverage but not yet isolated-D1 integration coverage.
- The dashboard polls authenticated live state every five seconds; SSE/reconnect reconciliation is not yet implemented.
- Connection state is derived on reads; no scheduled stale/offline transition or critical offline notification exists.
- Admin rule management, independent approval, rollback, affected-account recalculation, and audit export UI are not implemented.
- Consistency, news/session restrictions, notifications, simulation, behavioral risk, community intelligence, subscription, deletion/export, and support cases are planned only.
- HMAC cross-language test vectors still require confirmation against compiled MQL5 output.
- Access-token secret rotation, edge-wide rate policy, durable queue, backup/restore, retention, legal/privacy review, and production operations are incomplete.
- The CSP permits inline script/style required by the current rendering stack; nonce-based hardening remains open.
