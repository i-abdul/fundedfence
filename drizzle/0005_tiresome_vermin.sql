CREATE TABLE `account_risk_states` (
	`trading_account_id` text PRIMARY KEY NOT NULL,
	`rule_version_id` text NOT NULL,
	`reset_key` text NOT NULL,
	`initial_balance_minor` text NOT NULL,
	`start_of_day_balance_minor` text NOT NULL,
	`start_of_day_equity_minor` text NOT NULL,
	`highest_balance_minor` text NOT NULL,
	`highest_equity_minor` text NOT NULL,
	`end_of_day_highest_balance_minor` text NOT NULL,
	`end_of_day_highest_equity_minor` text NOT NULL,
	`latest_balance_minor` text NOT NULL,
	`latest_equity_minor` text NOT NULL,
	`last_snapshot_id` text NOT NULL,
	`state_version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trading_account_id`) REFERENCES `trading_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rule_version_id`) REFERENCES `rule_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`last_snapshot_id`) REFERENCES `account_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `risk_states_rule_reset_idx` ON `account_risk_states` (`rule_version_id`,`reset_key`);--> statement-breakpoint
CREATE TABLE `risk_calculations` (
	`id` text PRIMARY KEY NOT NULL,
	`trading_account_id` text NOT NULL,
	`account_snapshot_id` text NOT NULL,
	`rule_version_id` text NOT NULL,
	`engine_version` text NOT NULL,
	`explanation_version` text NOT NULL,
	`status` text NOT NULL,
	`input_json` text NOT NULL,
	`intermediate_json` text NOT NULL,
	`output_json` text NOT NULL,
	`explanation_json` text NOT NULL,
	`calculated_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`trading_account_id`) REFERENCES `trading_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_snapshot_id`) REFERENCES `account_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rule_version_id`) REFERENCES `rule_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `risk_calculations_snapshot_rule_engine_unique` ON `risk_calculations` (`account_snapshot_id`,`rule_version_id`,`engine_version`);--> statement-breakpoint
CREATE INDEX `risk_calculations_account_time_idx` ON `risk_calculations` (`trading_account_id`,`calculated_at`);