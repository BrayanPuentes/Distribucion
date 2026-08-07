CREATE TABLE `app_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`action` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`actor` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `history_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`effective_at` text NOT NULL,
	`shift` text NOT NULL,
	`task` text NOT NULL,
	`analyst` text NOT NULL,
	`group_name` text NOT NULL,
	`event` text NOT NULL,
	`version` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `history_effective_idx` ON `history_events` (`effective_at`);--> statement-breakpoint
CREATE INDEX `history_task_idx` ON `history_events` (`task`);--> statement-breakpoint
CREATE INDEX `history_analyst_idx` ON `history_events` (`analyst`);--> statement-breakpoint
CREATE TABLE `system_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` text NOT NULL,
	`module` text NOT NULL,
	`action` text NOT NULL,
	`message` text NOT NULL,
	`actor` text DEFAULT '' NOT NULL,
	`request_id` text DEFAULT '' NOT NULL,
	`context` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `system_logs_created_idx` ON `system_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `system_logs_level_idx` ON `system_logs` (`level`);--> statement-breakpoint
CREATE INDEX `system_logs_module_idx` ON `system_logs` (`module`);