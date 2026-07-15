# MT5 connector

## Safety boundary

`connector/PropShieldConnector.mq5` is an Expert Advisor only because MT5 permits `WebRequest` from EAs/scripts, not indicators. It is a data connector and contains no order placement, order modification, position close, stop-loss change, take-profit change, lot-sizing, copy-trading, signal, grid, or martingale logic.

The prototype reads account state, open positions, pending-order count, terminal health, and trade-transaction identifiers. `OnTradeTransaction` performs no network I/O; it marks state dirty and lets `OnTimer` send the signed event and reconciliation.

## Pairing and credentials

The EA submits the single-use code, SHA-256 of MT5 login plus server, server identity, MT5 build, and connector version. It receives account-scoped access/refresh tokens and approved endpoints. Access tokens expire after 15 minutes and are refreshed with the revocable device identity.

The prototype intentionally keeps credentials in memory. Safe persistence will be implemented by the signed desktop connector using Windows-protected storage; plaintext terminal files are not acceptable for production credentials.

## Event cadence

- Reconciliation immediately after pairing and connector start.
- Snapshot every two seconds when positions or pending orders exist.
- Snapshot every 15 seconds while idle.
- Trade-transaction marker on the next timer tick after an MT5 transaction callback.
- Heartbeat at least every ten seconds between snapshots.

Unsent envelopes are appended to an ordered terminal common-file buffer. Flush stops at the first failure to preserve order. Each later send receives a fresh signature; historical occurrence time remains unchanged while `sentAt` reflects the new attempt.

## Signing

The EA implements standard HMAC-SHA256 with 64-byte inner/outer pads, using MT5 SHA-256 for the primitive. It signs the same lexicographically ordered JSON body produced by the backend canonicalizer. The v1 EA constructs fields in canonical order to avoid a general JSON dependency.

## Units

- Currency uses configurable exponent, default 2; account metadata must confirm it before production.
- Lots use 10,000 integer units per lot.
- Prices use each symbol’s integer point scale.
- MT5 account server time is sent as Unix seconds; event send/occurrence times use UTC ISO-8601.

## Installation

Current manual path: download source, place in `MQL5/Experts/PropShield`, compile in MetaEditor, allow the site origin under Tools -> Options -> Expert Advisors, attach to one chart, and enter the pairing code.

The production `PropShield Desktop Connector` remains a next-loop deliverable. It must detect terminals, copy the reviewed binary, guide WebRequest allowlisting, store credentials with Windows protection, show diagnostics, update securely, uninstall cleanly, and be code-signed.

## Verification required before release

Compile in supported MetaEditor builds; verify HMAC test vectors against the TypeScript implementation; exercise hedging and netting accounts; terminal restart; API outage; invalid/expired credentials; partial closes; commission/swap updates; high event rate; history reconciliation; buffer bounds; and idle resource use. MT5 WebRequest is unavailable in Strategy Tester, so network tests require a terminal integration harness.
