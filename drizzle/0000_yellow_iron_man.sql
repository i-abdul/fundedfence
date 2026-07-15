CREATE TABLE `account_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`trading_account_id` text NOT NULL,
	`state` text DEFAULT 'offline' NOT NULL,
	`last_heartbeat_at` text,
	`last_snapshot_at` text,
	`last_trade_event_at` text,
	`connector_version` text,
	`risk_calculated_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trading_account_id`) REFERENCES `trading_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_connections_account_unique` ON `account_connections` (`trading_account_id`);--> statement-breakpoint
CREATE TABLE `account_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`trading_account_id` text NOT NULL,
	`connector_device_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`observed_at` text NOT NULL,
	`balance_minor` text NOT NULL,
	`equity_minor` text NOT NULL,
	`margin_minor` text NOT NULL,
	`free_margin_minor` text NOT NULL,
	`floating_pnl_minor` text NOT NULL,
	`server_time` text NOT NULL,
	`raw_payload_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trading_account_id`) REFERENCES `trading_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connector_device_id`) REFERENCES `connector_devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_device_sequence_unique` ON `account_snapshots` (`connector_device_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `snapshots_account_observed_idx` ON `account_snapshots` (`trading_account_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`trading_account_id` text NOT NULL,
	`severity` text NOT NULL,
	`alert_type` text NOT NULL,
	`title` text NOT NULL,
	`evidence_json` text NOT NULL,
	`deduplication_key` text NOT NULL,
	`acknowledged_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trading_account_id`) REFERENCES `trading_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `alerts_account_created_idx` ON `alerts` (`trading_account_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `alerts_dedupe_unique` ON `alerts` (`deduplication_key`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`trading_account_id` text,
	`actor_type` text NOT NULL,
	`actor_id` text NOT NULL,
	`event_type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`correlation_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`previous_hash` text,
	`event_hash` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trading_account_id`) REFERENCES `trading_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_org_time_idx` ON `audit_events` (`organization_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_account_time_idx` ON `audit_events` (`trading_account_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `connector_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`trading_account_id` text NOT NULL,
	`token_fingerprint` text NOT NULL,
	`last_sequence` integer DEFAULT 0 NOT NULL,
	`connector_version` text NOT NULL,
	`platform_version` text NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trading_account_id`) REFERENCES `trading_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `connector_devices_account_idx` ON `connector_devices` (`trading_account_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pairing_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`trading_account_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`attempts_remaining` integer DEFAULT 5 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trading_account_id`) REFERENCES `trading_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pairing_codes_hash_unique` ON `pairing_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `pairing_codes_owner_idx` ON `pairing_codes` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `pairing_rate_limits` (
	`key_hash` text PRIMARY KEY NOT NULL,
	`window_started_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `positions` (
	`id` text PRIMARY KEY NOT NULL,
	`trading_account_id` text NOT NULL,
	`ticket` text NOT NULL,
	`symbol` text NOT NULL,
	`direction` text NOT NULL,
	`volume_units` text NOT NULL,
	`open_price_points` text NOT NULL,
	`current_price_points` text NOT NULL,
	`stop_loss_price_points` text,
	`take_profit_price_points` text,
	`floating_pnl_minor` text NOT NULL,
	`opened_at` text NOT NULL,
	`closed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trading_account_id`) REFERENCES `trading_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `positions_account_ticket_unique` ON `positions` (`trading_account_id`,`ticket`);--> statement-breakpoint
CREATE INDEX `positions_account_open_idx` ON `positions` (`trading_account_id`,`closed_at`);--> statement-breakpoint
CREATE TABLE `prop_firm_programs` (
	`id` text PRIMARY KEY NOT NULL,
	`prop_firm_id` text NOT NULL,
	`name` text NOT NULL,
	`phase` text NOT NULL,
	`platform` text DEFAULT 'MT5' NOT NULL,
	`account_currency` text DEFAULT 'USD' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`prop_firm_id`) REFERENCES `prop_firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `programs_firm_idx` ON `prop_firm_programs` (`prop_firm_id`);--> statement-breakpoint
CREATE TABLE `prop_firms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prop_firms_name_unique` ON `prop_firms` (`name`);--> statement-breakpoint
CREATE TABLE `rule_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`program_id` text NOT NULL,
	`account_size_minor` text NOT NULL,
	`active_version_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `prop_firm_programs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rule_sets_program_size_idx` ON `rule_sets` (`program_id`,`account_size_minor`);--> statement-breakpoint
CREATE TABLE `rule_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_version_id` text NOT NULL,
	`source_type` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`captured_at` text NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`rule_version_id`) REFERENCES `rule_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rule_sources_version_idx` ON `rule_sources` (`rule_version_id`);--> statement-breakpoint
CREATE TABLE `rule_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_set_id` text NOT NULL,
	`version` integer NOT NULL,
	`effective_at` text NOT NULL,
	`expires_at` text,
	`verification_status` text DEFAULT 'draft' NOT NULL,
	`definition_json` text NOT NULL,
	`approved_by_user_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`rule_set_id`) REFERENCES `rule_sets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_versions_set_version_unique` ON `rule_versions` (`rule_set_id`,`version`);--> statement-breakpoint
CREATE TABLE `trade_events` (
	`id` text PRIMARY KEY NOT NULL,
	`trading_account_id` text NOT NULL,
	`connector_device_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`sequence` integer NOT NULL,
	`event_type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trading_account_id`) REFERENCES `trading_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connector_device_id`) REFERENCES `connector_devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trade_events_device_idempotency_unique` ON `trade_events` (`connector_device_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `trade_events_account_time_idx` ON `trade_events` (`trading_account_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `trading_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`program_id` text,
	`rule_version_id` text,
	`label` text NOT NULL,
	`account_size_minor` text NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`hashed_login` text,
	`server_identity` text,
	`status` text DEFAULT 'pairing' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`program_id`) REFERENCES `prop_firm_programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rule_version_id`) REFERENCES `rule_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `trading_accounts_owner_idx` ON `trading_accounts` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `trading_accounts_org_idx` ON `trading_accounts` (`organization_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_org_idx` ON `users` (`organization_id`);