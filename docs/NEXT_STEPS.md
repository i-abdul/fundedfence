# Next recommended loop

## Highest value: prove the connector-to-ledger path end to end

1. Compile the EA in current MetaEditor and resolve all compiler warnings.
2. Add shared HMAC/canonical JSON test vectors and verify TypeScript/MQL5 byte equality.
3. Add isolated-D1 integration tests for pairing, expiry, source throttling, reuse, refresh, revocation, duplicates, out-of-order events, snapshot reconciliation, and tenant denial.
4. Bind the authenticated dashboard to `GET /accounts/{id}/live` and add SSE with reconnect reconciliation.
5. Add scheduled freshness transitions and the “Live protection is paused” critical warning.
6. Normalize pending orders, deals, partial closes, commission, and swap.
7. Implement connector revocation and re-pairing UI.

After the transport is proven, implement protected rule administration with official-source capture, validation, two-person approval, effective dates, version comparison, affected-account preview, and recalculation. Only then load one deeply validated real program and expand drawdown variants.
