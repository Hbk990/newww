-- Deferred foreign key: inventory_reservations is declared before carts, so the
-- reference cannot be expressed in the Drizzle schema without a circular import.
alter table inventory_reservations
  add constraint inventory_reservations_cart_id_fk
  foreign key (cart_id) references carts(id) on delete cascade;
--> statement-breakpoint

-- ============================================================
-- Stock claiming
-- ============================================================

-- Claims stock and records the movement in ONE statement.
--
-- Do not decrement inventory and insert the ledger row separately: the guard on
-- the UPDATE can filter the row out while the following INSERT still runs,
-- recording a sale that never happened. Observed in testing, which is why this
-- function exists at all. Chaining the ledger insert off the UPDATE's RETURNING
-- makes the pair inseparable, and raising on an empty result turns a silent
-- no-op into a caught error.
create or replace function claim_stock(p_variant uuid, p_qty int, p_order uuid)
returns void language plpgsql as $$
declare v_ok boolean;
begin
  if p_qty <= 0 then
    raise exception 'claim_stock requires a positive quantity, got %', p_qty
      using errcode = 'check_violation';
  end if;

  with upd as (
    update inventory set on_hand = on_hand - p_qty, updated_at = now()
     where variant_id = p_variant
       and (not track or policy = 'continue' or (on_hand - reserved) >= p_qty)
    returning variant_id
  ), led as (
    insert into inventory_ledger (variant_id, delta, reason, reference_id)
    select variant_id, -p_qty, 'sale', p_order from upd
    returning 1
  )
  select exists (select 1 from led) into v_ok;

  if not v_ok then
    raise exception 'insufficient stock for variant % (requested %)', p_variant, p_qty
      using errcode = 'check_violation';
  end if;
end $$;
--> statement-breakpoint

-- Returns stock to the shelf. A refused Cash on Delivery parcel is a routine
-- path, not an exception, so putting goods back has to be as reliable as
-- selling them — same single-statement shape, same ledger guarantee.
create or replace function return_stock(
  p_variant uuid, p_qty int, p_order uuid, p_reason text default 'refused_delivery'
) returns void language plpgsql as $$
declare v_ok boolean;
begin
  if p_qty <= 0 then
    raise exception 'return_stock requires a positive quantity, got %', p_qty
      using errcode = 'check_violation';
  end if;

  with upd as (
    update inventory set on_hand = on_hand + p_qty, updated_at = now()
     where variant_id = p_variant
    returning variant_id
  ), led as (
    insert into inventory_ledger (variant_id, delta, reason, reference_id)
    select variant_id, p_qty, p_reason, p_order from upd
    returning 1
  )
  select exists (select 1 from led) into v_ok;

  if not v_ok then
    raise exception 'no inventory row for variant %', p_variant
      using errcode = 'foreign_key_violation';
  end if;
end $$;
--> statement-breakpoint

-- ============================================================
-- products.in_stock — completes the listing read model
-- ============================================================

-- Buyable means: not tracked, or backorders allowed, or something available.
create or replace function refresh_product_stock(p_product uuid)
returns void language sql as $$
  update products p set in_stock = coalesce(agg.any_buyable, false)
  from (
    select bool_or(
             not i.track
             or i.policy = 'continue'
             or (i.on_hand - i.reserved) > 0
           ) as any_buyable
    from variants v
    join inventory i on i.variant_id = v.id
    where v.product_id = p_product
  ) agg
  where p.id = p_product;
$$;
--> statement-breakpoint

create or replace function trg_inventory_stock()
returns trigger language plpgsql as $$
declare v_product uuid;
begin
  -- On a cascade delete the variant is already gone; the variants trigger has
  -- recalculated by then, so there is nothing left to do.
  select product_id into v_product from variants
   where id = coalesce(new.variant_id, old.variant_id);
  if v_product is not null then
    perform refresh_product_stock(v_product);
  end if;
  return null;
end $$;
--> statement-breakpoint

