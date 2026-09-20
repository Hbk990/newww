ALTER TABLE stores
  ADD COLUMN seo_title VARCHAR(70) NULL AFTER description,
  ADD COLUMN seo_description VARCHAR(160) NULL AFTER seo_title,
  ADD COLUMN search_indexing TINYINT(1) NOT NULL DEFAULT 1 AFTER seo_description,
  ADD KEY idx_stores_status_indexing (status,search_indexing);

UPDATE plans
SET features=JSON_SET(
  COALESCE(features,JSON_OBJECT()),
  '$.remove_platform_branding',
  IF(code='FREE',FALSE,TRUE)
),updated_at=UTC_TIMESTAMP();
