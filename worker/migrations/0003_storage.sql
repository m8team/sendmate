CREATE TABLE `storage_usage` (
	`scope` text NOT NULL,
	`scope_id` text NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`scope`, `scope_id`)
);
