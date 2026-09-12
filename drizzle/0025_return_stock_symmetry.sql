-- return_stock must mirror claim_stock, and did not.
--
-- claim_stock returns early for an untracked variant: nothing is counted, so
-- nothing is decremented. return_stock had no such check and incremented
-- on_hand unconditionally.
--
-- Nothing has called return_stock yet, so no damage is done — but the first
-- caller lands in this commit, and the asymmetry would have been ugly. An
-- untracked variant's on_hand would creep upward with every cancellation,
-- against claims that never happened, and the day someone switched that
-- variant to tracked it would open with phantom stock and a ledger full of
-- returns that have no matching sale.
--
-- The ledger row goes too, for untracked variants. A movement of stock that
-- was never counted is not a movement, and recording it would make the ledger
-- disagree with itself: reconciling a variant's history would show returns
-- with no sales.

create or replace function return_stock(
  p_variant uuid,
  p_qty int,
  p_order uuid,
  p_reason text default 'refused_delivery'
) returns void language plpgsql as $$
declare v_track boolean; v_ok boolean;
begin
  if p_qty <= 0 then
    raise exception 'return_stock requires a positive quantity, got %', p_qty
      using errcode = 'check_violation';
  end if;

  select track into v_track
  from inventory where variant_id = p_variant
  for update;

  -- Still an error, and still the same error: a variant with no inventory row
  -- at all is a setup fault, not an untracked variant.
  if not found then
    raise exception 'no inventory row for variant %', p_variant
      using errcode = 'foreign_key_violation';
  end if;

  if not v_track then
    return;
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
    raise exception 'return_stock failed to update variant %', p_variant
      using errcode = 'internal_error';
  end if;
end $$;
