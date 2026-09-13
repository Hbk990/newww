CREATE TABLE `bundles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_bundles_owner` ON `bundles` (`owner`);--> statement-breakpoint
CREATE TABLE `storefront` (
	`owner` text PRIMARY KEY NOT NULL,
	`store_name` text NOT NULL,
	`tagline` text DEFAULT '' NOT NULL,
	`whatsapp` text NOT NULL,
	`instagram` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`hours` text DEFAULT '' NOT NULL,
	`announcement` text DEFAULT '' NOT NULL,
	`delivery_fee` real DEFAULT 0 NOT NULL,
	`free_delivery_over` real DEFAULT 0 NOT NULL,
	`published` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
