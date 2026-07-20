import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ...timestamps,
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  email: text("email").notNull(),
  displayName: text("display_name"),
  passwordHash: text("password_hash"),
  googleSubject: text("google_subject"),
  ...timestamps,
}, (table) => [uniqueIndex("users_email_unique").on(table.email), uniqueIndex("users_google_subject_unique").on(table.googleSubject), index("users_org_idx").on(table.organizationId)]);

export const propFirms = sqliteTable("prop_firms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"),
  ...timestamps,
}, (table) => [uniqueIndex("prop_firms_name_unique").on(table.name)]);

export const propFirmPrograms = sqliteTable("prop_firm_programs", {
  id: text("id").primaryKey(),
  propFirmId: text("prop_firm_id").notNull().references(() => propFirms.id),
  name: text("name").notNull(),
  programCode: text("program_code").notNull(),
  phase: text("phase").notNull(),
  market: text("market").notNull().default("CFDs"),
  status: text("status").notNull().default("draft"),
  platform: text("platform").notNull().default("MT5"),
  accountCurrency: text("account_currency").notNull().default("USD"),
  ...timestamps,
}, (table) => [index("programs_firm_idx").on(table.propFirmId), uniqueIndex("programs_code_phase_unique").on(table.propFirmId, table.programCode, table.phase)]);

export const ruleSets = sqliteTable("rule_sets", {
  id: text("id").primaryKey(),
  programId: text("program_id").notNull().references(() => propFirmPrograms.id),
  accountSizeMinor: text("account_size_minor").notNull(),
  activeVersionId: text("active_version_id"),
  ...timestamps,
}, (table) => [index("rule_sets_program_size_idx").on(table.programId, table.accountSizeMinor)]);

export const ruleVersions = sqliteTable("rule_versions", {
  id: text("id").primaryKey(),
  ruleSetId: text("rule_set_id").notNull().references(() => ruleSets.id),
  version: integer("version").notNull(),
  effectiveAt: text("effective_at").notNull(),
  expiresAt: text("expires_at"),
  verificationStatus: text("verification_status").notNull().default("draft"),
  definitionJson: text("definition_json").notNull(),
  contentHash: text("content_hash").notNull(),
  interpretationNotes: text("interpretation_notes").notNull().default(""),
  createdByUserId: text("created_by_user_id").references(() => users.id),
  validatedByUserId: text("validated_by_user_id").references(() => users.id),
  reviewedByUserId: text("reviewed_by_user_id").references(() => users.id),
  activatedByUserId: text("activated_by_user_id").references(() => users.id),
  approvedByUserId: text("approved_by_user_id").references(() => users.id),
  activatedAt: text("activated_at"),
  supersededAt: text("superseded_at"),
  rollbackOfVersionId: text("rollback_of_version_id"),
  ...timestamps,
}, (table) => [uniqueIndex("rule_versions_set_version_unique").on(table.ruleSetId, table.version)]);

export const ruleSources = sqliteTable("rule_sources", {
  id: text("id").primaryKey(),
  ruleVersionId: text("rule_version_id").notNull().references(() => ruleVersions.id),
  sourceType: text("source_type").notNull(),
  authorityClass: text("authority_class").notNull().default("confirmed-rule"),
  title: text("title").notNull(),
  url: text("url").notNull(),
  capturedAt: text("captured_at").notNull(),
  contentHash: text("content_hash").notNull(),
  evidenceJson: text("evidence_json").notNull().default("{}"),
  ...timestamps,
}, (table) => [index("rule_sources_version_idx").on(table.ruleVersionId)]);

export const ruleVersionTransitions = sqliteTable("rule_version_transitions", {
  id: text("id").primaryKey(),
  ruleVersionId: text("rule_version_id").notNull().references(() => ruleVersions.id),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id").notNull(),
  reason: text("reason").notNull(),
  occurredAt: text("occurred_at").notNull(),
}, (table) => [index("rule_transitions_version_time_idx").on(table.ruleVersionId, table.occurredAt)]);

export const tradingAccounts = sqliteTable("trading_accounts", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  programId: text("program_id").references(() => propFirmPrograms.id),
  ruleVersionId: text("rule_version_id").references(() => ruleVersions.id),
  label: text("label").notNull(),
  accountSizeMinor: text("account_size_minor").notNull(),
  currency: text("currency").notNull().default("USD"),
  hashedLogin: text("hashed_login"),
  serverIdentity: text("server_identity"),
  status: text("status").notNull().default("pairing"),
  ...timestamps,
}, (table) => [index("trading_accounts_owner_idx").on(table.ownerUserId), index("trading_accounts_org_idx").on(table.organizationId)]);

