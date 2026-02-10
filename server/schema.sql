CREATE DATABASE IF NOT EXISTS twf_cattle_crm;
USE twf_cattle_crm;

-- Drop tables if they exist to start fresh
-- Disable foreign key checks to allow dropping tables with dependencies
SET FOREIGN_KEY_CHECKS = 0;

-- Drop child tables first to avoid constraint issues even with checks disabled
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS cancelled_orders;
DROP TABLE IF EXISTS booking_expenses;
DROP TABLE IF EXISTS leads;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS roles;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE roles (
    role_id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL,
    has_prev_logged_in BOOLEAN DEFAULT FALSE,
    control_management BOOLEAN DEFAULT FALSE,
    booking_management BOOLEAN DEFAULT FALSE,
    operation_management BOOLEAN DEFAULT FALSE,
    farm_management BOOLEAN DEFAULT FALSE,
    procurement_management BOOLEAN DEFAULT FALSE,
    accounting_and_finance BOOLEAN DEFAULT FALSE,
    performance_management BOOLEAN DEFAULT FALSE
);

CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    role_id INT,
    last_login_at TIMESTAMP NULL,
    created_by INT,
    FOREIGN KEY (role_id) REFERENCES roles(role_id),
    FOREIGN KEY (created_by) REFERENCES users(user_id)
);

