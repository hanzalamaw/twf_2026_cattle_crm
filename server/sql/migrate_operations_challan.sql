-- Operations sub-permissions (require operation_management = 1 to take effect in the app)
-- Run this migration against your existing database.

ALTER TABLE `roles`
  ADD COLUMN `operation_general_dashboard` tinyint(1) NOT NULL DEFAULT 0 AFTER `operation_management`,
  ADD COLUMN `operation_customer_support` tinyint(1) NOT NULL DEFAULT 0 AFTER `operation_general_dashboard`,
  ADD COLUMN `operation_rider_management` tinyint(1) NOT NULL DEFAULT 0 AFTER `operation_customer_support`,
  ADD COLUMN `operation_deliveries_management` tinyint(1) NOT NULL DEFAULT 0 AFTER `operation_rider_management`,
  ADD COLUMN `operation_challan_management` tinyint(1) NOT NULL DEFAULT 0 AFTER `operation_deliveries_management`;

-- Grant all new operation screens to roles that already had operation_management
UPDATE `roles`
SET
  `operation_general_dashboard` = 1,
  `operation_customer_support` = 1,
  `operation_rider_management` = 1,
  `operation_deliveries_management` = 1,
  `operation_challan_management` = 1
WHERE `operation_management` = 1;

-- ---------------------------------------------------------------------------
-- Riders (delivery personnel)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `riders` (
  `rider_id` int(11) NOT NULL AUTO_INCREMENT,
  `rider_name` varchar(150) NOT NULL,
  `contact` varchar(50) DEFAULT NULL,
  `vehicle` varchar(100) DEFAULT NULL,
  `cnic` varchar(25) DEFAULT NULL,
  `number_plate` varchar(50) DEFAULT NULL,
  `availability` varchar(50) DEFAULT 'available',
  `status` varchar(50) DEFAULT 'active',
  `deliveries_done` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`rider_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Challan (one row per address group / dispatch unit)
-- Spelling: total_* (not toal_*) for maintainability
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `challan` (
  `challan_id` int(11) NOT NULL AUTO_INCREMENT,
  `qr_token` varchar(64) NOT NULL,
  `rider_id` int(11) DEFAULT NULL,
  `booking_name` varchar(255) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `area` varchar(150) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `slot` varchar(50) DEFAULT NULL,
  `day` varchar(50) DEFAULT NULL,
  `total_premium_hissa` int(11) NOT NULL DEFAULT 0,
  `total_standard_hissa` int(11) NOT NULL DEFAULT 0,
  `total_waqf_hissa` int(11) NOT NULL DEFAULT 0,
  `total_goat_hissa` int(11) NOT NULL DEFAULT 0,
  `total_hissa` int(11) NOT NULL DEFAULT 0,
  `delivery_status` varchar(80) NOT NULL DEFAULT 'Pending',
  `challan_date` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`challan_id`),
  UNIQUE KEY `uq_challan_qr_token` (`qr_token`),
  KEY `idx_challan_day_slot` (`day`, `slot`),
  KEY `idx_challan_rider` (`rider_id`),
  CONSTRAINT `fk_challan_rider` FOREIGN KEY (`rider_id`) REFERENCES `riders` (`rider_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Challan ↔ Orders (many orders per challan)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `challan_orders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `challan_id` int(11) NOT NULL,
  `order_id` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_challan_order` (`challan_id`, `order_id`),
  KEY `idx_challan_orders_order` (`order_id`),
  CONSTRAINT `fk_challan_orders_challan` FOREIGN KEY (`challan_id`) REFERENCES `challan` (`challan_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_challan_orders_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
