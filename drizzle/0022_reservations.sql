ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_cart_variant_key" UNIQUE("cart_id","variant_id");--> statement-breakpoint

-- ============================================================
-- Soft holds on stock while an item sits in a cart
-- ============================================================
--
-- The table and its indexes have existed since 0002; nothing ever wrote to it.
-- These are the three operations a cart needs: take a hold, give it back, and
-- sweep up the holds nobody gave back.
--
-- `inventory.reserved` is treated throughout as a cached aggregate of the live
-- reservation rows, never as a counter to be nudged up and down. Every function
-- below recomputes it with a SUM rather than applying a delta. That costs one
-- extra index scan and buys two things: the operations are idempotent, so a
-- retried release cannot double-subtract, and any drift that does creep in is
-- corrected by the next write rather than compounding. A decrement-based
-- sweeper that ever drove `reserved` negative would trip
-- `inventory_reserved_nonneg`, fail, and then fail identically every night
-- after — the worst possible failure for an unattended job.

-- ============================================================
-- reserve_stock
-- ============================================================
--
-- Sets the hold for one cart line to exactly p_qty, rather than adding p_qty to
-- whatever was there. The cart already knows the quantity the shopper wants, so
-- an absolute set is both what the caller has to hand and immune to a retry
-- doubling the hold. p_qty = 0 releases the line.
create or replace function reserve_stock(
  p_variant uuid,
  p_qty int,
  p_cart uuid,
  p_ttl interval default interval '30 minutes'
) returns void language plpgsql as $$
declare
  v_track boolean; v_available boolean; v_policy text;
  v_on_hand int; v_reserved int;
begin
  if p_qty < 0 then
    raise exception 'reserve_stock requires a non-negative quantity, got %', p_qty
      using errcode = 'check_violation';
  end if;

  -- FOR UPDATE before anything else: two shoppers reserving the last unit at
  -- the same moment must serialise here, or both read the same on_hand and both
  -- succeed.
  select track, available, policy, on_hand
    into v_track, v_available, v_policy, v_on_hand
  from inventory where variant_id = p_variant
  for update;

  if not found then
    raise exception 'no inventory row for variant %', p_variant
      using errcode = 'foreign_key_violation';
  end if;

  -- An untracked variant has no units to hold: `available` is a switch someone
  -- flips and nothing is counted. Checking it and returning is the whole of the
  -- work, and deliberately leaves no reservation row behind — rows that can
  -- never affect `reserved` would be a standing lie about what is held.
  if not v_track then
    if p_qty > 0 and not v_available then
      raise exception 'variant % is marked unavailable', p_variant
        using errcode = 'check_violation';
    end if;
    delete from inventory_reservations
     where cart_id = p_cart and variant_id = p_variant;
    return;
  end if;

  if p_qty = 0 then
    delete from inventory_reservations
     where cart_id = p_cart and variant_id = p_variant;
  else
    insert into inventory_reservations (variant_id, cart_id, quantity, expires_at)
    values (p_variant, p_cart, p_qty, now() + p_ttl)
    on conflict (cart_id, variant_id) do update
      set quantity = excluded.quantity,
          expires_at = excluded.expires_at;
  end if;

  update inventory set
    reserved = (
      select coalesce(sum(r.quantity), 0)
      from inventory_reservations r
      where r.variant_id = p_variant
    ),
    updated_at = now()
  where variant_id = p_variant
  returning on_hand, reserved into v_on_hand, v_reserved;

  -- Checked after the write and raised rather than avoided beforehand: the
  -- raise aborts the caller's transaction, so nothing persists, and this way
  -- the arithmetic lives in one SUM instead of being duplicated as a
  -- pre-flight estimate that could disagree with it.
  --
  -- 'continue' is the backorder policy: overselling is the owner's choice
  -- there, so a hold beyond on_hand is allowed.
  if v_policy <> 'continue' and (v_on_hand - v_reserved) < 0 then
    raise exception 'insufficient stock to reserve % of variant % (on hand %, reserved %)',
      p_qty, p_variant, v_on_hand, v_reserved
      using errcode = 'check_violation';
  end if;
end $$;
--> statement-breakpoint

-- ============================================================
-- release_cart_reservations
-- ============================================================
--
-- Gives back every hold a cart owns, and returns how many lines it released.
--
-- Called on checkout before claim_stock, which is not optional: claim_stock
-- gates on (on_hand - reserved) >= qty, so a cart still holding its own
-- reservation would be refused its own stock. The two must run in one
-- transaction — releasing and then failing to claim would hand the units to
-- someone else mid-checkout.
create or replace function release_cart_reservations(p_cart uuid)
returns int language plpgsql as $$
declare v_variants uuid[]; v_count int;
begin
  -- Which variants are affected has to be captured before the delete, since
  -- afterwards there is nothing left to tell us what to recompute.
  select array_agg(distinct variant_id) into v_variants
  from inventory_reservations where cart_id = p_cart;

  if v_variants is null then
    return 0;
  end if;

  delete from inventory_reservations where cart_id = p_cart;
  get diagnostics v_count = row_count;

  update inventory i set
    reserved = (
      select coalesce(sum(r.quantity), 0)
      from inventory_reservations r
      where r.variant_id = i.variant_id
    ),
    updated_at = now()
  where i.variant_id = any(v_variants);

  return v_count;
end $$;
--> statement-breakpoint

-- ============================================================
-- expire_reservations
-- ============================================================
--
-- The sweeper. Holds expire rather than being released on abandonment because
-- nobody tells you they abandoned a cart: without this, one shopper who closed
-- a tab holds the last unit for ever and the variant reads out of stock to
-- everyone else.
--
-- Returns the number of holds released, so a scheduled caller can log something
-- meaningful instead of "ran".
create or replace function expire_reservations()
returns int language plpgsql as $$
declare v_variants uuid[]; v_count int;
begin
  select array_agg(distinct variant_id) into v_variants
  from inventory_reservations where expires_at <= now();

  if v_variants is null then
    return 0;
  end if;

  delete from inventory_reservations where expires_at <= now();
  get diagnostics v_count = row_count;

  update inventory i set
    reserved = (
      select coalesce(sum(r.quantity), 0)
      from inventory_reservations r
      where r.variant_id = i.variant_id
    ),
    updated_at = now()
  where i.variant_id = any(v_variants);

  -- in_stock is derived from what is sellable, and releasing holds can make a
  -- variant sellable again. Skipped when nothing expired, which is the usual
  -- case, so the common path stays cheap.
  perform refresh_product_stock(p.id)
  from products p
  where exists (
    select 1 from variants v
    where v.product_id = p.id and v.id = any(v_variants)
  );

  return v_count;
end $$;