create trigger inventory_stock_insert_delete
after insert or delete on inventory
for each row execute function trg_inventory_stock();
--> statement-breakpoint

-- Only the four columns that can change buyability. Stock is the most
-- frequently written table in the schema, so an unfiltered trigger here would
-- tax every single write.
create trigger inventory_stock_update
after update on inventory
for each row
when (
  old.on_hand is distinct from new.on_hand
  or old.reserved is distinct from new.reserved
  or old.track is distinct from new.track
  or old.policy is distinct from new.policy
)
execute function trg_inventory_stock();
--> statement-breakpoint

-- A variant appearing or disappearing changes buyability too. AFTER DELETE sees
-- the variant already removed, so the aggregate above correctly excludes it.
create or replace function trg_variant_stock()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform refresh_product_stock(old.product_id);
  else
    perform refresh_product_stock(new.product_id);
    if tg_op = 'UPDATE' and old.product_id is distinct from new.product_id then
      perform refresh_product_stock(old.product_id);
    end if;
  end if;
  return null;
end $$;
--> statement-breakpoint

create trigger variants_stock_insert_delete
after insert or delete on variants
for each row execute function trg_variant_stock();
--> statement-breakpoint

create trigger variants_stock_move
after update on variants
for each row
when (old.product_id is distinct from new.product_id)
execute function trg_variant_stock();
--> statement-breakpoint

-- ============================================================
-- product_device_fit rollup
-- ============================================================

-- Rebuilds the product-level fitment rollup from the variant-level truth, so a
-- "Shop by device" page is one indexed lookup instead of a join through every
-- variant.
create or replace function refresh_product_device_fit(p_products uuid[])
returns void language plpgsql as $$
begin
  delete from product_device_fit where product_id = any(p_products);
  insert into product_device_fit (product_id, device_model_id)
  select distinct v.product_id, f.device_model_id
  from variants v
  join variant_device_fit f on f.variant_id = v.id
  where v.product_id = any(p_products);
end $$;
--> statement-breakpoint

-- Statement-level with transition tables, not row-level: entering fitment for a
-- 15-colour x 4-device product is one insert of 60 rows, and a row-level
-- trigger would rebuild the same rollup 60 times.
create or replace function trg_vdf_rollup_insert()
returns trigger language plpgsql as $$
declare affected uuid[];
begin
  select array_agg(distinct v.product_id) into affected
  from new_rows n join variants v on v.id = n.variant_id;
  if affected is not null then perform refresh_product_device_fit(affected); end if;
  return null;
end $$;
--> statement-breakpoint

create or replace function trg_vdf_rollup_delete()
returns trigger language plpgsql as $$
declare affected uuid[];
begin
  select array_agg(distinct v.product_id) into affected
  from old_rows o join variants v on v.id = o.variant_id;
  if affected is not null then perform refresh_product_device_fit(affected); end if;
  return null;
end $$;
--> statement-breakpoint

create trigger variant_device_fit_rollup_insert
after insert on variant_device_fit
referencing new table as new_rows
for each statement execute function trg_vdf_rollup_insert();
--> statement-breakpoint

create trigger variant_device_fit_rollup_delete
after delete on variant_device_fit
referencing old table as old_rows
for each statement execute function trg_vdf_rollup_delete();
--> statement-breakpoint

-- ============================================================
-- Order numbers
-- ============================================================

-- Human-facing order numbers with no gaps and no duplicates. A sequence would
-- be faster but leaks gaps on every rolled-back checkout, and customers and
-- staff read these numbers aloud to each other. The row lock serializes
-- checkouts, which is not a concern at Cash on Delivery volumes.
create or replace function next_order_number()
returns text language plpgsql as $$
declare n integer;
begin
  update store_settings set order_number_seq = order_number_seq + 1
   where id
  returning order_number_seq into n;

  if n is null then
    raise exception 'store_settings has no row; seed it before taking orders'
      using errcode = 'no_data_found';
  end if;
  return n::text;
end $$;
