-- Keeps the denormalized read model on `products` in step with `variants` and
-- `product_images`.
--
-- Why triggers rather than application code: these columns are what every
-- listing page reads, so a stale value is a wrong price on the storefront. A
-- script, a migration or a psql session that touches variants would silently
-- skip an application-level recalculation. The database is the only place that
-- sees every write.

create or replace function refresh_product_summary(p_product uuid)
returns void language sql as $$
  update products p set
    min_price_cents   = agg.min_price,
    max_price_cents   = agg.max_price,
    variant_count     = agg.n,
    primary_image_url = img.url
  from (
    select min(price_cents) as min_price,
           max(price_cents) as max_price,
           count(*)         as n
    from variants
    where product_id = p_product
  ) agg
  left join lateral (
    select url from product_images
    where product_id = p_product
    order by position, id
    limit 1
  ) img on true
  where p.id = p_product;
$$;
--> statement-breakpoint

-- Variants: price and count.
create or replace function trg_variant_summary()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform refresh_product_summary(old.product_id);
  else
    perform refresh_product_summary(new.product_id);
    -- A variant moved between products leaves the old one stale otherwise.
    if tg_op = 'UPDATE' and old.product_id is distinct from new.product_id then
      perform refresh_product_summary(old.product_id);
    end if;
  end if;
  return null;
end $$;
--> statement-breakpoint

create trigger variants_summary_insert_delete
after insert or delete on variants
for each row execute function trg_variant_summary();
--> statement-breakpoint

-- The WHEN clause matters: variants get touched for stock, position and SKU
-- edits that cannot change any summary column, and recalculating on those
-- would make every such write cost an extra aggregate.
create trigger variants_summary_update
after update on variants
for each row
when (
  old.price_cents is distinct from new.price_cents
  or old.product_id is distinct from new.product_id
)
execute function trg_variant_summary();
--> statement-breakpoint

-- Images: the listing thumbnail.
create or replace function trg_product_image_summary()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform refresh_product_summary(old.product_id);
  else
    perform refresh_product_summary(new.product_id);
    if tg_op = 'UPDATE' and old.product_id is distinct from new.product_id then
      perform refresh_product_summary(old.product_id);
    end if;
  end if;
  return null;
end $$;
--> statement-breakpoint

create trigger product_images_summary_insert_delete
after insert or delete on product_images
for each row execute function trg_product_image_summary();
--> statement-breakpoint

create trigger product_images_summary_update
after update on product_images
for each row
when (
  old.url is distinct from new.url
  or old.position is distinct from new.position
  or old.product_id is distinct from new.product_id
)
execute function trg_product_image_summary();
