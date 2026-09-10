-- ============================================================
-- Order numbers: DR-YYYYMMDD-#####
-- ============================================================

-- Per-day, gapless, and safe under concurrency.
--
-- The counter has to be per-day now that the number carries the date, so the
-- single running total in store_settings is gone. The upsert is one statement:
-- the first order of a day inserts seq 1, every later one increments, and the
-- row lock serializes them. Two simultaneous checkouts cannot get the same
-- number, and a rolled-back checkout does leave a gap in the day's sequence —
-- accepted, because the alternative is holding a lock across the whole
-- checkout.
create or replace function next_order_number()
returns text language plpgsql as $$
declare d date := current_date; n integer;
begin
  insert into order_number_counters (day, seq) values (d, 1)
  on conflict (day) do update set seq = order_number_counters.seq + 1
  returning seq into n;

  return 'DR-' || to_char(d, 'YYYYMMDD') || '-' || lpad(n::text, 5, '0');
end $$;
--> statement-breakpoint

-- ============================================================
-- products.sales_count — Best Sellers
-- ============================================================

-- Units sold, excluding cancelled and returned orders.
--
-- Recomputed from order_items rather than incremented, because an increment
-- cannot be undone correctly: a cancellation, a return, an edited order and a
-- deleted line all have to move the number, and four separate adjustments
-- drift apart. Recomputing is a single indexed aggregate per product.
--
-- NOTE the `status::text` cast, and do not "tidy" it away. 'returned' is added
-- to order_status by 0005, and a fresh database applies every pending migration
-- in ONE transaction — Postgres refuses to resolve an enum value in the same
-- transaction that added it ("unsafe use of new value"). Comparing as text
-- sidesteps the resolution entirely. Without the cast this file applies fine to
-- a database where 0005 already committed and fails on every fresh one, so the
-- breakage shows up on deploy rather than in development. No index on
-- orders.status is involved here, so the cast costs nothing.
create or replace function refresh_product_sales(p_products uuid[])
returns void language sql as $$
  update products p set sales_count = coalesce(agg.units, 0)
  from unnest(p_products) as ids(id)
  left join lateral (
    select sum(oi.quantity)::int as units
    from order_items oi
    join orders o on o.id = oi.order_id
    where oi.product_id = ids.id
      and o.status::text not in ('cancelled', 'returned')
  ) agg on true
  where p.id = ids.id;
$$;
--> statement-breakpoint

-- Statement-level with transition tables: an order of twelve lines is one
-- insert, and a row-level trigger would run the aggregate twelve times.
create or replace function trg_order_items_sales_ins()
returns trigger language plpgsql as $$
declare a uuid[];
begin
  select array_agg(distinct product_id) into a from new_rows where product_id is not null;
  if a is not null then perform refresh_product_sales(a); end if;
  return null;
end $$;
--> statement-breakpoint

create or replace function trg_order_items_sales_del()
returns trigger language plpgsql as $$
declare a uuid[];
begin
  select array_agg(distinct product_id) into a from old_rows where product_id is not null;
  if a is not null then perform refresh_product_sales(a); end if;
  return null;
end $$;
--> statement-breakpoint

-- An edited order line can change the quantity or move to another product, so
-- both sides need recomputing.
create or replace function trg_order_items_sales_upd()
returns trigger language plpgsql as $$
declare a uuid[];
begin
  select array_agg(distinct pid) into a from (
    select product_id as pid from new_rows where product_id is not null
    union
    select product_id from old_rows where product_id is not null
  ) both_sides;
  if a is not null then perform refresh_product_sales(a); end if;
  return null;
end $$;
--> statement-breakpoint

create trigger order_items_sales_insert
after insert on order_items
referencing new table as new_rows
for each statement execute function trg_order_items_sales_ins();
--> statement-breakpoint

create trigger order_items_sales_delete
after delete on order_items
referencing old table as old_rows
for each statement execute function trg_order_items_sales_del();
--> statement-breakpoint

create trigger order_items_sales_update
after update on order_items
referencing old table as old_rows new table as new_rows
for each statement execute function trg_order_items_sales_upd();
--> statement-breakpoint

-- Cancelling or returning an order has to remove its units from the count, and
-- un-cancelling has to put them back. The WHEN clause keeps every other status
-- move — confirmed, preparing, ready, delivered — free.
--
-- Cast to text for the same reason as above: a trigger's WHEN clause is
-- resolved at CREATE TRIGGER time, so naming 'returned' directly fails on a
-- fresh database.
create or replace function trg_orders_sales_status()
returns trigger language plpgsql as $$
declare a uuid[];
begin
  select array_agg(distinct product_id) into a
  from order_items where order_id = new.id and product_id is not null;
  if a is not null then perform refresh_product_sales(a); end if;
  return null;
