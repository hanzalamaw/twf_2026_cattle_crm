ALTER TABLE `orders`
  ADD COLUMN `closed_by` varchar(100) DEFAULT NULL AFTER `reference`;

ALTER TABLE `cancelled_orders`
  ADD COLUMN `closed_by` varchar(100) DEFAULT NULL AFTER `reference`;