export const ruleRecalculationJobs = sqliteTable("rule_recalculation_jobs", {
  id: text("id").primaryKey(),
  tradingAccountId: text("trading_account_id").notNull().references(() => tradingAccounts.id),
  fromRuleVersionId: text("from_rule_version_id"),
  toRuleVersionId: text("to_rule_version_id").notNull().references(() => ruleVersions.id),
  status: text("status").notNull().default("pending"),
  reason: text("reason").notNull(),
  requestedAt: text("requested_at").notNull(),
  completedAt: text("completed_at"),
  ...timestamps,
}, (table) => [index("rule_recalc_account_status_idx").on(table.tradingAccountId, table.status), uniqueIndex("rule_recalc_account_version_unique").on(table.tradingAccountId, table.toRuleVersionId)]);

export const accountConnections = sqliteTable("account_connections", {
  id: text("id").primaryKey(),
  tradingAccountId: text("trading_account_id").notNull().references(() => tradingAccounts.id),
  state: text("state").notNull().default("offline"),
  lastHeartbeatAt: text("last_heartbeat_at"),
  lastSnapshotAt: text("last_snapshot_at"),
  lastTradeEventAt: text("last_trade_event_at"),
  connectorVersion: text("connector_version"),
  riskCalculatedAt: text("risk_calculated_at"),
  ...timestamps,
}, (table) => [uniqueIndex("account_connections_account_unique").on(table.tradingAccountId)]);

