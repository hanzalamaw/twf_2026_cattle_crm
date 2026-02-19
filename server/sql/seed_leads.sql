-- Sample data for leads table (run after schema / when you need more test data)
-- Existing leads #L-0001 to #L-0004 are in schema.sql; these add more variety.

INSERT INTO `leads` (`lead_id`, `customer_id`, `contact`, `order_type`, `booking_name`, `shareholder_name`, `alt_contact`, `address`, `area`, `day`, `booking_date`, `total_amount`, `order_source`, `description`, `reference`, `created_at`) VALUES
('#L-0005-2026', 'C-110', '0301-2223344', 'Qurbani Hissa', 'Cow K', 'Rashid Mahmood', '0302-3334455', '22 Block, Karachi', 'Malir', 'Day 1', '2026-06-12', 30000.00, 'Facebook', 'Day 1 hissa preferred', 'ref-fb-1', NOW()),
('#L-0006-2026', 'C-111', '0322-8889900', 'Full Cow', 'Cow L', 'Ayesha Siddiqui', NULL, '45 Avenue, Lahore', 'Johar Town', 'Day 2', '2026-06-13', 185000.00, 'WhatsApp', 'Heavy animal for family', NULL, NOW()),
('#L-0007-2026', 'C-112', '0334-5556677', 'Qurbani Hissa', 'Cow M', 'Imran Farooq', '0335-6667788', '78 Road, Islamabad', 'I-8', 'Thursday', '2026-06-14', 27500.00, 'Referral', 'Referred by C-104', 'ref-ref-1', NOW()),
('#L-0008-2026', 'C-113', '0345-1112233', 'Full Cow', 'Cow N', 'Sana Khan', NULL, '90 Street, Karachi', 'Korangi', 'Friday', '2026-06-15', 190000.00, 'Instagram', 'Premium full cow', NULL, NOW()),
('#L-0009-2026', 'C-114', '0312-9998877', 'Qurbani Hissa', 'Cow O', 'Bilal Ahmed', '0313-8887766', '12 Sector, Rawalpindi', 'Satellite Town', 'Monday', '2026-06-16', 26000.00, 'Website', '2 hissa inquiry', 'ref-web-1', NOW()),
('#L-0010-2026', 'C-115', '0309-4445566', 'Qurbani Hissa', 'Cow P', 'Zainab Ali', NULL, '56 Lane, Faisalabad', 'D-Type', 'Wednesday', '2026-06-17', 29000.00, 'Facebook', 'Day 2 preferred', NULL, NOW());
