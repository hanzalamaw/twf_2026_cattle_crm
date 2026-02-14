-- Add per-user terms acceptance. When user accepts terms, set this and set roles.has_prev_logged_in = 1 for their role.
-- Run once: mysql -u root -p your_database < add_terms_accepted_to_users.sql
-- Or execute the ALTER below in your MySQL client.
ALTER TABLE `users`
ADD COLUMN `terms_accepted_at` timestamp NULL DEFAULT NULL AFTER `last_login_at`;
