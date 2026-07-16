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
  phase text NOT NULL,
  platform text NOT NULL DEFAULT 'MT5',
  account_currency text NOT NULL DEFAULT 'USD',
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS programs_firm_idx ON prop_firm_programs (prop_firm_id);

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
  approved_by_user_id text REFERENCES users(id),
  created_at text NOT NULL,
  updated_at text NOT NULL,
  UNIQUE (rule_set_id, version)
);

CREATE TABLE IF NOT EXISTS rule_sources (
  id text PRIMARY KEY,
  rule_version_id text NOT NULL REFERENCES rule_versions(id),
  source_type text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  captured_at text NOT NULL,
  content_hash text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS rule_sources_version_idx ON rule_sources (rule_version_id);

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

CREATE TABLE IF NOT EXISTS alerts (
  id text PRIMARY KEY,
  trading_account_id text NOT NULL REFERENCES trading_accounts(id),
  severity text NOT NULL,
  alert_type text NOT NULL,
  title text NOT NULL,
  evidence_json text NOT NULL,
  deduplication_key text NOT NULL UNIQUE,
  acknowledged_at text,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

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
