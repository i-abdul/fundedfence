CREATE TABLE `daily_risk_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`trading_account_id` text NOT NULL,
	`reset_key` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`risk_budget_minor` text NOT NULL,
	`max_risk_per_trade_minor` text NOT NULL,
	`max_trades` integer NOT NULL,
	`loss_stop_minor` text NOT NULL,
	`profit_lock_minor` text NOT NULL,
	`preservation_mode` text DEFAULT 'off' NOT NULL,
	`profit_lock_triggered_at` text,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trading_account_id`) REFERENCES `trading_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_risk_plans_account_reset_unique` ON `daily_risk_plans` (`trading_account_id`,`reset_key`);--> statement-breakpoint
CREATE INDEX `daily_risk_plans_account_reset_idx` ON `daily_risk_plans` (`trading_account_id`,`reset_key`);--> statement-breakpoint
ALTER TABLE `alerts` ADD `acknowledged_by_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `alerts` ADD `resolved_at` text;--> statement-breakpoint
ALTER TABLE `alerts` ADD `resolved_by_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `alerts` ADD `dismissed_at` text;--> statement-breakpoint
ALTER TABLE `alerts` ADD `dismissed_by_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `alerts` ADD `resolution_reason` text;