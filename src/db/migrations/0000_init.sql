CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`source_dir` text NOT NULL,
	`output_dir` text NOT NULL,
	`schema_id` text NOT NULL,
	`schema_version` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `images` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`dataset_index` integer NOT NULL,
	`original_filename` text NOT NULL,
	`original_path` text NOT NULL,
	`extension` text NOT NULL,
	`file_size` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`checksum` text NOT NULL,
	`modified_at` integer NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`is_duplicate` integer DEFAULT false NOT NULL,
	`duplicate_of_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `images_workspace_idx` ON `images` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `images_status_idx` ON `images` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `images_checksum_idx` ON `images` (`workspace_id`,`checksum`);--> statement-breakpoint
CREATE UNIQUE INDEX `images_dataset_index_uq` ON `images` (`workspace_id`,`dataset_index`);--> statement-breakpoint
CREATE TABLE `annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`image_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`class_key` text,
	`view_key` text,
	`schema_id` text NOT NULL,
	`schema_version` integer NOT NULL,
	`annotation_version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`component_visibility` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `annotations_image_uq` ON `annotations` (`image_id`);--> statement-breakpoint
CREATE INDEX `annotations_workspace_idx` ON `annotations` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `annotations_status_idx` ON `annotations` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `bounding_boxes` (
	`id` text PRIMARY KEY NOT NULL,
	`annotation_id` text NOT NULL,
	`component_key` text NOT NULL,
	`x_min` real NOT NULL,
	`y_min` real NOT NULL,
	`x_max` real NOT NULL,
	`y_max` real NOT NULL,
	`visibility` text DEFAULT 'VISIBLE' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`annotation_id`) REFERENCES `annotations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `boxes_annotation_idx` ON `bounding_boxes` (`annotation_id`);--> statement-breakpoint
CREATE INDEX `boxes_component_idx` ON `bounding_boxes` (`annotation_id`,`component_key`);--> statement-breakpoint
CREATE TABLE `annotation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`image_id` text NOT NULL,
	`annotation_id` text,
	`kind` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_image_idx` ON `annotation_events` (`image_id`);--> statement-breakpoint
CREATE INDEX `events_kind_idx` ON `annotation_events` (`kind`);--> statement-breakpoint
CREATE TABLE `export_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`image_id` text,
	`format` text DEFAULT 'PASCAL_VOC' NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`outputs` text DEFAULT '[]' NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `export_jobs_workspace_idx` ON `export_jobs` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `export_jobs_image_idx` ON `export_jobs` (`image_id`);
