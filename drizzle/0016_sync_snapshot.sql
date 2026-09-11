-- ============================================================
-- Snapshot sync — intentionally does nothing
-- ============================================================

-- 0014 and 0015 are hand-written, so drizzle-kit never wrote a snapshot for
-- either and its view of the schema stopped at 0013. The next `generate` would
-- diff against that stale picture and re-emit every change 0015 already made.
--
-- This migration exists only to carry the snapshot forward, so a future
-- `generate` starts from what the database actually contains. Its SQL is empty
-- by design; meta/0016_snapshot.json is the real payload.
--
-- Do not trust `generate` for product_attributes or attribute_options. Run it
-- against the schema and it emits a WEAKER version of this table than 0015
-- installed: no NULLS NOT DISTINCT on product_attributes_value_uq, no
-- composite (attribute_id, option_id) foreign key, and no single-value
-- trigger — none of which Drizzle can express. Read what it generates before
-- applying it, and hand-write anything it drops.

select 1 where false;
