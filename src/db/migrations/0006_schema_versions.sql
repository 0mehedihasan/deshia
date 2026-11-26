CREATE TABLE `schemas` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`current_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schema_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`schema_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`definition_json` text NOT NULL,
	`published_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`schema_id`) REFERENCES `schemas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schema_versions_version_uq` ON `schema_versions` (`schema_id`,`version`);
--> statement-breakpoint
CREATE UNIQUE INDEX `schema_versions_one_draft_uq` ON `schema_versions` (`schema_id`) WHERE `status` = 'DRAFT';
--> statement-breakpoint
CREATE INDEX `schema_versions_schema_idx` ON `schema_versions` (`schema_id`,`version`);
--> statement-breakpoint
CREATE TRIGGER `schema_versions_prevent_published_update` BEFORE UPDATE ON `schema_versions` WHEN OLD.`status` = 'PUBLISHED' BEGIN
	SELECT RAISE(ABORT, 'published schema versions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `schema_versions_prevent_published_delete` BEFORE DELETE ON `schema_versions` WHEN OLD.`status` = 'PUBLISHED' BEGIN
	SELECT RAISE(ABORT, 'published schema versions cannot be deleted');
END;
