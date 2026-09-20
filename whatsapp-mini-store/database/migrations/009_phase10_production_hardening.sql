ALTER TABLE orders
  ADD KEY idx_orders_store_date (store_id,placed_at,id);

ALTER TABLE products
  ADD KEY idx_products_public_catalog (store_id,status,deleted_at,category_id,created_at);

INSERT INTO system_tasks (task_key,label,last_status,updated_at) VALUES
('maintenance','Application maintenance','NEVER',UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE label=VALUES(label);
