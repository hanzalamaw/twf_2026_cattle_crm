-- Migration: Add session_id column to audit_logs table
-- This allows tracking which specific session performed each audit action

ALTER TABLE `audit_logs` 
ADD COLUMN `session_id` varchar(255) DEFAULT NULL AFTER `user_agent`,
ADD KEY `session_id` (`session_id`),
ADD CONSTRAINT `audit_logs_ibfk_2` FOREIGN KEY (`session_id`) REFERENCES `user_sessions` (`session_id`) ON DELETE SET NULL;


