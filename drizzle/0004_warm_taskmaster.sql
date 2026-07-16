CREATE TABLE `rule_recalculation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`trading_account_id` text NOT NULL,
	`from_rule_version_id` text,
	`to_rule_version_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reason` text NOT NULL,
	`requested_at` text NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trading_account_id`) REFERENCES `trading_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_rule_version_id`) REFERENCES `rule_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rule_recalc_account_status_idx` ON `rule_recalculation_jobs` (`trading_account_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `rule_recalc_account_version_unique` ON `rule_recalculation_jobs` (`trading_account_id`,`to_rule_version_id`);--> statement-breakpoint
CREATE TABLE `rule_version_transitions` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_version_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text NOT NULL,
	`reason` text NOT NULL,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`rule_version_id`) REFERENCES `rule_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rule_transitions_version_time_idx` ON `rule_version_transitions` (`rule_version_id`,`occurred_at`);--> statement-breakpoint
ALTER TABLE `prop_firm_programs` ADD `program_code` text NOT NULL;--> statement-breakpoint
ALTER TABLE `prop_firm_programs` ADD `market` text DEFAULT 'CFDs' NOT NULL;--> statement-breakpoint
ALTER TABLE `prop_firm_programs` ADD `status` text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `programs_code_phase_unique` ON `prop_firm_programs` (`prop_firm_id`,`program_code`,`phase`);--> statement-breakpoint
ALTER TABLE `rule_sources` ADD `authority_class` text DEFAULT 'confirmed-rule' NOT NULL;--> statement-breakpoint
ALTER TABLE `rule_sources` ADD `evidence_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `rule_versions` ADD `content_hash` text NOT NULL;--> statement-breakpoint
ALTER TABLE `rule_versions` ADD `interpretation_notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `rule_versions` ADD `created_by_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `rule_versions` ADD `validated_by_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `rule_versions` ADD `reviewed_by_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `rule_versions` ADD `activated_by_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `rule_versions` ADD `activated_at` text;--> statement-breakpoint
ALTER TABLE `rule_versions` ADD `superseded_at` text;--> statement-breakpoint
ALTER TABLE `rule_versions` ADD `rollback_of_version_id` text;