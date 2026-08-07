CREATE TABLE `published_distributions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`effective_at` text NOT NULL,
	`shift` text NOT NULL,
	`snapshot` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`is_current` integer DEFAULT false NOT NULL,
	`archived_at` text,
	`archived_by` text,
	`archive_reason` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `published_status_idx` ON `published_distributions` (`status`,`effective_at`);--> statement-breakpoint
ALTER TABLE `history_events` ADD `distribution_id` integer;--> statement-breakpoint
CREATE INDEX `history_distribution_idx` ON `history_events` (`distribution_id`);