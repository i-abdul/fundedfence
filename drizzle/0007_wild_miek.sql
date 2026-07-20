CREATE TABLE `calendar_sync_states` (
	`provider` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`fetched_at` text,
	`covered_through` text,
	`error` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `economic_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`currency` text NOT NULL,
	`impact` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`forecast` text,
	`previous` text,
	`revision_hash` text NOT NULL,
	`raw_json` text NOT NULL,
	`fetched_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `economic_events_provider_external_unique` ON `economic_events` (`provider`,`external_id`);--> statement-breakpoint
CREATE INDEX `economic_events_time_currency_idx` ON `economic_events` (`scheduled_at`,`currency`);