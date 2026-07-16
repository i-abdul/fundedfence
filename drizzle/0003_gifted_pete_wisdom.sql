CREATE TABLE `deals` (
	`id` text PRIMARY KEY NOT NULL,
	`trading_account_id` text NOT NULL,
	`connector_device_id` text NOT NULL,
	`ticket` text NOT NULL,
	`order_ticket` text NOT NULL,
	`position_ticket` text NOT NULL,
	`symbol` text NOT NULL,
	`deal_type` integer NOT NULL,
	`entry_type` integer NOT NULL,
	`volume_units` text NOT NULL,
	`price_points` text NOT NULL,
	`profit_minor` text NOT NULL,
	`commission_minor` text NOT NULL,
	`swap_minor` text NOT NULL,
	`fee_minor` text NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trading_account_id`) REFERENCES `trading_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connector_device_id`) REFERENCES `connector_devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deals_account_ticket_unique` ON `deals` (`trading_account_id`,`ticket`);--> statement-breakpoint
CREATE INDEX `deals_account_time_idx` ON `deals` (`trading_account_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `deals_position_idx` ON `deals` (`trading_account_id`,`position_ticket`);--> statement-breakpoint
CREATE TABLE `pending_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`trading_account_id` text NOT NULL,
	`ticket` text NOT NULL,
	`symbol` text NOT NULL,
	`order_type` integer NOT NULL,
	`volume_initial_units` text NOT NULL,
	`volume_current_units` text NOT NULL,
	`open_price_points` text NOT NULL,
	`stop_loss_price_points` text,
	`take_profit_price_points` text,
	`placed_at` text NOT NULL,
	`expires_at` text,
	`closed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trading_account_id`) REFERENCES `trading_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pending_orders_account_ticket_unique` ON `pending_orders` (`trading_account_id`,`ticket`);--> statement-breakpoint
CREATE INDEX `pending_orders_account_open_idx` ON `pending_orders` (`trading_account_id`,`closed_at`);