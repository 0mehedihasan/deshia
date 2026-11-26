ALTER TABLE `images` ADD `media_kind` text DEFAULT 'IMAGE' NOT NULL;
--> statement-breakpoint
ALTER TABLE `images` ADD `duration_ms` integer;
--> statement-breakpoint
ALTER TABLE `images` ADD `fps` real;
--> statement-breakpoint
ALTER TABLE `images` ADD `frame_count` integer;
--> statement-breakpoint
ALTER TABLE `annotation_objects` ADD `frame_number` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `objects_frame_idx` ON `annotation_objects` (`image_id`,`frame_number`);
