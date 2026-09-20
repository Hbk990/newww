ALTER TABLE stores
  ADD COLUMN logo_path VARCHAR(500) NULL AFTER theme,
  ADD COLUMN banner_path VARCHAR(500) NULL AFTER logo_path,
  ADD COLUMN accent_color CHAR(7) NOT NULL DEFAULT '#2F5BFF' AFTER banner_path,
  ADD COLUMN font_key VARCHAR(30) NOT NULL DEFAULT 'system' AFTER accent_color,
  ADD COLUMN description VARCHAR(500) NULL AFTER font_key,
  ADD COLUMN contact_email VARCHAR(190) NULL AFTER description,
  ADD COLUMN address_text VARCHAR(500) NULL AFTER contact_email,
  ADD COLUMN social_links JSON NULL AFTER address_text;

CREATE TABLE IF NOT EXISTS store_slug_redirects (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id BIGINT UNSIGNED NOT NULL,
  old_slug VARCHAR(63) NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_store_slug_redirects_old_slug (old_slug),
  KEY idx_store_slug_redirects_store (store_id),
  CONSTRAINT fk_store_slug_redirects_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
