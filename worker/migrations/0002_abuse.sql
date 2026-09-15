ALTER TABLE `abuse_reports` ADD `reporter_email` text;--> statement-breakpoint
ALTER TABLE `abuse_reports` ADD `ip_hash` text;--> statement-breakpoint
ALTER TABLE `abuse_reports` ADD `resolved_at` integer;--> statement-breakpoint
CREATE INDEX `abuse_reports_form_idx` ON `abuse_reports` (`form_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `forms` ADD `reviewed_at` integer;