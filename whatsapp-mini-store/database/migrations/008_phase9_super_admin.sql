ALTER TABLE stores
  ADD COLUMN status_before_suspension ENUM('DRAFT','ACTIVE') NULL AFTER status,
  ADD COLUMN suspended_at DATETIME NULL AFTER status_before_suspension;

ALTER TABLE audit_logs
  ADD KEY idx_audit_created_at (created_at);

ALTER TABLE orders
  ADD KEY idx_orders_placed_at (placed_at);

CREATE TABLE IF NOT EXISTS system_tasks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_key VARCHAR(80) NOT NULL,
  label VARCHAR(120) NOT NULL,
  last_started_at DATETIME NULL,
  last_completed_at DATETIME NULL,
  last_status ENUM('NEVER','RUNNING','SUCCESS','FAILED') NOT NULL DEFAULT 'NEVER',
  details JSON NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_system_tasks_key (task_key),
  KEY idx_system_tasks_status_completed (last_status,last_completed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO system_tasks (task_key,label,last_status,updated_at) VALUES
('subscription_lifecycle','Subscription lifecycle','NEVER',UTC_TIMESTAMP()),
('backup_database','Database backup','NEVER',UTC_TIMESTAMP()),
('backup_uploads','Uploaded assets backup','NEVER',UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE label=VALUES(label);
