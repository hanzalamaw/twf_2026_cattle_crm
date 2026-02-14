-- ============================================================
-- TWF Cattle CRM – All SQL migrations combined
-- Run on an existing database. Skip blocks already applied.
-- ============================================================

-- ------------------------------------------------------------
-- 1. USERS: Terms acceptance (per-user)
-- ------------------------------------------------------------
ALTER TABLE `users`
ADD COLUMN `terms_accepted_at` timestamp NULL DEFAULT NULL AFTER `last_login_at`;

-- ------------------------------------------------------------
-- 2. USERS: Move has_prev_logged_in from roles to users
--    (Run after add_terms_accepted_to_users)
-- ------------------------------------------------------------
ALTER TABLE `users`
ADD COLUMN `has_prev_logged_in` tinyint(1) NOT NULL DEFAULT 0 AFTER `last_login_at`;

UPDATE `users` SET `has_prev_logged_in` = 1 WHERE `terms_accepted_at` IS NOT NULL;

ALTER TABLE `roles`
DROP COLUMN `has_prev_logged_in`;

-- ------------------------------------------------------------
-- 3. AUDIT_LOGS: Add session_id for session tracking
-- ------------------------------------------------------------
ALTER TABLE `audit_logs`
ADD COLUMN `session_id` varchar(255) DEFAULT NULL AFTER `user_agent`,
ADD KEY `session_id` (`session_id`),
ADD CONSTRAINT `audit_logs_ibfk_2` FOREIGN KEY (`session_id`) REFERENCES `user_sessions` (`session_id`) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 4. ORDERS: Remove payment_id and FK to payments
--    Skip if already applied.
-- ------------------------------------------------------------
ALTER TABLE `orders` DROP FOREIGN KEY `fk_order_payment`;
ALTER TABLE `orders` DROP INDEX `fk_order_payment`;
ALTER TABLE `orders` DROP COLUMN `payment_id`;

-- ------------------------------------------------------------
-- 5. PASSWORD RESET (Forgot password → email link → reset page)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `password_reset_tokens`;

CREATE TABLE `password_reset_tokens` (
  `token` varchar(64) NOT NULL,
  `user_id` int(11) NOT NULL,
  `expires_at` timestamp NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `password_reset_tokens`
  ADD PRIMARY KEY (`token`),
  ADD KEY `user_id` (`user_id`);

ALTER TABLE `password_reset_tokens`
  ADD CONSTRAINT `password_reset_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;

-- ------------------------------------------------------------
-- 6. AUTHORIZATION (Role-based access)
-- ------------------------------------------------------------
UPDATE `roles` SET `control_management` = 0 WHERE `role_id` = 2;
UPDATE `roles` SET `performance_management` = 1 WHERE `role_id` IN (1, 2, 3, 4, 5, 6, 7, 8);
