CREATE TABLE IF NOT EXISTS customers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(16) NOT NULL,
  normalized_phone VARCHAR(16) NOT NULL,
  email VARCHAR(190) NULL,
  first_order_at DATETIME NULL,
  last_order_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_customers_store_phone (store_id,normalized_phone),
  UNIQUE KEY uq_customers_id_store (id,store_id),
  KEY idx_customers_store_last_order (store_id,last_order_at),
  CONSTRAINT fk_customers_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE orders
  ADD COLUMN customer_id BIGINT UNSIGNED NULL AFTER store_id,
  ADD KEY idx_orders_customer_date (customer_id,placed_at),
  ADD CONSTRAINT fk_orders_customer_store FOREIGN KEY (customer_id,store_id) REFERENCES customers(id,store_id) ON DELETE RESTRICT;

INSERT INTO customers (store_id,name,phone,normalized_phone,first_order_at,last_order_at,created_at,updated_at)
SELECT store_id,SUBSTRING_INDEX(GROUP_CONCAT(customer_name ORDER BY placed_at DESC,id DESC SEPARATOR '\n'), '\n', 1),customer_phone,customer_phone,MIN(placed_at),MAX(placed_at),MIN(created_at),MAX(updated_at)
FROM orders GROUP BY store_id,customer_phone
ON DUPLICATE KEY UPDATE name=VALUES(name),phone=VALUES(phone),first_order_at=LEAST(COALESCE(first_order_at,VALUES(first_order_at)),VALUES(first_order_at)),last_order_at=GREATEST(COALESCE(last_order_at,VALUES(last_order_at)),VALUES(last_order_at)),updated_at=VALUES(updated_at);

UPDATE orders o JOIN customers c ON c.store_id=o.store_id AND c.normalized_phone=o.customer_phone
SET o.customer_id=c.id WHERE o.customer_id IS NULL;

CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  session_hash CHAR(64) NOT NULL,
  product_id BIGINT UNSIGNED NULL,
  search_query VARCHAR(100) NULL,
  metadata_json JSON NULL,
  occurred_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_analytics_store_type_date (store_id,event_type,occurred_at),
  KEY idx_analytics_store_session_date (store_id,session_hash,occurred_at),
  KEY idx_analytics_store_product_date (store_id,product_id,occurred_at),
  CONSTRAINT fk_analytics_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS import_batches (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id BIGINT UNSIGNED NOT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  kind ENUM('PRODUCTS') NOT NULL DEFAULT 'PRODUCTS',
  status ENUM('PREVIEW','COMMITTED','EXPIRED') NOT NULL DEFAULT 'PREVIEW',
  source_name VARCHAR(255) NOT NULL,
  payload_json LONGTEXT NOT NULL,
  report_json JSON NOT NULL,
  expires_at DATETIME NOT NULL,
  committed_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_import_batches_token (token_hash),
  KEY idx_import_batches_store_status_expiry (store_id,status,expires_at),
  CONSTRAINT fk_import_batches_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_import_batches_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
