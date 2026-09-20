CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id BIGINT UNSIGNED NOT NULL,
  reference VARCHAR(32) NOT NULL,
  idempotency_key_hash CHAR(64) NOT NULL,
  customer_name VARCHAR(120) NOT NULL,
  customer_phone VARCHAR(16) NOT NULL,
  delivery_address TEXT NOT NULL,
  notes VARCHAR(1000) NULL,
  currency_code CHAR(3) NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  status ENUM('NEW','CONFIRMED','PREPARING','READY','COMPLETED','CANCELLED') NOT NULL DEFAULT 'NEW',
  whatsapp_opened_at DATETIME NULL,
  stock_released_at DATETIME NULL,
  placed_at DATETIME NOT NULL,
  status_updated_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_orders_reference (reference),
  UNIQUE KEY uq_orders_store_idempotency (store_id,idempotency_key_hash),
  UNIQUE KEY uq_orders_id_store (id,store_id),
  KEY idx_orders_store_status_date (store_id,status,placed_at),
  KEY idx_orders_store_phone (store_id,customer_phone),
  CONSTRAINT fk_orders_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NULL,
  variant_id BIGINT UNSIGNED NULL,
  product_name VARCHAR(160) NOT NULL,
  product_slug VARCHAR(180) NULL,
  sku_snapshot VARCHAR(100) NULL,
  variant_label VARCHAR(300) NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_order_items_order (order_id),
  KEY idx_order_items_store_product (store_id,product_id),
  CONSTRAINT fk_order_items_order_store FOREIGN KEY (order_id,store_id) REFERENCES orders(id,store_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_status_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  status ENUM('NEW','CONFIRMED','PREPARING','READY','COMPLETED','CANCELLED') NOT NULL,
  changed_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  KEY idx_order_history_order_date (order_id,created_at),
  KEY idx_order_history_store (store_id),
  CONSTRAINT fk_order_history_order_store FOREIGN KEY (order_id,store_id) REFERENCES orders(id,store_id) ON DELETE CASCADE,
  CONSTRAINT fk_order_history_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