end $$;
--> statement-breakpoint

create trigger orders_sales_status
after update on orders
for each row
when (
  old.status is distinct from new.status
  and (
    old.status::text in ('cancelled', 'returned')
    or new.status::text in ('cancelled', 'returned')
  )
)
execute function trg_orders_sales_status();
--> statement-breakpoint

-- ============================================================
-- products.review_count / rating_avg
-- ============================================================

-- Approved reviews only, so a pending or rejected review never moves a star
-- rating on the storefront.
create or replace function refresh_product_reviews(p_product uuid)
returns void language sql as $$
  update products p set
    review_count = coalesce(agg.n, 0),
    rating_avg   = agg.avg
  from (
    select count(*)::int as n,
           round(avg(rating)::numeric, 1) as avg
    from reviews
    where product_id = p_product and status = 'approved'
  ) agg
  where p.id = p_product;
$$;
--> statement-breakpoint

create or replace function trg_reviews_aggregate()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform refresh_product_reviews(old.product_id);
  else
    perform refresh_product_reviews(new.product_id);
    if tg_op = 'UPDATE' and old.product_id is distinct from new.product_id then
      perform refresh_product_reviews(old.product_id);
    end if;
  end if;
  return null;
end $$;
--> statement-breakpoint

create trigger reviews_aggregate_insert_delete
after insert or delete on reviews
for each row execute function trg_reviews_aggregate();
--> statement-breakpoint

-- Only moderation and rating changes matter; editing a review's body does not
-- move the average.
create trigger reviews_aggregate_update
after update on reviews
for each row
when (
  old.status is distinct from new.status
  or old.rating is distinct from new.rating
  or old.product_id is distinct from new.product_id
)
execute function trg_reviews_aggregate();
--> statement-breakpoint

-- ============================================================
-- Search: autocomplete and typo tolerance
-- ============================================================

-- Trigram matching tolerates misspellings without running a separate search
-- service. GIN indexes on gin_trgm_ops cannot be expressed in the Drizzle
-- schema, so they live here; they are additive, and drizzle-kit leaves indexes
-- it does not know about alone.
--
-- HOW TO QUERY THESE (measured, not assumed):
--
--   Use the word_similarity operator `<%`, NOT plain `%`. `%` compares whole
--   strings, so a long title dilutes the score and a typo finds nothing:
--   'chargr' % 'Green Lion - 65W GaN Charger' is below threshold and returns no
--   rows. 'chargr' <% title scores 0.714 and matches, because word_similarity
--   compares the query against the best-matching word extent in the target.
--   Verified: chargr -> Charger 0.714, magnetc -> Magnetic 0.750,
--   caisles -> Caisless 0.875.
--
--   Lower the threshold for search queries. pg_trgm.word_similarity_threshold
--   defaults to 0.6, which rejects real typos — 'erbuds' does not reach
--   'Earbuds'. Set it to about 0.4 on the search connection and order results by
--   word_similarity() descending.
--
--   ILIKE '%term%' also uses these indexes, for exact substring search.
--
-- On index usage: at 1,200 products the planner correctly prefers a sequential
-- scan, because scanning 1,200 titles costs about 0.5ms. Forcing the index
-- proves it is used and functional (Bitmap Index Scan on
-- products_title_trgm_idx). These indexes are insurance for catalog growth, not
-- a speed-up at today's size — do not "fix" a seq scan you see in a plan here.
create extension if not exists pg_trgm;
--> statement-breakpoint

create index products_title_trgm_idx on products using gin (title gin_trgm_ops);
--> statement-breakpoint
create index variants_title_trgm_idx on variants using gin (title gin_trgm_ops);
--> statement-breakpoint
create index variants_sku_trgm_idx on variants using gin (sku gin_trgm_ops);
--> statement-breakpoint
create index brands_name_trgm_idx on brands using gin (name gin_trgm_ops);
--> statement-breakpoint
-- The device picker searches this: "17 pro max", "s25", "redmi note".
create index device_models_name_trgm_idx on device_models using gin (name gin_trgm_ops);
--> statement-breakpoint
-- The admin's prefill lookup over the 1,155 source lines.
create index source_products_name_trgm_idx on source_products using gin (name gin_trgm_ops);
