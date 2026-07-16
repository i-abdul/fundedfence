# Implementation status — Sprints 1–3

Updated: 2026-07-16

## Completed

- Sprint 1: authenticated MT5 pairing, durable connector credentials, live/delayed/offline monitoring, PostgreSQL lifecycle coverage, session timeout, automatic post-pair redirect, and responsive/readable public and dashboard pages.
- Sprint 2: sourced and versioned FundedNext rule catalog with independent approval, activation, supersession, rollback, account assignment, and recalculation workflow.
- Sprint 3: generalized drawdown guardians, high-water/reset state, consistency observations, what-if simulations, immutable calculation records, and live dashboard risk output.
- Ten FundedNext program/phase profiles are effective, including Free Trial v1 and Stellar Instant v2.
- The OCI Docker deployment runs the application, connection monitor, PostgreSQL, and Caddy; production revision `d8ad29a` passed migration, lifecycle, public-route, and authentication checks.

## Live acceptance

- The connected 15K FundedNext Free Trial MT5 workspace is live and assigned to `rulever_fundednext_free_trial_v1`.
- Rule recalculation completed and Engine 1.0.0 is persisting healthy immutable calculations from fresh snapshots.
- The dashboard shows current balance/equity, daily and total buffers, effective floors, open positions, and explicit unknown/missing-stop risk states.
- The authenticated simulation lifecycle covers withdrawals, gap reserves, payout periods, consistency calculations, recalculation completion, and tenant isolation.

## Verification

- TypeScript, ESLint, 25 unit/domain tests, five rendered-route tests, and the production build pass locally.
- The isolated OCI PostgreSQL lifecycle test passes against the deployed image.
- Public homepage returns 200 and the unauthenticated Rules API returns 401.
- The connector remains read-only; static safety checks find no order placement, modification, or closing calls.

## Next sprint

Sprint 4 adds saved daily risk plans, prioritized risk actions, stop-loss and combined-exposure checks, escalation patterns, reset proximity, and explainable health components.

Strategic expansion beyond the current FundedNext validation target will be reviewed before Sprint 4 scope is finalized.
