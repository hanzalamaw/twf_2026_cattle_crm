-- Migration: booking_expenses - done_by becomes username (text), add created_by (user_id)
-- Run this once on existing database.

-- Add created_by column (user_id)
ALTER TABLE booking_expenses ADD COLUMN created_by INT(11) DEFAULT NULL AFTER description;

-- Backfill created_by from current done_by (user_id)
UPDATE booking_expenses SET created_by = done_by WHERE done_by IS NOT NULL;

-- Add temporary column for username
ALTER TABLE booking_expenses ADD COLUMN done_by_username VARCHAR(255) DEFAULT NULL;

-- Fill username from users table
UPDATE booking_expenses be INNER JOIN users u ON be.created_by = u.user_id SET be.done_by_username = u.username;

-- Drop FK and old done_by column
ALTER TABLE booking_expenses DROP FOREIGN KEY booking_expenses_ibfk_1;
ALTER TABLE booking_expenses DROP INDEX done_by;
ALTER TABLE booking_expenses DROP COLUMN done_by;

-- Rename new column to done_by
ALTER TABLE booking_expenses CHANGE COLUMN done_by_username done_by VARCHAR(255) DEFAULT NULL;

-- Optional: add index on created_by if you query by it
-- ALTER TABLE booking_expenses ADD KEY created_by (created_by);