-- Leads Table
CREATE TABLE leads (
    lead_id VARCHAR(50) PRIMARY KEY,
    customer_id VARCHAR(50),
    contact VARCHAR(20),
    order_type VARCHAR(50),
    booking_name VARCHAR(100),
    shareholder_name VARCHAR(100),
    alt_contact VARCHAR(20),
    address TEXT,
    area VARCHAR(100),
    day VARCHAR(20),
    booking_date DATE,
    total_amount DECIMAL(10, 2),
    order_source VARCHAR(50),
    description TEXT,
    reference VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders Table
CREATE TABLE orders (
    order_id VARCHAR(50) PRIMARY KEY,
    customer_id VARCHAR(50),
    contact VARCHAR(20),
    order_type VARCHAR(50),
    booking_name VARCHAR(100),
    shareholder_name VARCHAR(100),
    cow_number VARCHAR(50),
    hissa_number VARCHAR(50),
    alt_contact VARCHAR(20),
    address TEXT,
    area VARCHAR(100),
    day VARCHAR(20),
    booking_date DATE,
    total_amount DECIMAL(10, 2),
    received_amount DECIMAL(10, 2) DEFAULT 0.00,
    pending_amount DECIMAL(10, 2) DEFAULT 0.00,
    order_source VARCHAR(50),
    reference VARCHAR(100),
    description TEXT,
    rider_id INT,
    slot VARCHAR(50),
    payment_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payments Table
CREATE TABLE payments (
    payment_id VARCHAR(50) PRIMARY KEY,
    bank DECIMAL(10, 2) DEFAULT 0.00,
    cash DECIMAL(10, 2) DEFAULT 0.00,
    total_received DECIMAL(10, 2) DEFAULT 0.00,
    date DATE,
    order_id VARCHAR(50),
    FOREIGN KEY (order_id) REFERENCES orders(order_id)
);

-- Booking Expenses Table
CREATE TABLE booking_expenses (
    expense_id VARCHAR(50) PRIMARY KEY,
    bank DECIMAL(10, 2) DEFAULT 0.00,
    cash DECIMAL(10, 2) DEFAULT 0.00,
    total DECIMAL(10, 2) DEFAULT 0.00,
    done_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT,
    done_by INT,
    FOREIGN KEY (done_by) REFERENCES users(user_id)
);

-- Cancelled Orders Table
CREATE TABLE cancelled_orders (
    id VARCHAR(50) PRIMARY KEY,
    customer_id VARCHAR(50),
    contact VARCHAR(20),
    order_type VARCHAR(50),
    booking_name VARCHAR(100),
    shareholder_name VARCHAR(100),
    alt_contact VARCHAR(20),
    address TEXT,
    area VARCHAR(100),
    day VARCHAR(20),
    booking_date DATE,
    total_amount DECIMAL(10, 2),
    order_source VARCHAR(50),
    description TEXT,
    reference VARCHAR(100),
    cancelled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit Logs Table
CREATE TABLE audit_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(50),
    old_values JSON,
    new_values JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- User Sessions Table
CREATE TABLE user_sessions (
    session_id VARCHAR(255) PRIMARY KEY,
    user_id INT NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Adding foreign key to orders for payments (Circular dependency handled by adding after table creation)
ALTER TABLE orders ADD CONSTRAINT fk_order_payment FOREIGN KEY (payment_id) REFERENCES payments(payment_id);

-- Insert default roles
INSERT INTO roles (role_name, control_management, booking_management, operation_management, farm_management, procurement_management, accounting_and_finance, performance_management)
VALUES 
('Super Admin', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
('Admin', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
('Manager - Bookings', FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE),
('Staff - Bookings', FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE),
('Manager - Farm', FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE),
('Staff - Farm', FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE),
('Manager - Procurement', FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE),
('Staff - Procurement', FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE);

-- Insert a default user (password: admin123)
-- Hash for 'admin123': $2b$10$qTtom2qSm.WolhN7UjKtbuNJc6dw0QRfYgupreCMwGG8jy443czGW
INSERT INTO users (username, password, email, first_name, last_name, status, role_id, created_by)
VALUES ('admin', '$2b$10$qTtom2qSm.WolhN7UjKtbuNJc6dw0QRfYgupreCMwGG8jy443czGW', 'admin@twf.com', 'System', 'Administrator', 'active', 1, 1);

-- Sample Leads
INSERT INTO leads (lead_id, customer_id, contact, order_type, booking_name, shareholder_name, address, area, day, booking_date, total_amount, order_source, description)
VALUES 
('#L-0001-2026', 'C-101', '0300-1234567', 'Qurbani Hissa', 'Cow A', 'John Doe', '123 Street, Karachi', 'Gulshan', 'Monday', '2026-06-15', 25000.00, 'Facebook', 'Interested in 2 shares'),
('#L-0002-2026', 'C-102', '0321-7654321', 'Full Cow', 'Cow B', 'Jane Smith', '456 Road, Lahore', 'DHA', 'Wednesday', '2026-06-16', 180000.00, 'WhatsApp', 'Wants a heavy weight animal'),
('#L-0003-2026', 'C-105', '0333-9998887', 'Qurbani Hissa', 'Cow F', 'Michael Brown', '789 Blvd, Islamabad', 'E-11', 'Thursday', '2026-06-17', 28000.00, 'Instagram', 'Inquiry for Day 2'),
('#L-0004-2026', 'C-106', '0344-5556667', 'Full Cow', 'Cow G', 'Sarah Wilson', '101 Lane, Karachi', 'Clifton', 'Friday', '2026-06-18', 195000.00, 'Website', 'Premium quality requested');

-- Sample Orders
INSERT INTO orders (order_id, customer_id, contact, order_type, booking_name, shareholder_name, cow_number, hissa_number, address, area, day, booking_date, total_amount, received_amount, pending_amount, order_source, payment_id)
VALUES 
('#O-0001-2026', 'C-103', '0333-1112223', 'Qurbani Hissa', 'Cow C', 'Ali Khan', 'Cow-50', 'Hissa-3', '789 Flat, Karachi', 'Nazimabad', 'Day 1', '2026-06-10', 30000.00, 10000.00, 20000.00, 'Referral', '#P-0001-2026'),
('#O-0002-2026', 'C-104', '0345-4445556', 'Full Cow', 'Cow D', 'Ahmed Raza', 'Cow-12', 'Full', '321 Villa, Islamabad', 'F-7', 'Day 2', '2026-06-11', 200000.00, 200000.00, 0.00, 'Website', '#P-0002-2026'),
('#O-0003-2026', 'C-107', '0300-4443332', 'Qurbani Hissa', 'Cow H', 'Fatima Zahra', 'Cow-65', 'Hissa-1', '55 Sector, Karachi', 'North Nazimabad', 'Day 1', '2026-06-10', 32000.00, 32000.00, 0.00, 'Facebook', '#P-0003-2026'),
('#O-0004-2026', 'C-108', '0321-1231234', 'Qurbani Hissa', 'Cow I', 'Usman Sheikh', 'Cow-65', 'Hissa-2', '12 Garden, Lahore', 'Model Town', 'Day 1', '2026-06-10', 32000.00, 15000.00, 17000.00, 'WhatsApp', '#P-0004-2026');

-- Sample Payments
INSERT INTO payments (payment_id, bank, cash, total_received, date, order_id)
VALUES 
('#P-0001-2026', 10000.00, 0.00, 10000.00, '2026-02-05', '#O-0001-2026'),
('#P-0002-2026', 150000.00, 50000.00, 200000.00, '2026-02-05', '#O-0002-2026'),
('#P-0003-2026', 32000.00, 0.00, 32000.00, '2026-02-06', '#O-0003-2026'),
('#P-0004-2026', 0.00, 15000.00, 15000.00, '2026-02-06', '#O-0004-2026');

-- Sample Expenses
INSERT INTO booking_expenses (expense_id, bank, cash, total, description, done_by)
VALUES 
('#E-0001-2026', 0.00, 500.00, 500.00, 'Fuel for field visit', 1),
('#E-0002-2026', 2000.00, 0.00, 2000.00, 'Marketing flyers printing', 1),
('#E-0003-2026', 0.00, 1200.00, 1200.00, 'Refreshments for customers', 1),
('#E-0004-2026', 5000.00, 0.00, 5000.00, 'Social media ad campaign', 1);

-- Sample Cancelled Orders
INSERT INTO cancelled_orders (id, customer_id, contact, order_type, booking_name, shareholder_name, total_amount, description)
VALUES 
('#C-0001-2026', 'C-105', '0312-9998887', 'Qurbani Hissa', 'Cow E', 'Zubair Ali', 28000.00, 'Customer changed mind due to travel'),
('#C-0002-2026', 'C-109', '0333-4445551', 'Full Cow', 'Cow J', 'Kamran Akmal', 175000.00, 'Budget issues');
