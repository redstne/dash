CREATE TABLE `server_plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text,
	`version` text,
	`download_url` text NOT NULL,
	`filename` text NOT NULL,
	`source` text DEFAULT 'url' NOT NULL,
	`installed_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade
);
