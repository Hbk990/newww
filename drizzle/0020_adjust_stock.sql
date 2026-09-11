-- ============================================================
-- Stock adjustments that are not sales
-- ============================================================

/*
 * claim_stock and return_stock cover the two movements an order makes: a sale
 * out, and a refused delivery back in. Neither fits what an admin does.
 *
 * claim_stock writes reason 'sale' and refuses when a variant is marked
 * unavailable, so it cannot record damage or loss. return_stock only ever
 * increments. Between them there is no way to say "the shelf holds 7, the
 * system says 9" or "two of these arrived broken".
 *
 * The single-statement shape is copied deliberately from claim_stock. Writing
 * the guarded UPDATE and the ledger INSERT as two statements is exactly the
 * bug that made this schema oversell: the guard filtered the row out while the
 * following insert still recorded a movement that never happened. Chaining the
 * insert off the UPDATE's RETURNING means no row, no ledger entry.
 */
create or replace function adjust_stock(
  p_variant uuid,
  p_delta integer,
  p_reason text,
  p_note text default null
) returns integer
language plpgsql
as $$
declare
  v_track boolean;
  v_before integer;
  v_after integer;
begin
  if p_delta = 0 then
    raise exception 'adjust_stock needs a non-zero change'
      using errcode = 'check_violation';
  end if;

  select track, on_hand into v_track, v_before
  from inventory where variant_id = p_variant
  for update;

  if not found then
    raise exception 'no inventory row for variant %', p_variant
      using errcode = 'foreign_key_violation';
  end if;

  /*
   * Refused rather than silently enabling tracking.
   *
   * An untracked variant sells on its availability switch alone and ignores
   * on_hand entirely, so a number written here would look authoritative and
   * change nothing. Turning tracking on also changes how the variant behaves
   * at checkout, which is a decision someone should make on purpose.
   */
  if not v_track then
    raise exception 'variant % is not tracked; turn tracking on before adjusting a quantity', p_variant
      using errcode = 'check_violation';
  end if;

  /*
   * No negative shelf.
   *
   * claim_stock allows on_hand to go below zero under policy 'continue',
   * because an oversell is a deliberate commercial choice. An adjustment is a
   * statement about what is physically present, and "minus two" is always a
   * mistake in the arithmetic rather than a fact about the shelf.
   */
  with upd as (
    update inventory
       set on_hand = on_hand + p_delta, updated_at = now()
     where variant_id = p_variant
       and on_hand + p_delta >= 0
    returning variant_id, on_hand
  ), led as (
    insert into inventory_ledger (variant_id, delta, reason, note)
    select variant_id, p_delta, p_reason, p_note from upd
    returning 1
  )
  select on_hand into v_after from upd;

  -- `SELECT INTO` sets its target to null when the query returns no rows, so a
  -- null here means the guard above filtered the row out. v_before is kept
  -- separate precisely so the message can name the number that was refused.
  if v_after is null then
    raise exception 'that would leave variant % at % units', p_variant, v_before + p_delta
      using errcode = 'check_violation',
            hint = 'Stock cannot go below zero. Record what is actually on the shelf.';
  end if;

  return v_after;
end $$;
