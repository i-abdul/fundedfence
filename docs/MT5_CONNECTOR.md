# MT5 connector

## Safety boundary

`connector/FundedFenceConnector.mq5` is an Expert Advisor only because MT5 permits `WebRequest` from EAs/scripts, not indicators. It is a data connector and contains no order placement, order modification, position close, stop-loss change, take-profit change, lot-sizing, copy-trading, signal, grid, or martingale logic.

The prototype reads account state, open positions, broker contract metadata, complete pending-order details, authoritative MT5 trading sessions for relevant symbols, terminal health, and normalized deal economics. Position snapshots include symbol digits, trade tick size, loss tick value per lot, and swap so the server can calculate open risk at stop without assuming a universal Forex contract. Deal events include entry/exit type, position association, volume, price, profit, commission, swap, and fee. This makes partial closes reproducible from the exit deal and following position-volume reconciliation. `OnTradeTransaction` performs no network I/O; it queues each callback and lets `OnTimer` send signed events followed by reconciliation.

## Pairing and credentials

The EA submits the single-use code, SHA-256 of MT5 login plus server, server identity, MT5 build, and connector version. It receives account-scoped access/refresh tokens and approved endpoints. Access tokens expire after 15 minutes and are refreshed with the revocable device identity.

The current EA persists account-scoped credentials and the last sequence in the MT5 common data directory so terminal restarts can recover. Every event also carries the SHA-256 login/server identity and the backend rejects an event if the terminal account changed. The web app's **Re-pair this MT5 account** action revokes the old device before issuing a replacement code while preserving the account workspace and history. A revoked EA clears its saved credential after the server confirms revocation. `RePairSavedConnector` remains a manual local reset and must be returned to `false` after pairing. Windows-protected storage remains required before a production release.

## Event cadence

- Reconciliation immediately after pairing and connector start while MT5 is connected.
- Snapshot every two seconds when positions or pending orders exist.
- Snapshot every 15 seconds while idle.
- Every queued trade transaction on the next timer tick, including normalized deal data when MT5 created a deal.
- Heartbeat at least every ten seconds between snapshots.

Unsent envelopes are appended to an ordered terminal common-file buffer. Flush stops at the first failure to preserve order. Each later send receives a fresh signature; historical occurrence time remains unchanged while `sentAt` reflects the new attempt.

## Signing

The EA implements standard HMAC-SHA256 with 64-byte inner/outer pads, using MT5 SHA-256 for the primitive. It signs the exact UTF-8 JSON bytes sent by `WebRequest`; the backend verifies those raw bytes before processing the parsed envelope.

## Units

- Currency uses configurable exponent, default 2; account metadata must confirm it before production.
- Lots use 10,000 integer units per lot.
- Prices use each symbol’s integer point scale.
- MT5 account server time uses the terminal-provided MT5 timestamp; event send/occurrence times use UTC ISO-8601.

## Installation

Current manual path: download source, place in `MQL5/Experts/FundedFence`, compile in MetaEditor, allow the site origin under Tools -> Options -> Expert Advisors, attach to one chart, and enter the pairing code.

The production `FundedFence Desktop Connector` remains a next-loop deliverable. It must detect terminals, copy the reviewed binary, guide WebRequest allowlisting, store credentials with Windows protection, show diagnostics, update securely, uninstall cleanly, and be code-signed.

## Verification required before release

Compile in supported MetaEditor builds; verify HMAC test vectors against the TypeScript implementation; exercise hedging and netting accounts; terminal restart; API outage; invalid/expired credentials; partial closes; commission/swap updates; high event rate; history reconciliation; buffer bounds; and idle resource use. MT5 WebRequest is unavailable in Strategy Tester, so network tests require a terminal integration harness.
