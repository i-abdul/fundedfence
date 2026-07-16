# API contracts

All endpoints are same-origin JSON under `/api/v1`. Errors use `{ error: { code, message, correlationId } }`. API responses carrying live account data are `Cache-Control: no-store`.

## `POST /pairing-codes`

Requires browser identity. Accepts account label, firm/program labels, currency, and exact `accountSizeMinor`. Creates the user/organization workspace when needed, creates a pairing account, stores only the code hash, and returns the plaintext six-digit code once with ten-minute expiry.

## `POST /connector/pair`

Accepts pairing code, hashed MT5 login, server identity, platform version, and connector version. Applies a source-based ten-attempt/ten-minute window plus code expiry and single-use validation. Returns device/account IDs, 15-minute access token, seven-day refresh token, approved endpoints, configuration version, and protocol version.

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

Snapshot `account` values are integer strings: balance, equity, margin, free margin, and floating P&L in currency minor units; server time is the non-empty MT5 server-time string. Positions carry ticket/symbol/direction, integer volume units, price points, monetary P&L, and opened time. One snapshot accepts at most 100 open positions.

Responses: `202` accepted, `200` duplicate already accepted, `401` auth/signature/revocation, `409` terminal identity changed or older non-duplicate sequence requiring reconciliation.

## `GET /accounts/{accountId}/live`

Requires browser identity and verifies ownership through the stored user email. Returns account, connection timestamps, latest snapshot, open positions, and derived freshness (`live`, `delayed`, `offline`). It never trusts an organization ID supplied by the caller.

## Future contracts

Admin rule CRUD/approval, account SSE, alerts, audit export, device revocation, deletion/export, and installer update manifests are deliberately not exposed until their authorization and operational controls are implemented.
