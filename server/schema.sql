CREATE DATABASE IF NOT EXISTS twf_cattle_crm;
USE twf_cattle_crm;

-- Drop tables if they exist to start fresh
-- Disable foreign key checks to allow dropping tables with dependencies
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS cancelled_orders;
DROP TABLE IF EXISTS booking_expenses;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS orders;
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    role_id INT,
    last_login_at TIMESTAMP NULL,
    FOREIGN KEY (role_id) REFERENCES roles(role_id)
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

-- Adding foreign key to orders for payments (Circular dependency handled by adding after table creation)
ALTER TABLE orders ADD CONSTRAINT fk_order_payment FOREIGN KEY (payment_id) REFERENCES payments(payment_id);

-- Insert a default Super Admin role
INSERT INTO roles (role_name, control_management, booking_management, operation_management, farm_management, procurement_management, accounting_and_finance, performance_management)
VALUES ('Super Admin', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE);

-- Insert a default user (password: admin123)
-- Hash for 'admin123': $2b$10$qTtom2qSm.WolhN7UjKtbuNJc6dw0QRfYgupreCMwGG8jy443czGW
INSERT INTO users (username, password, email, role_id)
VALUES ('admin', '$2b$10$qTtom2qSm.WolhN7UjKtbuNJc6dw0QRfYgupreCMwGG8jy443czGW', 'admin@twf.com', 1);

