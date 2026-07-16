# API contracts

All endpoints are same-origin JSON under `/api/v1`. Errors use `{ error: { code, message, correlationId } }`. API responses carrying live account data are `Cache-Control: no-store`.

## `POST /pairing-codes`

Requires browser identity. Accepts account label, firm/program labels, currency, and exact `accountSizeMinor`. Creates the user/organization workspace when needed, creates a pairing account, stores only the code hash, and returns the plaintext six-digit code once with ten-minute expiry.

When the authenticated owner requests a replacement for an existing account, FundedFence preserves that account and its history, revokes its active connector devices, marks the connection as reconnecting, and returns a new single-use code.

## `POST /connector/pair`

Accepts pairing code, hashed MT5 login, server identity, platform version, and connector version. Applies a source-based ten-attempt/ten-minute window plus code expiry and single-use validation. It revokes any older device for the account before activating the replacement. Returns device/account IDs, 15-minute access token, seven-day refresh token, approved endpoints, configuration version, and protocol version.

## `POST /connector/refresh`

Requires a bearer refresh token. Verifies token type, expiry, device/account scope, and revocation before rotating the access-token fingerprint and returning a new 15-minute access token.

## `POST /connector/events`

Requires bearer access token and `X-FundedFence-Signature`, an HMAC-SHA256 hex digest over the exact UTF-8 JSON request body using the access token as key.

Envelope v1.1:

```json
{
  "protocolVersion": "1.1",
  "connectorId": "dev_...",
  "accountId": "acct_...",
  "terminalIdentityHash": "sha256-of-login-and-server",
  "occurredAt": "2026-07-15T07:00:00Z",
  "sentAt": "2026-07-15T07:00:02Z",
  "sequence": 42,
  "idempotencyKey": "evt_dev_..._42",
  "eventType": "account.snapshot",
  "payload": {}
}
```

`terminalIdentityHash` must match the login/server identity captured during pairing; an account switch requires a fresh pairing. `sentAt` must be within five minutes; historical `occurredAt` is accepted for ordered offline recovery. Event types are `account.snapshot`, `trade.transaction`, `heartbeat`, and `reconciliation`.

Snapshot `account` values are integer strings: balance, equity, margin, free margin, and floating P&L in currency minor units; server time is the non-empty MT5 server-time string. Positions carry ticket/symbol/direction, integer volume units, price points, monetary P&L, and opened time. Connector 0.3.0 additionally sends symbol digits, trade tick size in price points, loss tick value per lot in account-currency minor units, and swap. Contract metadata is accepted only as a complete set. One snapshot accepts at most 100 open positions.

Responses: `202` accepted, `200` duplicate already accepted, `401` auth/signature/revocation, `409` terminal identity changed or older non-duplicate sequence requiring reconciliation.

The OCI connection-monitor service evaluates stored heartbeats every ten seconds. At more than 15 seconds it persists `delayed`; at more than 60 seconds it persists `offline` and creates one `connector.offline` alert and audit event for that heartbeat episode. A later connector event restores `live`.

## `GET /accounts/{accountId}/live`

Requires browser identity and verifies ownership through the stored user email. Returns account, connection timestamps, latest snapshot, open positions, derived freshness (`live`, `delayed`, `offline`), and an open-risk summary. Each position's `risk_at_stop_minor` is the conservatively rounded additional loss from its current price to stop-loss using the broker-reported tick size and loss tick value. Missing stops or contract metadata return `null`; they are never estimated. It never trusts an organization ID supplied by the caller.

## `GET /accounts`

Requires browser identity. Returns up to 50 account workspaces owned by the signed-in user, with connection state and freshness. The dashboard stores only the selected account ID in browser local storage, verifies it against this owned list on every new session, and synchronizes selection changes across open tabs.

## Future contracts

Admin rule CRUD/approval, account SSE, alerts, audit export, deletion/export, and installer update manifests are deliberately not exposed until their authorization and operational controls are implemented.
