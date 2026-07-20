CREATE TABLE IF NOT EXISTS organizations (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  email text NOT NULL UNIQUE,
  display_name text,
  password_hash text,
  google_subject text UNIQUE,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS users_org_idx ON users (organization_id);

CREATE TABLE IF NOT EXISTS prop_firms (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft',
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS prop_firm_programs (
  id text PRIMARY KEY,
  prop_firm_id text NOT NULL REFERENCES prop_firms(id),
  name text NOT NULL,
  program_code text NOT NULL,
  phase text NOT NULL,
  market text NOT NULL DEFAULT 'CFDs',
  status text NOT NULL DEFAULT 'draft',
  platform text NOT NULL DEFAULT 'MT5',
  account_currency text NOT NULL DEFAULT 'USD',
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS programs_firm_idx ON prop_firm_programs (prop_firm_id);
ALTER TABLE prop_firm_programs ADD COLUMN IF NOT EXISTS program_code text;
ALTER TABLE prop_firm_programs ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'CFDs';
ALTER TABLE prop_firm_programs ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS programs_code_phase_unique ON prop_firm_programs (prop_firm_id, program_code, phase);

CREATE TABLE IF NOT EXISTS rule_sets (
  id text PRIMARY KEY,
  program_id text NOT NULL REFERENCES prop_firm_programs(id),
  account_size_minor text NOT NULL,
  active_version_id text,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS rule_sets_program_size_idx ON rule_sets (program_id, account_size_minor);

CREATE TABLE IF NOT EXISTS rule_versions (
  id text PRIMARY KEY,
  rule_set_id text NOT NULL REFERENCES rule_sets(id),
  version integer NOT NULL,
  effective_at text NOT NULL,
  expires_at text,
  verification_status text NOT NULL DEFAULT 'draft',
  definition_json text NOT NULL,
  content_hash text NOT NULL,
  interpretation_notes text NOT NULL DEFAULT '',
  created_by_user_id text REFERENCES users(id),
  validated_by_user_id text REFERENCES users(id),
  reviewed_by_user_id text REFERENCES users(id),
  activated_by_user_id text REFERENCES users(id),
  approved_by_user_id text REFERENCES users(id),
  activated_at text,
  superseded_at text,
  rollback_of_version_id text,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  UNIQUE (rule_set_id, version)
);

ALTER TABLE rule_versions ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE rule_versions ADD COLUMN IF NOT EXISTS interpretation_notes text NOT NULL DEFAULT '';
ALTER TABLE rule_versions ADD COLUMN IF NOT EXISTS created_by_user_id text REFERENCES users(id);
ALTER TABLE rule_versions ADD COLUMN IF NOT EXISTS validated_by_user_id text REFERENCES users(id);
ALTER TABLE rule_versions ADD COLUMN IF NOT EXISTS reviewed_by_user_id text REFERENCES users(id);
ALTER TABLE rule_versions ADD COLUMN IF NOT EXISTS activated_by_user_id text REFERENCES users(id);
ALTER TABLE rule_versions ADD COLUMN IF NOT EXISTS activated_at text;
ALTER TABLE rule_versions ADD COLUMN IF NOT EXISTS superseded_at text;
ALTER TABLE rule_versions ADD COLUMN IF NOT EXISTS rollback_of_version_id text;

CREATE TABLE IF NOT EXISTS rule_sources (
  id text PRIMARY KEY,
  rule_version_id text NOT NULL REFERENCES rule_versions(id),
  source_type text NOT NULL,
  authority_class text NOT NULL DEFAULT 'confirmed-rule',
  title text NOT NULL,
  url text NOT NULL,
  captured_at text NOT NULL,
  content_hash text NOT NULL,
  evidence_json text NOT NULL DEFAULT '{}',
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS rule_sources_version_idx ON rule_sources (rule_version_id);
ALTER TABLE rule_sources ADD COLUMN IF NOT EXISTS authority_class text NOT NULL DEFAULT 'confirmed-rule';
ALTER TABLE rule_sources ADD COLUMN IF NOT EXISTS evidence_json text NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS rule_version_transitions (
  id text PRIMARY KEY,
  rule_version_id text NOT NULL REFERENCES rule_versions(id),
  from_status text,
  to_status text NOT NULL,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  reason text NOT NULL,
  occurred_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS rule_transitions_version_time_idx ON rule_version_transitions (rule_version_id, occurred_at);

CREATE TABLE IF NOT EXISTS trading_accounts (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  owner_user_id text NOT NULL REFERENCES users(id),
  program_id text REFERENCES prop_firm_programs(id),
  rule_version_id text REFERENCES rule_versions(id),
  label text NOT NULL,
  account_size_minor text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  hashed_login text,
  server_identity text,
  status text NOT NULL DEFAULT 'pairing',
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS trading_accounts_owner_idx ON trading_accounts (owner_user_id);
CREATE INDEX IF NOT EXISTS trading_accounts_org_idx ON trading_accounts (organization_id);

CREATE TABLE IF NOT EXISTS rule_recalculation_jobs (
  id text PRIMARY KEY,
  trading_account_id text NOT NULL REFERENCES trading_accounts(id),
  from_rule_version_id text,
  to_rule_version_id text NOT NULL REFERENCES rule_versions(id),
  status text NOT NULL DEFAULT 'pending',
  reason text NOT NULL,
  requested_at text NOT NULL,
  completed_at text,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  UNIQUE (trading_account_id, to_rule_version_id)
);

CREATE INDEX IF NOT EXISTS rule_recalc_account_status_idx ON rule_recalculation_jobs (trading_account_id, status);

CREATE TABLE IF NOT EXISTS account_connections (
  id text PRIMARY KEY,
  trading_account_id text NOT NULL UNIQUE REFERENCES trading_accounts(id),
  state text NOT NULL DEFAULT 'offline',
  last_heartbeat_at text,
  last_snapshot_at text,
  last_trade_event_at text,
  connector_version text,
  risk_calculated_at text,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS connector_devices (
  id text PRIMARY KEY,
  trading_account_id text NOT NULL REFERENCES trading_accounts(id),
  pairing_code_id text,
  token_fingerprint text NOT NULL,
  last_sequence integer NOT NULL DEFAULT 0,
  connector_version text NOT NULL,
  platform_version text NOT NULL,
  revoked_at text,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS connector_devices_account_idx ON connector_devices (trading_account_id);

CREATE TABLE IF NOT EXISTS pairing_codes (
  id text PRIMARY KEY,
  trading_account_id text NOT NULL REFERENCES trading_accounts(id),
  owner_user_id text NOT NULL REFERENCES users(id),
  code_hash text NOT NULL UNIQUE,
  expires_at text NOT NULL,
  used_at text,
  attempts_remaining integer NOT NULL DEFAULT 5,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS pairing_codes_owner_idx ON pairing_codes (owner_user_id);

ALTER TABLE connector_devices ADD COLUMN IF NOT EXISTS pairing_code_id text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'connector_devices_pairing_code_fk' AND conrelid = 'connector_devices'::regclass) THEN
    ALTER TABLE connector_devices ADD CONSTRAINT connector_devices_pairing_code_fk FOREIGN KEY (pairing_code_id) REFERENCES pairing_codes(id);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'connector_devices_pairing_code_fk' AND conrelid = 'connector_devices'::regclass)
     AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'connector_devices_pairing_code_id_fkey' AND conrelid = 'connector_devices'::regclass) THEN
    ALTER TABLE connector_devices DROP CONSTRAINT connector_devices_pairing_code_id_fkey;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS connector_devices_pairing_code_unique ON connector_devices (pairing_code_id);

CREATE TABLE IF NOT EXISTS pairing_rate_limits (
  key_hash text PRIMARY KEY,
  window_started_at text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  updated_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS account_snapshots (
  id text PRIMARY KEY,
  trading_account_id text NOT NULL REFERENCES trading_accounts(id),
  connector_device_id text NOT NULL REFERENCES connector_devices(id),
  sequence integer NOT NULL,
  observed_at text NOT NULL,
  balance_minor text NOT NULL,
  equity_minor text NOT NULL,
  margin_minor text NOT NULL,
  free_margin_minor text NOT NULL,
  floating_pnl_minor text NOT NULL,
  server_time text NOT NULL,
  raw_payload_json text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  UNIQUE (connector_device_id, sequence)
);

CREATE INDEX IF NOT EXISTS snapshots_account_observed_idx ON account_snapshots (trading_account_id, observed_at);

CREATE TABLE IF NOT EXISTS account_risk_states (
  trading_account_id text PRIMARY KEY REFERENCES trading_accounts(id),
  rule_version_id text NOT NULL REFERENCES rule_versions(id),
  reset_key text NOT NULL,
  initial_balance_minor text NOT NULL,
  start_of_day_balance_minor text NOT NULL,
  start_of_day_equity_minor text NOT NULL,
  highest_balance_minor text NOT NULL,
  highest_equity_minor text NOT NULL,
  end_of_day_highest_balance_minor text NOT NULL,
  end_of_day_highest_equity_minor text NOT NULL,
  latest_balance_minor text NOT NULL,
  latest_equity_minor text NOT NULL,
  last_snapshot_id text NOT NULL REFERENCES account_snapshots(id),
  state_version integer NOT NULL DEFAULT 1,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS risk_states_rule_reset_idx ON account_risk_states (rule_version_id, reset_key);

CREATE TABLE IF NOT EXISTS risk_calculations (
  id text PRIMARY KEY,
  trading_account_id text NOT NULL REFERENCES trading_accounts(id),
  account_snapshot_id text NOT NULL REFERENCES account_snapshots(id),
  rule_version_id text NOT NULL REFERENCES rule_versions(id),
  engine_version text NOT NULL,
  explanation_version text NOT NULL,
  status text NOT NULL,
  input_json text NOT NULL,
  intermediate_json text NOT NULL,
  output_json text NOT NULL,
  explanation_json text NOT NULL,
  calculated_at text NOT NULL,
  created_at text NOT NULL,
  UNIQUE (account_snapshot_id, rule_version_id, engine_version)
);

CREATE INDEX IF NOT EXISTS risk_calculations_account_time_idx ON risk_calculations (trading_account_id, calculated_at);

CREATE TABLE IF NOT EXISTS positions (
  id text PRIMARY KEY,
  trading_account_id text NOT NULL REFERENCES trading_accounts(id),
  ticket text NOT NULL,
  symbol text NOT NULL,
  direction text NOT NULL,
  volume_units text NOT NULL,
  open_price_points text NOT NULL,
  current_price_points text NOT NULL,
  stop_loss_price_points text,
  take_profit_price_points text,
  price_digits integer,
  tick_size_points text,
  tick_value_loss_minor_per_lot text,
  swap_minor text,
  floating_pnl_minor text NOT NULL,
  opened_at text NOT NULL,
  closed_at text,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  UNIQUE (trading_account_id, ticket)
);

CREATE INDEX IF NOT EXISTS positions_account_open_idx ON positions (trading_account_id, closed_at);

ALTER TABLE positions ADD COLUMN IF NOT EXISTS price_digits integer;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS tick_size_points text;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS tick_value_loss_minor_per_lot text;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS swap_minor text;

CREATE TABLE IF NOT EXISTS pending_orders (
  id text PRIMARY KEY,
  trading_account_id text NOT NULL REFERENCES trading_accounts(id),
  ticket text NOT NULL,
  symbol text NOT NULL,
  order_type integer NOT NULL,
  volume_initial_units text NOT NULL,
  volume_current_units text NOT NULL,
  open_price_points text NOT NULL,
  stop_loss_price_points text,
  take_profit_price_points text,
  placed_at text NOT NULL,
  expires_at text,
  closed_at text,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  UNIQUE (trading_account_id, ticket)
);

CREATE INDEX IF NOT EXISTS pending_orders_account_open_idx ON pending_orders (trading_account_id, closed_at);

CREATE TABLE IF NOT EXISTS deals (
  id text PRIMARY KEY,
  trading_account_id text NOT NULL REFERENCES trading_accounts(id),
  connector_device_id text NOT NULL REFERENCES connector_devices(id),
  ticket text NOT NULL,
  order_ticket text NOT NULL,
  position_ticket text NOT NULL,
  symbol text NOT NULL,
  deal_type integer NOT NULL,
  entry_type integer NOT NULL,
  volume_units text NOT NULL,
  price_points text NOT NULL,
  profit_minor text NOT NULL,
  commission_minor text NOT NULL,
  swap_minor text NOT NULL,
  fee_minor text NOT NULL,
  occurred_at text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  UNIQUE (trading_account_id, ticket)
);

CREATE INDEX IF NOT EXISTS deals_account_time_idx ON deals (trading_account_id, occurred_at);
CREATE INDEX IF NOT EXISTS deals_position_idx ON deals (trading_account_id, position_ticket);

CREATE TABLE IF NOT EXISTS trade_events (
  id text PRIMARY KEY,
  trading_account_id text NOT NULL REFERENCES trading_accounts(id),
  connector_device_id text NOT NULL REFERENCES connector_devices(id),
  idempotency_key text NOT NULL,
  sequence integer NOT NULL,
  event_type text NOT NULL,
  occurred_at text NOT NULL,
  payload_json text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  UNIQUE (connector_device_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS trade_events_account_time_idx ON trade_events (trading_account_id, occurred_at);

CREATE TABLE IF NOT EXISTS daily_risk_plans (
  id text PRIMARY KEY,
  trading_account_id text NOT NULL REFERENCES trading_accounts(id),
  reset_key text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  risk_budget_minor text NOT NULL,
  max_risk_per_trade_minor text NOT NULL,
  max_trades integer NOT NULL,
  loss_stop_minor text NOT NULL,
  profit_lock_minor text NOT NULL,
  preservation_mode text NOT NULL DEFAULT 'off',
  profit_lock_triggered_at text,
  created_by_user_id text NOT NULL REFERENCES users(id),
  created_at text NOT NULL,
  updated_at text NOT NULL,
  UNIQUE (trading_account_id, reset_key)
);

CREATE INDEX IF NOT EXISTS daily_risk_plans_account_reset_idx ON daily_risk_plans (trading_account_id, reset_key);

CREATE TABLE IF NOT EXISTS economic_events (
  id text PRIMARY KEY,
  provider text NOT NULL,
  external_id text NOT NULL,
  title text NOT NULL,
  currency text NOT NULL,
  impact text NOT NULL,
  scheduled_at text NOT NULL,
  forecast text,
  previous text,
  revision_hash text NOT NULL,
  raw_json text NOT NULL,
  fetched_at text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS economic_events_time_currency_idx ON economic_events (scheduled_at, currency);

CREATE TABLE IF NOT EXISTS economic_event_revisions (
  id text PRIMARY KEY,
  economic_event_id text NOT NULL REFERENCES economic_events(id),
  revision_hash text NOT NULL,
  raw_json text NOT NULL,
  observed_at text NOT NULL,
  UNIQUE (economic_event_id, revision_hash)
);

CREATE TABLE IF NOT EXISTS calendar_sync_states (
  provider text PRIMARY KEY,
  status text NOT NULL,
  fetched_at text,
  covered_through text,
  error text,
  updated_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id text PRIMARY KEY,
  trading_account_id text NOT NULL REFERENCES trading_accounts(id),
  severity text NOT NULL,
  alert_type text NOT NULL,
  title text NOT NULL,
  evidence_json text NOT NULL,
  deduplication_key text NOT NULL UNIQUE,
  acknowledged_at text,
  acknowledged_by_user_id text REFERENCES users(id),
  resolved_at text,
  resolved_by_user_id text REFERENCES users(id),
  dismissed_at text,
  dismissed_by_user_id text REFERENCES users(id),
  resolution_reason text,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

ALTER TABLE alerts ADD COLUMN IF NOT EXISTS acknowledged_by_user_id text REFERENCES users(id);
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_at text;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_by_user_id text REFERENCES users(id);
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS dismissed_at text;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS dismissed_by_user_id text REFERENCES users(id);
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolution_reason text;

CREATE INDEX IF NOT EXISTS alerts_account_created_idx ON alerts (trading_account_id, created_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  trading_account_id text REFERENCES trading_accounts(id),
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  event_type text NOT NULL,
  occurred_at text NOT NULL,
  correlation_id text NOT NULL,
  payload_json text NOT NULL,
  previous_hash text,
  event_hash text NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_org_time_idx ON audit_events (organization_id, occurred_at);
CREATE INDEX IF NOT EXISTS audit_account_time_idx ON audit_events (trading_account_id, occurred_at);
