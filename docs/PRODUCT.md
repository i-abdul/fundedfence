# Product and MVP

## Product promise

PropShield helps prop traders understand the rules attached to an account, see risk buffers using fresh MT5 data, and avoid accidental breaches. It does not tell a user what to trade and does not imply that monitoring can guarantee a pass or payout.

## Primary journey

1. The user signs in through the hosting identity layer.
2. The user creates an account workspace and selects a reviewed firm/program context.
3. The user confirms the exact versioned rules and sources.
4. The web app creates a single-use six-digit pairing code.
5. The user installs and compiles the read-only EA, allows the approved HTTPS origin, and enters the code.
6. The EA receives account-scoped device credentials, reconciles current state, and begins signed snapshots, events, and heartbeats.
7. The dashboard shows connection freshness, balance, equity, open positions, rule buffers, and audit events.

## MVP boundaries

Included in the target MVP:

- Hosting-managed authentication and tenant isolation.
- Account onboarding and sourced, versioned rule selection.
- Secure MT5 pairing and revocation.
- Read-only EA, snapshots, positions, trade events, heartbeat, retry, and reconciliation.
- Static daily loss, maximum loss, one balance-based trailing model, and position risk.
- Rule explanations, citations, connection freshness, alerting, and immutable audit evidence.
- Admin rule review and activation controls.

Explicitly excluded from the MVP:

- Order placement, modification, closing, copying, signals, or automated strategy logic.
- Password-based cloud MT5 hosting.
- Unverified community claims in user-facing production views.
- Firm rules guessed from memory or encoded in UI components.
- Machine-learning pass predictions without sufficient validated data.
- Any guarantee of challenge success, profit, or payout.

## First-loop scope delivered

This loop establishes the product shell, authentication integration, onboarding and pairing screens, connector protocol and EA source, durable ingestion path, exact calculation kernel, representative data model, tests, and delivery documentation. The visible dashboard uses an explicitly illustrative ruleset because no real prop-firm rule source has been provided or approved.

## Experience principles

- Danger is understood in under five seconds.
- Red appears only for a breach or imminent danger; amber is caution; mint is healthy.
- “Live,” “delayed,” and “offline” always describe data freshness, not trading performance.
- Every number names its source, rule version, calculation, and timestamp.
- Empty or preview data is labeled; the product never quietly substitutes mock state.
