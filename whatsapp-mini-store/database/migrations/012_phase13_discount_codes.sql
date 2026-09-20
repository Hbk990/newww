CREATE TABLE IF NOT EXISTS discount_codes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(40) NOT NULL,
  type ENUM('PERCENT_ORDER','FIXED_ORDER','PERCENT_PRODUCT','PERCENT_CATEGORY','FREE_DELIVERY') NOT NULL,
  value DECIMAL(12,2) NULL,
  scope_product_id BIGINT UNSIGNED NULL,
  scope_category_id BIGINT UNSIGNED NULL,
  min_order_amount DECIMAL(12,2) NULL,
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  usage_limit INT UNSIGNED NULL,
  usage_limit_per_customer INT UNSIGNED NULL,
  times_used INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_discount_codes_store_code (store_id,code),
  UNIQUE KEY uq_discount_codes_id_store (id,store_id),
  KEY idx_discount_codes_store_status (store_id,status),
  CONSTRAINT fk_discount_codes_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_discount_codes_product_store FOREIGN KEY (scope_product_id,store_id) REFERENCES products(id,store_id) ON DELETE CASCADE,
  CONSTRAINT fk_discount_codes_category_store FOREIGN KEY (scope_category_id,store_id) REFERENCES categories(id,store_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS discount_code_redemptions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id BIGINT UNSIGNED NOT NULL,
  discount_code_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NULL,
  discount_amount DECIMAL(12,2) NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_redemptions_order_store (order_id,store_id),
  KEY idx_redemptions_code_customer (discount_code_id,customer_id),
  CONSTRAINT fk_redemptions_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_redemptions_code_store FOREIGN KEY (discount_code_id,store_id) REFERENCES discount_codes(id,store_id) ON DELETE CASCADE,
  CONSTRAINT fk_redemptions_order_store FOREIGN KEY (order_id,store_id) REFERENCES orders(id,store_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE orders
  ADD COLUMN discount_code_id BIGINT UNSIGNED NULL AFTER total,
  ADD COLUMN discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER discount_code_id,
  ADD COLUMN discount_code_snapshot VARCHAR(40) NULL AFTER discount_amount,
  ADD COLUMN free_delivery TINYINT(1) NOT NULL DEFAULT 0 AFTER discount_code_snapshot,
  ADD CONSTRAINT fk_orders_discount_code_store FOREIGN KEY (discount_code_id,store_id) REFERENCES discount_codes(id,store_id) ON DELETE RESTRICT;
