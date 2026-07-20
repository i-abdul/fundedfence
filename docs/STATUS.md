# Implementation status — Sprints 1–4

Updated: 2026-07-19

## Completed

- Sprint 1: authenticated MT5 pairing, durable connector credentials, live/delayed/offline monitoring, PostgreSQL lifecycle coverage, session timeout, automatic post-pair redirect, and responsive/readable public and dashboard pages.
- Sprint 2: sourced and versioned FundedNext rule catalog with independent approval, activation, supersession, rollback, account assignment, and recalculation workflow.
- Sprint 3: generalized drawdown guardians, high-water/reset state, consistency observations, what-if simulations, immutable calculation records, and live dashboard risk output.
- Sprint 4 foundation: saved daily plans, prioritized evidence-backed risk actions, action lifecycle/history, and command-centre dashboard controls.
- Ten FundedNext program/phase profiles are effective, including Free Trial v1 and Stellar Instant v2.
- The OCI Docker deployment runs the application, connection monitor, PostgreSQL, and Caddy; production revision `d8ad29a` passed migration, lifecycle, public-route, and authentication checks.

## Live acceptance

- The connected 15K FundedNext Free Trial MT5 workspace is live and assigned to `rulever_fundednext_free_trial_v1`.
- Rule recalculation completed and Engine 1.0.0 is persisting healthy immutable calculations from fresh snapshots.
- The dashboard shows current balance/equity, daily and total buffers, effective floors, open positions, and explicit unknown/missing-stop risk states.
- The authenticated simulation lifecycle covers withdrawals, gap reserves, payout periods, consistency calculations, recalculation completion, and tenant isolation.

## Verification

- TypeScript, ESLint, 35 unit/domain tests, six rendered-route tests, and the production build pass locally.
- The isolated OCI PostgreSQL lifecycle test passes against the deployed image.
- Public homepage returns 200 and the unauthenticated Rules API returns 401.
- The connector remains read-only; static safety checks find no order placement, modification, or closing calls.

## Current sprint

Sprint 4 now includes saved broker-day risk plans, deterministic stop/exposure/discipline/timing actions, lifecycle controls, and command-centre warning history. Market-close checks remain explicitly unknown until authoritative symbol sessions arrive, and health scoring remains withheld until component weights are approved.

Sprint 5 has started locally with a server-derived command-centre strip, an opt-in unverified Faireconomy calendar monitor, revision evidence, exact canonical-FX event matching, snapshot-aged reset/news countdowns, active alert notifications, and explicit unknown states for deal history, broker sessions, and named-session analytics. Firm rule windows remain disabled until FundedNext event qualification is reviewed; email remains blocked on delivery-provider configuration.

Strategic expansion beyond the current FundedNext validation target will be reviewed before Sprint 5 scope is finalized.
