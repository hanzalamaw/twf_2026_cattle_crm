-- Sample data for booking_expenses table (run after schema / when you need more test data)
-- Existing expenses #E-0001 to #E-0004 are in schema.sql; these add more variety.

INSERT INTO `booking_expenses` (`expense_id`, `bank`, `cash`, `total`, `done_at`, `description`, `done_by`) VALUES
('#E-0005-2026', 3000.00, 0.00, 3000.00, NOW(), 'Vehicle maintenance', 1),
('#E-0006-2026', 0.00, 2500.00, 2500.00, NOW(), 'Staff overtime - Eid rush', 1),
('#E-0007-2026', 15000.00, 0.00, 15000.00, NOW(), 'Feed and fodder purchase', 1),
('#E-0008-2026', 0.00, 800.00, 800.00, NOW(), 'Miscellaneous supplies', 1),
('#E-0009-2026', 7500.00, 2500.00, 10000.00, NOW(), 'Mixed: transport + labour', 1),
('#E-0010-2026', 0.00, 1500.00, 1500.00, NOW(), 'Customer refreshments - open day', 1);
