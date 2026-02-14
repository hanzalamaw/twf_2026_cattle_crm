-- Move has_prev_logged_in from roles to users.
-- Run after add_terms_accepted_to_users.sql. Then: mysql -u user -p dbname < migrations/move_has_prev_logged_in_to_users.sql

-- 1) Add column to users (default 0 = must see terms until they accept)
ALTER TABLE `users`
ADD COLUMN `has_prev_logged_in` tinyint(1) NOT NULL DEFAULT 0 AFTER `last_login_at`;

-- 2) If terms_accepted_at exists (from add_terms_accepted_to_users.sql), set has_prev_logged_in = 1 for those users:
UPDATE `users` SET `has_prev_logged_in` = 1 WHERE `terms_accepted_at` IS NOT NULL;

-- 3) Drop from roles
ALTER TABLE `roles`
DROP COLUMN `has_prev_logged_in`;
