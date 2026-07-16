# FundedFence development plan

Updated: 2026-07-16

## Delivery principles

- Live account telemetry must be reliable before any risk output is activated.
- Every firm calculation must reference an immutable, sourced, reviewed rule version.
- Unknown inputs produce `not calculated`, never an invented estimate.
- Official rules, operational warnings, and unverified community reports remain separate data classes.
- The connector remains read-only. It never places, changes, or closes a trade.

## Sprint 1 — trusted live account foundation

Goal: one authenticated user can pair MT5 once, return in another tab or session, and see an accurate live/delayed/offline account state without demo data being mistaken for protection.

### In progress

- [x] Restore the latest active or connected account after refresh and tab duplication.
- [x] Enforce a visible 10-minute pairing-code countdown and expired state.
- [x] Invalidate the previous unused code when a replacement is generated.
- [x] Distinguish paired, live, delayed, offline, and waiting states.
- [x] Bind dashboard account identity, balance, equity, positions, heartbeat, and snapshot status to live APIs.
- [x] Disable illustrative risk values when a real account is selected.
- [x] Show a prominent protection-paused state when telemetry becomes stale.
- [x] Enforce a server-validated 30-minute idle timeout and synchronize activity across duplicated tabs.
- [x] Redirect a newly paired account to its dashboard while preserving the pairing diagnostics page for existing accounts.
- [x] Make the landing page responsive without scaled fixed-width content and raise dense UI text to a readable 100%-zoom baseline.

### Remaining Sprint 1 work

- [x] Add PostgreSQL-backed integration tests for expiry, concurrent reuse, replacement, tenant isolation, token refresh/revocation, reconnect, duplicate events, and out-of-order events.
- [x] Add connector/device revocation and an explicit same-account re-pair flow.
- [x] Capture symbol digits, tick size, loss tick value, and swap for open positions.
- [x] Capture commission, deals, pending-order details, and partial closes.
- [x] Calculate auditable open risk at stop-loss from broker contract metadata and flag missing stops.
- [x] Add a PostgreSQL freshness monitor that records delayed/offline transitions and creates a deduplicated connector-paused alert while the dashboard is closed.
- [x] Add remembered account selection for users with more than one account workspace.
- [x] Complete an end-to-end OCI/MT5 soak covering app restart, token refresh, a controlled network interruption, buffered sequence recovery, and return to live state.

### Sprint 1 acceptance criteria

1. A paired account remains selected after refresh, duplicate tab, sign-out/sign-in, and app restart.
2. An expired or replaced pairing code cannot pair a connector and the UI never displays it as active.
3. Dashboard freshness moves from live to delayed to offline at the documented thresholds.
4. The dashboard never mixes a real account with illustrative risk calculations.
5. Connector restart resumes with the same device credentials and increasing sequence.
6. All lifecycle and tenant-isolation tests pass against PostgreSQL.
7. Idle sessions expire on the server, and active duplicated tabs share session activity without unexpected re-login.
8. The landing page has no horizontal overflow at phone widths and core product text is readable at 100% browser zoom.

## Sprint 2 — versioned FundedNext rule profiles (complete and deployed)

- [x] Model firm, program, phase, account-size applicability, platform, and effective dates.
- [x] Capture official sources and hash-tracked evidence snapshots.
- [x] Add draft, validation, independent approval, activation, supersession, and rollback workflow.
- [x] Implement FundedNext Stellar 2-Step, Stellar 1-Step, Stellar Lite, and Stellar Instant as separately versioned profiles.
- [x] Add a separately sourced Free Trial profile for the connected 15K test account; preserve the official EA prohibition as an operational warning.
- [x] Support daily/static/trailing loss basis, reset timezone, profit targets, trading-day requirements, holding/news restrictions, inactivity, and payout eligibility inputs.
- [x] Recalculate affected connected accounts when a new version becomes effective without mutating historical results.

## Sprint 3 — drawdown and consistency guardians (implementation complete; deployment pending)

- [x] Add intraday equity/balance, end-of-day equity/balance, static, hybrid, until-initial, and throughout-account trailing models.
- [x] Record start-of-day and high-watermark state across broker/server timezone boundaries.
- [x] Simulate all stops reached, gap reserve, next reset, position close, and withdrawal effects.
- [x] Add best-day, profitable-day, trade-count, lot consistency, and caller-defined payout-period calculations; unsupported risk consistency stays explicitly unknown.
- [x] Persist normalized source inputs, immutable snapshot/rule/engine calculation records, intermediate values, outputs, and versioned explanations for replay.
- [x] Replace live-dashboard placeholders with calculated buffers, effective floors, model status, consistency observations, and all-stops scenarios.
- [ ] Apply the PostgreSQL migration and pass the isolated OCI lifecycle test.
- [ ] Classify the existing 15K workspace as Free Trial, have the authorized owner approve/activate that profile, and verify the first live calculation.

## Sprint 4 — daily risk command centre

- Add saved daily plans: risk budget, max risk per trade, max trades, loss stop, profit lock, and preservation mode.
- Add stop-loss missing/moved-away, combined exposure, lot escalation, re-entry, revenge-trading, reset proximity, and market-close checks.
- Produce prioritized actions with evidence, severity, acknowledgement, and resolution state.
- Add account-health scoring only after its components and weights are explainable.

## Sprint 5 — news, sessions, and notifications

- Ingest an economic calendar and map events to affected symbols and rule windows.
- Add authoritative live restriction timers and session/reset countdowns.
- Add in-app and email notification delivery with retries, deduplication, quiet hours, and delivery audit.
- Build session-performance analytics from normalized deal history.

## Sprint 6 — simulations and payout readiness

- Add Monte Carlo breach/pass simulations with displayed assumptions and uncertainty.
- Add payout-readiness checks and withdrawal-impact simulation.
- Add challenge-purchase historical replay and firm-suitability scoring.
- Generate dispute evidence packs with trade timeline, snapshots, applied rule version, source evidence, and notifications.

## Later research tracks

- Community Risk Signals with deduplication, age/program separation, firm response, confidence, and human moderation.
- Official rule-page change detection with human approval before activation.
- Personalized pre-trade expectancy research only after sufficient user history and out-of-sample validation. Generic buy/sell probabilities remain outside the committed roadmap.
