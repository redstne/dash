CREATE TABLE IF NOT EXISTS `backup_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`name` text NOT NULL,
	`storage_type` text NOT NULL,
	`config_encrypted` blob NOT NULL,
	`schedule` text NOT NULL DEFAULT 'manual',
	`retention_count` integer NOT NULL DEFAULT 7,
	`enabled` integer NOT NULL DEFAULT 1,
	`last_run_at` integer,
	`created_at` integer NOT NULL DEFAULT (unixepoch()),
	`updated_at` integer NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `backup_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`config_id` text,
	`config_name` text,
	`status` text NOT NULL,
	`started_at` integer NOT NULL DEFAULT (unixepoch()),
	`finished_at` integer,
	`size_bytes` integer,
	`filename` text,
	`local_path` text,
	`error` text,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON DELETE CASCADE,
	FOREIGN KEY (`config_id`) REFERENCES `backup_configs`(`id`) ON DELETE SET NULL
);
