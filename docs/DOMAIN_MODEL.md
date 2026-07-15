# Domain and database model

## Ownership hierarchy

An `Organization` owns users and trading accounts. A `User` is a human actor. A `ConnectorDevice` may access exactly one `TradingAccount`. Rule definitions belong to a firm/program/version hierarchy and are referenced by account state; they never belong to a UI widget.

## Entity catalogue

| Entity | Purpose | MVP storage state |
|---|---|---|
| User | Authenticated human identity | Implemented |
| Organization | Tenant boundary | Implemented |
| Subscription | Plan and entitlement history | Planned |
| PropFirm | Reviewed firm record | Implemented |
| PropFirmProgram | Program, phase, platform | Implemented |
| RuleSet | Program/account-size rule lineage | Implemented |
| RuleVersion | Immutable effective definition | Implemented |
| RuleSource | Official source evidence and hash | Implemented |
| CommunityRiskSignal | Moderated non-official signal | Planned, deliberately not public |
| TradingAccount | User-owned monitoring context | Implemented |
| AccountConnection | Freshness and connector health | Implemented |
| ConnectorDevice | Revocable account-scoped EA identity | Implemented |
| PairingCode | Short-lived, single-use code hash | Implemented |
| AccountSnapshot | Immutable balance/equity state | Implemented |
| Position | Normalized current/closed position | Implemented |
| Order | Pending-order lifecycle | Planned table split; raw events retained |
| Deal | Completed execution and charges | Planned table split; raw events retained |
| TradeEvent | Idempotent normalized event | Implemented |
| DailyAccountState | Rule-timezone daily reference | Planned calculation materialization |
| DrawdownState | Reproducible drawdown outputs | Planned materialization; function implemented |
| ConsistencyState | Best-day and concentration state | Planned |
| NewsEvent | Economic event and affected symbols | Planned |
| SessionDefinition | Firm/user session windows | Planned |
| Alert | Deduplicated account warning | Implemented schema |
| Notification | Channel delivery and acknowledgement | Planned |
| BehaviourSignal | Evidence-based behavioral warning | Planned |
| Simulation | User-owned simulation definition | Planned |
| SimulationResult | Assumptions and aggregate outcomes | Planned |
| AuditEvent | Hash-linked immutable action ledger | Implemented |
| SupportCase | Diagnostics and dispute workflow | Planned |

## Constraints and indexes

- User email is unique and belongs to one organization in the initial personal-workspace model.
- Device sequence and event idempotency are unique within a connector.
- Position ticket is unique within an account.
- Rule version is unique within a rule set; published versions are immutable by policy.
- Account reads join through the authenticated owner and never accept an organization identifier from the browser.
- Audit and event queries are indexed by account/time; snapshot queries by account/observed time.
- Pairing hashes are unique and plaintext codes are returned once, never stored.

## Numeric conventions

- Money: signed integer string in currency minor units (`10324000` = USD 103,240.00 at exponent 2).
- Rule ratios: integer basis points (`500` = 5.00%).
- Prices: integer symbol points supplied with symbol metadata.
- Volume: integer units at protocol scale 10,000 per lot in connector v1.
- Timestamps: ISO-8601 UTC for events; MT5 account server time is also carried as Unix seconds for explicit interpretation.

Retention requirements remain an open production decision. Raw connector events and audit evidence require a longer retention window than high-frequency snapshots; deletion must preserve legally required audit records while honoring user deletion policy.
