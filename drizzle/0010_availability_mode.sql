-- ============================================================
-- Availability instead of quantities
-- ============================================================

-- This is a wholesale business: the shelf stock serves trade customers as well
-- as the website, so a number on a product would not mean "how many the site
-- may sell". Quantities will not be entered; availability is switched by hand.
--
-- 0009 changed the column default, which only affects new rows. Existing rows
-- were created under the old default of `track = true`, and with no quantity
-- ever entered they sit at on_hand = 0 with policy = 'deny' — a combination
-- under which claim_stock refuses every sale. Left as generated, this migration
-- would produce a store that cannot take a single order.
update inventory set track = false, available = true;
--> statement-breakpoint

-- Prices are entered tax-inclusive: the figure on the product page is what the
-- courier collects, with nothing added at checkout. Same reasoning — the 0009
-- default change does not reach the row that already exists.
update store_settings set tax_rate_bps = 0, prices_include_tax = true;
--> statement-breakpoint

-- Claims stock in whichever mode the variant is in.
--
-- Untracked (the default now): availability is a switch, not a count. Nothing
-- is decremented and no ledger entry is written, because as far as this system
-- knows no counted stock moved. Selling something switched off is still
-- refused — that is the whole purpose of the switch.
--
-- Tracked: unchanged from before. The guarded update and the ledger insert stay
-- in one statement so they cannot come apart.
--
-- The row is locked up front because everything below depends on a consistent
-- read of the variant's mode, and two concurrent buyers must not both pass the
-- guard.
create or replace function claim_stock(p_variant uuid, p_qty int, p_order uuid)
returns void language plpgsql as $$
declare v_track boolean; v_available boolean; v_ok boolean;
begin
  if p_qty <= 0 then
    raise exception 'claim_stock requires a positive quantity, got %', p_qty
      using errcode = 'check_violation';
  end if;

  select track, available into v_track, v_available
  from inventory where variant_id = p_variant
  for update;

  if not found then
    raise exception 'no inventory row for variant %', p_variant
      using errcode = 'foreign_key_violation';
  end if;

  if not v_track then
    if not v_available then
      raise exception 'variant % is marked unavailable', p_variant
        using errcode = 'check_violation';
    end if;
    return;
  end if;

  with upd as (
    update inventory set on_hand = on_hand - p_qty, updated_at = now()
     where variant_id = p_variant
       and (policy = 'continue' or (on_hand - reserved) >= p_qty)
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

-- Buyability now depends on the mode: a counted variant is judged on its
-- numbers, an uncounted one on its switch.
create or replace function refresh_product_stock(p_product uuid)
returns void language sql as $$
  update products p set in_stock = coalesce(agg.any_buyable, false)
  from (
    select bool_or(
             case
               when i.track
                 then (i.policy = 'continue' or (i.on_hand - i.reserved) > 0)
               else i.available
             end
           ) as any_buyable
    from variants v
    join inventory i on i.variant_id = v.id
    where v.product_id = p_product
  ) agg
  where p.id = p_product;
$$;
--> statement-breakpoint

-- The update trigger's WHEN clause has to include `available`, or flipping the
-- switch would leave in_stock stale — which is the one write this mode has.
-- A WHEN clause cannot be altered in place, so the trigger is replaced.
drop trigger if exists inventory_stock_update on inventory;
--> statement-breakpoint

create trigger inventory_stock_update
after update on inventory
for each row
when (
  old.available is distinct from new.available
  or old.track is distinct from new.track
  or old.on_hand is distinct from new.on_hand
  or old.reserved is distinct from new.reserved
  or old.policy is distinct from new.policy
)
execute function trg_inventory_stock();
--> statement-breakpoint

-- Re-evaluate every product under the new rules. Without this, in_stock still
-- holds values computed from the tracked-only logic above.
select refresh_product_stock(id) from products;
--> statement-breakpoint

-- ============================================================
-- Price history
-- ============================================================

-- Written by trigger so a price cannot change without being recorded, including
-- from a script or a psql session.
--
-- `changed_by` comes from a session variable the application sets inside the
-- transaction (`set local app.actor_id = '...'`). A trigger has no other way to
-- know who is acting; when nothing set it, the row records the change with no
-- actor rather than failing.
create or replace function trg_variant_price_history()
returns trigger language plpgsql as $$
declare v_actor uuid;
begin
  begin
    v_actor := nullif(current_setting('app.actor_id', true), '')::uuid;
  exception when others then
    v_actor := null;
  end;

  if old.price_cents is distinct from new.price_cents then
    insert into price_history (variant_id, field, old_cents, new_cents, changed_by)
    values (new.id, 'price', old.price_cents, new.price_cents, v_actor);
  end if;

  if old.cost_cents is distinct from new.cost_cents then
    insert into price_history (variant_id, field, old_cents, new_cents, changed_by)
    values (new.id, 'cost', old.cost_cents, new.cost_cents, v_actor);
  end if;

  if old.sale_price_cents is distinct from new.sale_price_cents then
    insert into price_history (variant_id, field, old_cents, new_cents, changed_by)
    values (new.id, 'sale_price', old.sale_price_cents, new.sale_price_cents, v_actor);
  end if;

  return null;
end $$;
--> statement-breakpoint

create trigger variants_price_history
after update on variants
for each row
when (
  old.price_cents is distinct from new.price_cents
  or old.cost_cents is distinct from new.cost_cents
  or old.sale_price_cents is distinct from new.sale_price_cents
)
execute function trg_variant_price_history();
--> statement-breakpoint

-- ============================================================
-- Tags
-- ============================================================

-- GIN over the array, so "has this tag" is an index lookup rather than a scan.
-- Not expressible in the Drizzle schema, which is why it is here.
create index products_tags_idx on products using gin (tags);
