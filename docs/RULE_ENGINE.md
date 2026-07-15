# Rule engine

## Invariants

- A calculation references one immutable `RuleVersion`.
- A published version has effective dates, verification status, sources, reviewer, and content hash.
- UI components receive calculation outputs; they never contain firm formulas.
- Exact currency values use minor-unit integers and basis points.
- Server time, rule timezone, reset boundary, and input snapshot are recorded with every derived state.
- A real account cannot become protected while its rule configuration is incomplete or unverified.

## First implemented model

The calculation kernel implements a deterministic illustrative model with:

1. Daily floor = start-of-day balance − allowance based on initial balance.
2. Maximum-loss floor = initial balance − maximum-loss allowance.
3. Balance trail = highest closed balance − trailing allowance.
4. “Until initial” cap = the balance trail cannot rise above initial balance.
5. Effective total floor = stricter of maximum-loss and active trailing floor.
6. Remaining buffers = current equity − each applicable floor.
7. Safe additional risk = the smaller current buffer − configured gap reserve, never below zero.

This is not presented as a real prop-firm formula. Firm-specific daily references, equity trails, intraday/EOD behavior, commissions, swaps, floating profit, withdrawals, and timezone resets must be encoded in sourced rule definitions before activation.

## Rule definition shape

Each versioned JSON definition will include:

- basis: balance/equity and static/trailing;
- cadence: intraday/end-of-day;
- reference: initial, start-of-day, highest balance, or highest equity;
- allowance and account-size applicability;
- trail lifetime and lock condition;
- commission, swap, closed P&L, and floating P&L inclusion;
- reset timezone and daylight-saving policy;
- withdrawal and payout effects;
- source identifiers and reviewed interpretation notes.

## Explainability record

Every calculation record must retain rule version, snapshot/event identifiers, all monetary inputs, reference timestamps, intermediate floors, final buffers, status, engine version, and explanation template version. Recalculation must reproduce the stored output byte-for-byte for the same inputs.

## Approval workflow

Draft -> source attached -> validation -> independent review -> approved -> effective. Activation is atomic. Rollback creates a new state transition; it does not mutate historical versions. A rule change identifies affected accounts, queues recalculation, and emits a neutral user notification.
