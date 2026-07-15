# Testing strategy

## Current automated layers

- Unit: exact daily/maximum/trailing floors, trail lock, breach status, safe-risk floor, pairing normalization/hash/constant-time comparison, device token validation, canonical HMAC, tamper detection, and offline occurrence versus replay send time.
- Integration: production worker renders landing/dashboard, emits security headers, contains required safety/disclaimer/data-provenance copy, and removes the starter preview.
- Static: TypeScript strict checking and ESLint.
- Delivery: production Vinext build and generated D1 migration review.

Fixtures use integer monetary values. No financial test relies on random data or binary floating point.

## Required next layers

- API integration against isolated D1 for pairing expiry/reuse/rate limits, refresh/revocation, duplicate/out-of-order events, snapshot/position reconciliation, hedging/netting, and cross-tenant denial.
- Browser journeys for anonymous landing, hosted sign-in, onboarding, code generation, dashboard freshness, offline warning, rules source explanation, and responsive navigation.
- MT5 terminal suite for compile, restart, network loss, API outage, allowlist failure, expired tokens, multiple terminals, high frequency, large history, idle load, partial closes, commissions, swaps, and event order.
- Deterministic variants for equity/static/EOD trails, daily resets, consistency, news windows, sessions, withdrawals, and gap reserve.
- Security scanning, dependency audit, secret scanning, CSP regression, and load/soak tests.

## Release evidence

A feature is marked verified only when its relevant automated or terminal check passes. Source inspection is not an EA compilation test. The status report distinguishes implemented, automated-verified, browser-verified, and pending external verification.
