ALTER TABLE `images` ADD `detected_format` text;
--> statement-breakpoint
ALTER TABLE `images` ADD `mime_type` text;
--> statement-breakpoint
ALTER TABLE `images` ADD `color_mode` text;
--> statement-breakpoint
ALTER TABLE `images` ADD `metadata_status` text DEFAULT 'PENDING' NOT NULL;
--> statement-breakpoint
ALTER TABLE `images` ADD `metadata_error` text;
--> statement-breakpoint
CREATE INDEX `images_metadata_status_idx` ON `images` (`workspace_id`,`metadata_status`,`dataset_index`);
