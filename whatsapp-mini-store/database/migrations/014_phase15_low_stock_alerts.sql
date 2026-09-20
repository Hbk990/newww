ALTER TABLE stores
  ADD COLUMN low_stock_threshold INT UNSIGNED NOT NULL DEFAULT 5 AFTER offers_page_enabled;
