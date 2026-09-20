CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description VARCHAR(500) NULL,
  image_path VARCHAR(500) NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_categories_store_slug (store_id,slug),
  UNIQUE KEY uq_categories_id_store (id,store_id),
  KEY idx_categories_store_status_sort (store_id,status,sort_order),
  CONSTRAINT fk_categories_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NULL,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  sku VARCHAR(100) NULL,
  description TEXT NULL,
  price DECIMAL(12,2) NOT NULL,
  compare_price DECIMAL(12,2) NULL,
  availability ENUM('AVAILABLE','UNAVAILABLE') NOT NULL DEFAULT 'AVAILABLE',
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('DRAFT','ACTIVE','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_products_store_slug (store_id,slug),
  UNIQUE KEY uq_products_store_sku (store_id,sku),
  UNIQUE KEY uq_products_id_store (id,store_id),
  KEY idx_products_store_status (store_id,status,created_at),
  KEY idx_products_store_availability (store_id,availability),
  KEY idx_products_category (category_id),
  CONSTRAINT fk_products_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_products_category_store FOREIGN KEY (category_id,store_id) REFERENCES categories(id,store_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_images (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  path VARCHAR(500) NOT NULL,
  thumbnail_path VARCHAR(500) NULL,
  mime_type VARCHAR(50) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  width INT UNSIGNED NOT NULL,
  height INT UNSIGNED NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  KEY idx_product_images_product_sort (product_id,sort_order),
  KEY idx_product_images_store (store_id),
  CONSTRAINT fk_product_images_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_product_images_product_store FOREIGN KEY (product_id,store_id) REFERENCES products(id,store_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_options (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_product_options_product (product_id,sort_order),
  KEY idx_product_options_store (store_id),
  UNIQUE KEY uq_product_options_id_store (id,store_id),
  CONSTRAINT fk_product_options_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_product_options_product_store FOREIGN KEY (product_id,store_id) REFERENCES products(id,store_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_option_values (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id BIGINT UNSIGNED NOT NULL,
  option_id BIGINT UNSIGNED NOT NULL,
  value VARCHAR(100) NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_option_value (option_id,value),
  KEY idx_option_values_store (store_id),
  UNIQUE KEY uq_option_values_id_store (id,store_id),
  CONSTRAINT fk_option_values_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_option_values_option_store FOREIGN KEY (option_id,store_id) REFERENCES product_options(id,store_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_variants (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  label VARCHAR(300) NOT NULL,
  sku VARCHAR(100) NULL,
  price_adjustment DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  stock_quantity INT UNSIGNED NULL,
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_variants_store_sku (store_id,sku),
  KEY idx_variants_product (product_id),
  UNIQUE KEY uq_variants_id_store (id,store_id),
  CONSTRAINT fk_variants_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_variants_product_store FOREIGN KEY (product_id,store_id) REFERENCES products(id,store_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_variant_values (
  store_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  option_value_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (variant_id,option_value_id),
  KEY idx_variant_values_store (store_id),
  CONSTRAINT fk_variant_values_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_variant_values_variant_store FOREIGN KEY (variant_id,store_id) REFERENCES product_variants(id,store_id) ON DELETE CASCADE,
  CONSTRAINT fk_variant_values_value_store FOREIGN KEY (option_value_id,store_id) REFERENCES product_option_values(id,store_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
