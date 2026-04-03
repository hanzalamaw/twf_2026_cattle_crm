-- Primary key for farm_expenses (expense_id).
-- Run once on databases created before this was added to schema.sql.
-- If you already have a PRIMARY KEY on `farm_expenses`, skip this file.

ALTER TABLE `farm_expenses`
  ADD PRIMARY KEY (`expense_id`);
