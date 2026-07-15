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
  ...timestamps,
}, (table) => [uniqueIndex("users_email_unique").on(table.email), index("users_org_idx").on(table.organizationId)]);

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
  phase: text("phase").notNull(),
  platform: text("platform").notNull().default("MT5"),
  accountCurrency: text("account_currency").notNull().default("USD"),
  ...timestamps,
}, (table) => [index("programs_firm_idx").on(table.propFirmId)]);

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
  approvedByUserId: text("approved_by_user_id").references(() => users.id),
  ...timestamps,
}, (table) => [uniqueIndex("rule_versions_set_version_unique").on(table.ruleSetId, table.version)]);

export const ruleSources = sqliteTable("rule_sources", {
  id: text("id").primaryKey(),
  ruleVersionId: text("rule_version_id").notNull().references(() => ruleVersions.id),
  sourceType: text("source_type").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  capturedAt: text("captured_at").notNull(),
  contentHash: text("content_hash").notNull(),
  ...timestamps,
}, (table) => [index("rule_sources_version_idx").on(table.ruleVersionId)]);

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

export const connectorDevices = sqliteTable("connector_devices", {
  id: text("id").primaryKey(),
  tradingAccountId: text("trading_account_id").notNull().references(() => tradingAccounts.id),
  tokenFingerprint: text("token_fingerprint").notNull(),
  lastSequence: integer("last_sequence").notNull().default(0),
  connectorVersion: text("connector_version").notNull(),
  platformVersion: text("platform_version").notNull(),
  revokedAt: text("revoked_at"),
  ...timestamps,
}, (table) => [index("connector_devices_account_idx").on(table.tradingAccountId)]);

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
  floatingPnlMinor: text("floating_pnl_minor").notNull(),
  openedAt: text("opened_at").notNull(),
  closedAt: text("closed_at"),
  ...timestamps,
}, (table) => [uniqueIndex("positions_account_ticket_unique").on(table.tradingAccountId, table.ticket), index("positions_account_open_idx").on(table.tradingAccountId, table.closedAt)]);

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

export const alerts = sqliteTable("alerts", {
  id: text("id").primaryKey(),
  tradingAccountId: text("trading_account_id").notNull().references(() => tradingAccounts.id),
  severity: text("severity").notNull(),
  alertType: text("alert_type").notNull(),
  title: text("title").notNull(),
  evidenceJson: text("evidence_json").notNull(),
  deduplicationKey: text("deduplication_key").notNull(),
  acknowledgedAt: text("acknowledged_at"),
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
