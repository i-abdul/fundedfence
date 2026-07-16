ALTER TABLE `positions` ADD `price_digits` integer;--> statement-breakpoint
ALTER TABLE `positions` ADD `tick_size_points` text;--> statement-breakpoint
ALTER TABLE `positions` ADD `tick_value_loss_minor_per_lot` text;--> statement-breakpoint
ALTER TABLE `positions` ADD `swap_minor` text;--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `google_subject` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_subject_unique` ON `users` (`google_subject`);