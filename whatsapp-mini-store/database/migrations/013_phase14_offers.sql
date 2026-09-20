ALTER TABLE stores
  ADD COLUMN offers_page_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER theme;

CREATE TABLE IF NOT EXISTS offers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  headline VARCHAR(160) NULL,
  type ENUM('BUY_X_GET_Y','CATEGORY_BUY_N_GET_M','FIXED_BUNDLE') NOT NULL,
  scope_product_id BIGINT UNSIGNED NULL,
  scope_category_id BIGINT UNSIGNED NULL,
  buy_quantity INT UNSIGNED NULL,
  get_quantity INT UNSIGNED NULL,
  get_discount_type ENUM('FREE','PERCENT') NULL,
  get_discount_value DECIMAL(12,2) NULL,
  bundle_price DECIMAL(12,2) NULL,
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_offers_id_store (id,store_id),
  KEY idx_offers_store_status (store_id,status),
  CONSTRAINT fk_offers_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_offers_product_store FOREIGN KEY (scope_product_id,store_id) REFERENCES products(id,store_id) ON DELETE CASCADE,
  CONSTRAINT fk_offers_category_store FOREIGN KEY (scope_category_id,store_id) REFERENCES categories(id,store_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS offer_bundle_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id BIGINT UNSIGNED NOT NULL,
  offer_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_offer_bundle_product (offer_id,product_id),
  KEY idx_offer_bundle_items_offer (offer_id),
  CONSTRAINT fk_offer_bundle_items_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_offer_bundle_items_offer_store FOREIGN KEY (offer_id,store_id) REFERENCES offers(id,store_id) ON DELETE CASCADE,
  CONSTRAINT fk_offer_bundle_items_product_store FOREIGN KEY (product_id,store_id) REFERENCES products(id,store_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS offer_redemptions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id BIGINT UNSIGNED NOT NULL,
  offer_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  discount_amount DECIMAL(12,2) NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_offer_redemptions_offer (offer_id),
  KEY idx_offer_redemptions_order (order_id,store_id),
  CONSTRAINT fk_offer_redemptions_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_offer_redemptions_offer_store FOREIGN KEY (offer_id,store_id) REFERENCES offers(id,store_id) ON DELETE CASCADE,
  CONSTRAINT fk_offer_redemptions_order_store FOREIGN KEY (order_id,store_id) REFERENCES orders(id,store_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE orders
  ADD COLUMN offer_discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER free_delivery,
  ADD COLUMN offer_snapshot VARCHAR(500) NULL AFTER offer_discount_amount;