export const pairingCodes = sqliteTable("pairing_codes", {
  id: text("id").primaryKey(),
  tradingAccountId: text("trading_account_id").notNull().references(() => tradingAccounts.id),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  codeHash: text("code_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  attemptsRemaining: integer("attempts_remaining").notNull().default(5),
  ...timestamps,
}, (table) => [uniqueIndex("pairing_codes_hash_unique").on(table.codeHash), index("pairing_codes_owner_idx").on(table.ownerUserId)]);

export const connectorDevices = sqliteTable("connector_devices", {
  id: text("id").primaryKey(),
  tradingAccountId: text("trading_account_id").notNull().references(() => tradingAccounts.id),
  pairingCodeId: text("pairing_code_id").references(() => pairingCodes.id),
  tokenFingerprint: text("token_fingerprint").notNull(),
  lastSequence: integer("last_sequence").notNull().default(0),
  connectorVersion: text("connector_version").notNull(),
  platformVersion: text("platform_version").notNull(),
  revokedAt: text("revoked_at"),
  ...timestamps,
}, (table) => [index("connector_devices_account_idx").on(table.tradingAccountId), uniqueIndex("connector_devices_pairing_code_unique").on(table.pairingCodeId)]);

export const pairingRateLimits = sqliteTable("pairing_rate_limits", {
  keyHash: text("key_hash").primaryKey(),
  windowStartedAt: text("window_started_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const accountSnapshots = sqliteTable("account_snapshots", {
  id: text("id").primaryKey(),
  tradingAccountId: text("trading_account_id").notNull().references(() => tradingAccounts.id),
  connectorDeviceId: text("connector_device_id").notNull().references(() => connectorDevices.id),
  sequence: integer("sequence").notNull(),
  observedAt: text("observed_at").notNull(),
  balanceMinor: text("balance_minor").notNull(),
  equityMinor: text("equity_minor").notNull(),
  marginMinor: text("margin_minor").notNull(),
  freeMarginMinor: text("free_margin_minor").notNull(),
  floatingPnlMinor: text("floating_pnl_minor").notNull(),
  serverTime: text("server_time").notNull(),
  rawPayloadJson: text("raw_payload_json").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("snapshots_device_sequence_unique").on(table.connectorDeviceId, table.sequence), index("snapshots_account_observed_idx").on(table.tradingAccountId, table.observedAt)]);

export const accountRiskStates = sqliteTable("account_risk_states", {
  tradingAccountId: text("trading_account_id").primaryKey().references(() => tradingAccounts.id),
  ruleVersionId: text("rule_version_id").notNull().references(() => ruleVersions.id),
  resetKey: text("reset_key").notNull(),
  initialBalanceMinor: text("initial_balance_minor").notNull(),
  startOfDayBalanceMinor: text("start_of_day_balance_minor").notNull(),
  startOfDayEquityMinor: text("start_of_day_equity_minor").notNull(),
  highestBalanceMinor: text("highest_balance_minor").notNull(),
  highestEquityMinor: text("highest_equity_minor").notNull(),
  endOfDayHighestBalanceMinor: text("end_of_day_highest_balance_minor").notNull(),
  endOfDayHighestEquityMinor: text("end_of_day_highest_equity_minor").notNull(),
  latestBalanceMinor: text("latest_balance_minor").notNull(),
  latestEquityMinor: text("latest_equity_minor").notNull(),
  lastSnapshotId: text("last_snapshot_id").notNull().references(() => accountSnapshots.id),
  stateVersion: integer("state_version").notNull().default(1),
  ...timestamps,
}, (table) => [index("risk_states_rule_reset_idx").on(table.ruleVersionId, table.resetKey)]);

export const riskCalculations = sqliteTable("risk_calculations", {
  id: text("id").primaryKey(),
  tradingAccountId: text("trading_account_id").notNull().references(() => tradingAccounts.id),
  accountSnapshotId: text("account_snapshot_id").notNull().references(() => accountSnapshots.id),
  ruleVersionId: text("rule_version_id").notNull().references(() => ruleVersions.id),
  engineVersion: text("engine_version").notNull(),
  explanationVersion: text("explanation_version").notNull(),
  status: text("status").notNull(),
  inputJson: text("input_json").notNull(),
  intermediateJson: text("intermediate_json").notNull(),
  outputJson: text("output_json").notNull(),
  explanationJson: text("explanation_json").notNull(),
  calculatedAt: text("calculated_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("risk_calculations_snapshot_rule_engine_unique").on(table.accountSnapshotId, table.ruleVersionId, table.engineVersion),
  index("risk_calculations_account_time_idx").on(table.tradingAccountId, table.calculatedAt),
]);

export const positions = sqliteTable("positions", {
  id: text("id").primaryKey(),
  tradingAccountId: text("trading_account_id").notNull().references(() => tradingAccounts.id),
  ticket: text("ticket").notNull(),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(),
  volumeUnits: text("volume_units").notNull(),
  openPricePoints: text("open_price_points").notNull(),
  currentPricePoints: text("current_price_points").notNull(),
  stopLossPricePoints: text("stop_loss_price_points"),
  takeProfitPricePoints: text("take_profit_price_points"),
  priceDigits: integer("price_digits"),
  tickSizePoints: text("tick_size_points"),
  tickValueLossMinorPerLot: text("tick_value_loss_minor_per_lot"),
  swapMinor: text("swap_minor"),
  floatingPnlMinor: text("floating_pnl_minor").notNull(),
  openedAt: text("opened_at").notNull(),
  closedAt: text("closed_at"),
  ...timestamps,
}, (table) => [uniqueIndex("positions_account_ticket_unique").on(table.tradingAccountId, table.ticket), index("positions_account_open_idx").on(table.tradingAccountId, table.closedAt)]);

export const pendingOrders = sqliteTable("pending_orders", {
  id: text("id").primaryKey(),
  tradingAccountId: text("trading_account_id").notNull().references(() => tradingAccounts.id),
  ticket: text("ticket").notNull(),
  symbol: text("symbol").notNull(),
  orderType: integer("order_type").notNull(),
  volumeInitialUnits: text("volume_initial_units").notNull(),
  volumeCurrentUnits: text("volume_current_units").notNull(),
  openPricePoints: text("open_price_points").notNull(),
  stopLossPricePoints: text("stop_loss_price_points"),
  takeProfitPricePoints: text("take_profit_price_points"),
  placedAt: text("placed_at").notNull(),
  expiresAt: text("expires_at"),
  closedAt: text("closed_at"),
  ...timestamps,
}, (table) => [uniqueIndex("pending_orders_account_ticket_unique").on(table.tradingAccountId, table.ticket), index("pending_orders_account_open_idx").on(table.tradingAccountId, table.closedAt)]);

export const deals = sqliteTable("deals", {
  id: text("id").primaryKey(),
  tradingAccountId: text("trading_account_id").notNull().references(() => tradingAccounts.id),
  connectorDeviceId: text("connector_device_id").notNull().references(() => connectorDevices.id),
  ticket: text("ticket").notNull(),
  orderTicket: text("order_ticket").notNull(),
  positionTicket: text("position_ticket").notNull(),
  symbol: text("symbol").notNull(),
  dealType: integer("deal_type").notNull(),
  entryType: integer("entry_type").notNull(),
  volumeUnits: text("volume_units").notNull(),
  pricePoints: text("price_points").notNull(),
  profitMinor: text("profit_minor").notNull(),
  commissionMinor: text("commission_minor").notNull(),
  swapMinor: text("swap_minor").notNull(),
  feeMinor: text("fee_minor").notNull(),
  occurredAt: text("occurred_at").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("deals_account_ticket_unique").on(table.tradingAccountId, table.ticket), index("deals_account_time_idx").on(table.tradingAccountId, table.occurredAt), index("deals_position_idx").on(table.tradingAccountId, table.positionTicket)]);

export const tradeEvents = sqliteTable("trade_events", {
  id: text("id").primaryKey(),
  tradingAccountId: text("trading_account_id").notNull().references(() => tradingAccounts.id),
  connectorDeviceId: text("connector_device_id").notNull().references(() => connectorDevices.id),
  idempotencyKey: text("idempotency_key").notNull(),
  sequence: integer("sequence").notNull(),
  eventType: text("event_type").notNull(),
  occurredAt: text("occurred_at").notNull(),
  payloadJson: text("payload_json").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("trade_events_device_idempotency_unique").on(table.connectorDeviceId, table.idempotencyKey), index("trade_events_account_time_idx").on(table.tradingAccountId, table.occurredAt)]);

export const dailyRiskPlans = sqliteTable("daily_risk_plans", {
  id: text("id").primaryKey(),
  tradingAccountId: text("trading_account_id").notNull().references(() => tradingAccounts.id),
  resetKey: text("reset_key").notNull(),
  version: integer("version").notNull().default(1),
  riskBudgetMinor: text("risk_budget_minor").notNull(),
  maxRiskPerTradeMinor: text("max_risk_per_trade_minor").notNull(),
  maxTrades: integer("max_trades").notNull(),
  lossStopMinor: text("loss_stop_minor").notNull(),
  profitLockMinor: text("profit_lock_minor").notNull(),
  preservationMode: text("preservation_mode").notNull().default("off"),
  profitLockTriggeredAt: text("profit_lock_triggered_at"),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  ...timestamps,
}, (table) => [uniqueIndex("daily_risk_plans_account_reset_unique").on(table.tradingAccountId, table.resetKey), index("daily_risk_plans_account_reset_idx").on(table.tradingAccountId, table.resetKey)]);

export const economicEvents = sqliteTable("economic_events", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  externalId: text("external_id").notNull(),
  title: text("title").notNull(),
  currency: text("currency").notNull(),
  impact: text("impact").notNull(),
  scheduledAt: text("scheduled_at").notNull(),
  forecast: text("forecast"),
  previous: text("previous"),
  revisionHash: text("revision_hash").notNull(),
  rawJson: text("raw_json").notNull(),
  fetchedAt: text("fetched_at").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("economic_events_provider_external_unique").on(table.provider, table.externalId), index("economic_events_time_currency_idx").on(table.scheduledAt, table.currency)]);

export const economicEventRevisions = sqliteTable("economic_event_revisions", {
  id: text("id").primaryKey(),
  economicEventId: text("economic_event_id").notNull().references(() => economicEvents.id),
  revisionHash: text("revision_hash").notNull(),
  rawJson: text("raw_json").notNull(),
  observedAt: text("observed_at").notNull(),
}, (table) => [uniqueIndex("economic_event_revisions_event_hash_unique").on(table.economicEventId, table.revisionHash)]);

export const calendarSyncStates = sqliteTable("calendar_sync_states", {
  provider: text("provider").primaryKey(),
  status: text("status").notNull(),
  fetchedAt: text("fetched_at"),
  coveredThrough: text("covered_through"),
  error: text("error"),
  updatedAt: text("updated_at").notNull(),
});

export const alerts = sqliteTable("alerts", {
  id: text("id").primaryKey(),
  tradingAccountId: text("trading_account_id").notNull().references(() => tradingAccounts.id),
  severity: text("severity").notNull(),
  alertType: text("alert_type").notNull(),
  title: text("title").notNull(),
  evidenceJson: text("evidence_json").notNull(),
  deduplicationKey: text("deduplication_key").notNull(),
  acknowledgedAt: text("acknowledged_at"),
  acknowledgedByUserId: text("acknowledged_by_user_id").references(() => users.id),
  resolvedAt: text("resolved_at"),
  resolvedByUserId: text("resolved_by_user_id").references(() => users.id),
  dismissedAt: text("dismissed_at"),
  dismissedByUserId: text("dismissed_by_user_id").references(() => users.id),
  resolutionReason: text("resolution_reason"),
  ...timestamps,
}, (table) => [index("alerts_account_created_idx").on(table.tradingAccountId, table.createdAt), uniqueIndex("alerts_dedupe_unique").on(table.deduplicationKey)]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  tradingAccountId: text("trading_account_id").references(() => tradingAccounts.id),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id").notNull(),
  eventType: text("event_type").notNull(),
  occurredAt: text("occurred_at").notNull(),
  correlationId: text("correlation_id").notNull(),
  payloadJson: text("payload_json").notNull(),
  previousHash: text("previous_hash"),
  eventHash: text("event_hash").notNull(),
}, (table) => [index("audit_org_time_idx").on(table.organizationId, table.occurredAt), index("audit_account_time_idx").on(table.tradingAccountId, table.occurredAt)]);
