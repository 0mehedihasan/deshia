CREATE TABLE `source_image_duplicates` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`duplicate_of_image_id` text,
	`original_filename` text NOT NULL,
	`original_path` text NOT NULL,
	`extension` text NOT NULL,
	`detected_format` text NOT NULL,
	`mime_type` text NOT NULL,
	`color_mode` text,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`file_size` integer NOT NULL,
	`checksum` text NOT NULL,
	`modified_at` integer NOT NULL,
	`discovered_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`duplicate_of_image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `source_image_duplicates_workspace_idx` ON `source_image_duplicates` (`workspace_id`);
--> statement-breakpoint
CREATE INDEX `source_image_duplicates_checksum_idx` ON `source_image_duplicates` (`workspace_id`,`checksum`);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_image_duplicates_path_uq` ON `source_image_duplicates` (`workspace_id`,`original_path`);
