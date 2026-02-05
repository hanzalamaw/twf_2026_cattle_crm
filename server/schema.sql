CREATE DATABASE IF NOT EXISTS twf_cattle_crm;
USE twf_cattle_crm;

-- Drop tables if they exist to start fresh
-- Disable foreign key checks to allow dropping tables with dependencies
SET FOREIGN_KEY_CHECKS = 0;
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

-- Insert a default Super Admin role
INSERT INTO roles (role_name, control_management, booking_management, operation_management, farm_management, procurement_management, accounting_and_finance, performance_management)
VALUES ('Super Admin', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE);

-- Insert a default user (password: admin123)
-- Hash for 'admin123': $2b$10$qTtom2qSm.WolhN7UjKtbuNJc6dw0QRfYgupreCMwGG8jy443czGW
INSERT INTO users (username, password, email, role_id)
VALUES ('admin', '$2b$10$qTtom2qSm.WolhN7UjKtbuNJc6dw0QRfYgupreCMwGG8jy443czGW', 'admin@twf.com', 1);

