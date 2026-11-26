CREATE TABLE `annotation_objects` (
	`id` text PRIMARY KEY NOT NULL,
	`image_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`schema_id` text NOT NULL,
	`schema_version` integer NOT NULL,
	`label_id` text NOT NULL,
	`label_name` text NOT NULL,
	`geometry_type` text NOT NULL,
	`geometry_json` text NOT NULL,
	`attributes_json` text NOT NULL DEFAULT '{}',
	`occluded` integer DEFAULT 0 NOT NULL,
	`z_order` integer DEFAULT 0 NOT NULL,
	`visible` integer DEFAULT 1 NOT NULL,
	`locked` integer DEFAULT 0 NOT NULL,
	`track_id` text,
	`outside` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'MANUAL' NOT NULL,
	`score` real,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `objects_image_idx` ON `annotation_objects` (`image_id`);
--> statement-breakpoint
CREATE INDEX `objects_workspace_idx` ON `annotation_objects` (`workspace_id`);
--> statement-breakpoint
CREATE INDEX `objects_track_idx` ON `annotation_objects` (`track_id`);
