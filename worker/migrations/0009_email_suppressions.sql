CREATE TABLE `email_suppressions` (
	`email` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`detail` text,
	`created_at` integer NOT NULL
);
