-- Performance Management: performers (targets) and daily reports
-- Run this if the tables do not exist yet.

CREATE TABLE IF NOT EXISTS performance_targets (
    performer_id INT AUTO_INCREMENT PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    user_id INT NOT NULL,
    calls_target INT DEFAULT 0,
    leads_target INT DEFAULT 0,
    orders_target INT DEFAULT 0,

    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS pms_daily_report (
    report_id INT AUTO_INCREMENT PRIMARY KEY,
    performer_id INT NOT NULL,
    date DATE NOT NULL,
    calls_done INT DEFAULT 0,
    leads_generated INT DEFAULT 0,
    orders_confirmed INT DEFAULT 0,

    FOREIGN KEY (performer_id) REFERENCES performance_targets(performer_id)
);
