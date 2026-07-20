CREATE TABLE `economic_event_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`economic_event_id` text NOT NULL,
	`revision_hash` text NOT NULL,
	`raw_json` text NOT NULL,
	`observed_at` text NOT NULL,
	FOREIGN KEY (`economic_event_id`) REFERENCES `economic_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `economic_event_revisions_event_hash_unique` ON `economic_event_revisions` (`economic_event_id`,`revision_hash`);