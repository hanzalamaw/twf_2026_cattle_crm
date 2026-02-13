-- ============================================================
-- Authorization: Role permissions (1 = access, 0 = no access)
-- Everyone has performance_management = 1.
-- Super Admin (role_id 1) = all access.
-- Admin (role_id 2) = all except control_management.
-- Managers (3, 5, 7) = only their department + performance.
-- Staff (4, 6, 8) = only their department + performance.
-- ============================================================

-- Apply: Admin has NO access to Control Management
UPDATE `roles` SET `control_management` = 0 WHERE `role_id` = 2;

-- Ensure everyone has Performance access
UPDATE `roles` SET `performance_management` = 1 WHERE `role_id` IN (1, 2, 3, 4, 5, 6, 7, 8);

-- ============================================================
-- Queries to verify each role type
-- ============================================================

-- 1) Super Admin (role_id 1) – should see all 1 except has_prev_logged_in
SELECT role_id, role_name,
  control_management, booking_management, operation_management,
  farm_management, procurement_management, accounting_and_finance, performance_management
FROM roles WHERE role_id = 1;
-- Expected: all management columns = 1

-- 2) Admin (role_id 2) – should have control_management = 0, rest = 1
SELECT role_id, role_name,
  control_management, booking_management, operation_management,
  farm_management, procurement_management, accounting_and_finance, performance_management
FROM roles WHERE role_id = 2;
-- Expected: control_management = 0, others = 1

-- 3) Manager - Bookings (role_id 3) – only booking + performance
SELECT role_id, role_name,
  control_management, booking_management, operation_management,
  farm_management, procurement_management, accounting_and_finance, performance_management
FROM roles WHERE role_id = 3;
-- Expected: booking_management = 1, performance_management = 1, rest = 0

-- 4) Staff - Bookings (role_id 4)
SELECT role_id, role_name,
  control_management, booking_management, operation_management,
  farm_management, procurement_management, accounting_and_finance, performance_management
FROM roles WHERE role_id = 4;
-- Expected: booking_management = 1, performance_management = 1, rest = 0

-- 5) Manager - Farm (role_id 5) – only farm + performance
SELECT role_id, role_name,
  control_management, booking_management, operation_management,
  farm_management, procurement_management, accounting_and_finance, performance_management
FROM roles WHERE role_id = 5;
-- Expected: farm_management = 1, performance_management = 1, rest = 0

-- 6) Staff - Farm (role_id 6)
SELECT role_id, role_name,
  control_management, booking_management, operation_management,
  farm_management, procurement_management, accounting_and_finance, performance_management
FROM roles WHERE role_id = 6;
-- Expected: farm_management = 1, performance_management = 1, rest = 0

-- 7) Manager - Procurement (role_id 7) – only procurement + performance
SELECT role_id, role_name,
  control_management, booking_management, operation_management,
  farm_management, procurement_management, accounting_and_finance, performance_management
FROM roles WHERE role_id = 7;
-- Expected: procurement_management = 1, performance_management = 1, rest = 0

-- 8) Staff - Procurement (role_id 8)
SELECT role_id, role_name,
  control_management, booking_management, operation_management,
  farm_management, procurement_management, accounting_and_finance, performance_management
FROM roles WHERE role_id = 8;
-- Expected: procurement_management = 1, performance_management = 1, rest = 0

-- All roles (overview)
SELECT role_id, role_name,
  control_management AS ctrl, booking_management AS book, operation_management AS oper,
  farm_management AS farm, procurement_management AS proc, accounting_and_finance AS acct, performance_management AS perf
FROM roles ORDER BY role_id;

-- Users and their effective permissions (join)
SELECT u.user_id, u.username, u.role_id, r.role_name,
  r.control_management, r.booking_management, r.operation_management,
  r.farm_management, r.procurement_management, r.accounting_and_finance, r.performance_management
FROM users u
JOIN roles r ON u.role_id = r.role_id
ORDER BY u.role_id, u.username;
