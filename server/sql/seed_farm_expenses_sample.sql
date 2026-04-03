-- Sample rows for `farm_expenses` (Farm Management → Expenses).
-- Adjust `created_by` to a valid `users.user_id` in your database (e.g. 1).
-- Run only if these IDs are free: E-9001-2026, E-9002-2026, E-9003-2026.

INSERT INTO `farm_expenses` (`expense_id`, `bank`, `cash`, `total`, `done_at`, `description`, `done_by`, `created_by`) VALUES
('E-9001-2026', 15000.00, 5000.00, 20000.00, '2026-04-01 10:00:00', 'Feed and fodder sample', 'Farm Manager', 1),
('E-9002-2026', 0.00, 8500.00, 8500.00, '2026-04-02 14:30:00', 'Vet visit / deworming', 'Farm Manager', 1),
('E-9003-2026', 12000.00, 0.00, 12000.00, '2026-04-03 09:15:00', 'Equipment repair (water trough)', 'Admin', 1);
