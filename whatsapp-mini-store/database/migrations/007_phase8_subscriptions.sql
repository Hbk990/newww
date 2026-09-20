ALTER TABLE plans
  ADD COLUMN description VARCHAR(255) NULL AFTER name,
  ADD COLUMN monthly_price DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER limits,
  ADD COLUMN currency_code CHAR(3) NOT NULL DEFAULT 'USD' AFTER monthly_price,
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER currency_code,
  ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 1 AFTER sort_order,
  ADD KEY idx_plans_public_sort (is_active,is_public,sort_order);

ALTER TABLE subscriptions
  ADD COLUMN pending_plan_id BIGINT UNSIGNED NULL AFTER plan_id,
  ADD COLUMN provider VARCHAR(50) NOT NULL DEFAULT 'manual' AFTER status,
  ADD COLUMN provider_customer_ref VARCHAR(190) NULL AFTER provider,
  ADD COLUMN provider_subscription_ref VARCHAR(190) NULL AFTER provider_customer_ref,
  ADD COLUMN scheduled_change_at DATETIME NULL AFTER grace_ends_at,
  ADD COLUMN ended_at DATETIME NULL AFTER cancelled_at,
  ADD KEY idx_subscriptions_lifecycle (status,trial_ends_at,current_period_ends_at,grace_ends_at),
  ADD CONSTRAINT fk_subscriptions_pending_plan FOREIGN KEY (pending_plan_id) REFERENCES plans(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS subscription_change_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id BIGINT UNSIGNED NOT NULL,
  subscription_id BIGINT UNSIGNED NOT NULL,
  from_plan_id BIGINT UNSIGNED NOT NULL,
  to_plan_id BIGINT UNSIGNED NOT NULL,
  requested_by_user_id BIGINT UNSIGNED NOT NULL,
  change_type ENUM('UPGRADE','DOWNGRADE','CHANGE') NOT NULL,
  status ENUM('PENDING','SCHEDULED','APPLIED','CANCELLED','REJECTED') NOT NULL,
  provider VARCHAR(50) NOT NULL,
  provider_reference VARCHAR(190) NULL,
  effective_at DATETIME NULL,
  applied_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_subscription_changes_store (store_id,status,created_at),
  KEY idx_subscription_changes_subscription (subscription_id,status),
  CONSTRAINT fk_subscription_changes_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_subscription_changes_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
  CONSTRAINT fk_subscription_changes_from_plan FOREIGN KEY (from_plan_id) REFERENCES plans(id) ON DELETE RESTRICT,
  CONSTRAINT fk_subscription_changes_to_plan FOREIGN KEY (to_plan_id) REFERENCES plans(id) ON DELETE RESTRICT,
  CONSTRAINT fk_subscription_changes_user FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscription_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id BIGINT UNSIGNED NOT NULL,
  subscription_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  from_status VARCHAR(30) NULL,
  to_status VARCHAR(30) NULL,
  from_plan_id BIGINT UNSIGNED NULL,
  to_plan_id BIGINT UNSIGNED NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL,
  KEY idx_subscription_events_store (store_id,created_at),
  KEY idx_subscription_events_subscription (subscription_id,created_at),
  CONSTRAINT fk_subscription_events_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_subscription_events_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
  CONSTRAINT fk_subscription_events_from_plan FOREIGN KEY (from_plan_id) REFERENCES plans(id) ON DELETE SET NULL,
  CONSTRAINT fk_subscription_events_to_plan FOREIGN KEY (to_plan_id) REFERENCES plans(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE plans SET
  description='Start selling with a focused catalog.',
  features=JSON_MERGE_PATCH(features,JSON_OBJECT('basic_storefront',TRUE,'basic_analytics',TRUE,'advanced_analytics',FALSE,'catalog_import',FALSE,'bulk_image_import',FALSE,'remove_platform_branding',FALSE,'premium_customization',FALSE,'staff_management',FALSE,'custom_domain',FALSE)),
  limits=JSON_MERGE_PATCH(limits,JSON_OBJECT('stores',1,'products',10,'categories',3,'staff',0)),
  monthly_price=0.00,currency_code='USD',sort_order=10,is_public=1,updated_at=UTC_TIMESTAMP()
WHERE code='FREE';

INSERT INTO plans (code,name,description,features,limits,monthly_price,currency_code,sort_order,is_public,is_active,created_at,updated_at)
VALUES
('PRO','Pro','Grow a larger catalog with advanced tools.',JSON_OBJECT('basic_storefront',TRUE,'basic_analytics',TRUE,'advanced_analytics',TRUE,'catalog_import',TRUE,'bulk_image_import',TRUE,'remove_platform_branding',TRUE,'premium_customization',TRUE,'staff_management',FALSE,'custom_domain',FALSE),JSON_OBJECT('stores',1,'products',250,'categories',-1,'staff',0),19.00,'USD',20,1,1,UTC_TIMESTAMP(),UTC_TIMESTAMP()),
('BUSINESS','Business','Operate multiple stores and prepare for a larger team.',JSON_OBJECT('basic_storefront',TRUE,'basic_analytics',TRUE,'advanced_analytics',TRUE,'catalog_import',TRUE,'bulk_image_import',TRUE,'remove_platform_branding',TRUE,'premium_customization',TRUE,'staff_management',TRUE,'custom_domain',TRUE),JSON_OBJECT('stores',3,'products',-1,'categories',-1,'staff',10),49.00,'USD',30,1,1,UTC_TIMESTAMP(),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),updated_at=UTC_TIMESTAMP();
