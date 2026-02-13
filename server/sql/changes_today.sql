-- ============================================================
-- TWF Cattle CRM – SQL changes applied today
-- Run this on an existing database to apply all changes.
-- If a step was already applied (e.g. you dropped payment_id), skip or comment out that block.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ORDERS: Remove payment_id and FK to payments
--    (orders no longer reference payments by payment_id)
--    Skip this block if you already ran it.
-- ------------------------------------------------------------

-- Drop foreign key first (if it exists)
ALTER TABLE `orders` DROP FOREIGN KEY `fk_order_payment`;

-- Drop the index on payment_id (if exists; may be named fk_order_payment)
ALTER TABLE `orders` DROP INDEX `fk_order_payment`;

-- Drop payment_id column from orders
ALTER TABLE `orders` DROP COLUMN `payment_id`;


-- ------------------------------------------------------------
-- 2. PASSWORD RESET (Forgot password → email link → reset page)
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
-- 3. AUTHORIZATION (Role-based access)
--    Super Admin (1) = all; Admin (2) = all except Control;
--    Managers (3,5,7) = their dept + Performance; Staff (4,6,8) = same.
--    Everyone has Performance access.
-- ------------------------------------------------------------

-- Admin: no access to Control Management
UPDATE `roles` SET `control_management` = 0 WHERE `role_id` = 2;

-- Everyone has Performance Management access
UPDATE `roles` SET `performance_management` = 1 WHERE `role_id` IN (1, 2, 3, 4, 5, 6, 7, 8);


-- ============================================================
-- VERIFICATION QUERIES (optional – run to check)
-- ============================================================

-- Roles overview (all permissions)
-- SELECT role_id, role_name,
--   control_management AS ctrl, booking_management AS book, operation_management AS oper,
--   farm_management AS farm, procurement_management AS proc, accounting_and_finance AS acct, performance_management AS perf
-- FROM roles ORDER BY role_id;

-- Users and their permissions (join)
-- SELECT u.user_id, u.username, u.role_id, r.role_name,
--   r.control_management, r.booking_management, r.operation_management,
--   r.farm_management, r.procurement_management, r.accounting_and_finance, r.performance_management
-- FROM users u
-- JOIN roles r ON u.role_id = r.role_id
-- ORDER BY u.role_id, u.username;

-- Password reset tokens table exists and is empty (or has pending tokens)
-- SELECT COUNT(*) AS reset_tokens_count FROM password_reset_tokens;

-- Orders no longer have payment_id
-- DESCRIBE orders;
