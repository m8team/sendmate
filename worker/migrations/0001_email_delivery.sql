ALTER TABLE `submissions` ADD `digest_at` integer;--> statement-breakpoint
CREATE INDEX `submissions_digest_idx` ON `submissions` (`digest_at`) WHERE digest_at IS NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `resend_key_error` text;