-- Fixes a stale product_device_fit rollup after a variant is deleted.
--
-- Deleting a variant cascade-deletes its variant_device_fit rows, but the
-- statement-level trigger on that table joins back to `variants` to work out
-- which products to rebuild — and the variant is already gone, so the join
-- returns nothing, no products are marked affected, and the rollup keeps
-- fitment rows for a variant that no longer exists. The visible symptom is a
-- "Shop by device" page listing a product that does not fit that phone.
--
-- The fix is to rebuild from the variants trigger, which does know the product.
-- Rebuilding here is safe despite the cascade ordering: this is an AFTER DELETE
-- trigger, so the variant row is already gone and the rebuild's join excludes
-- its fitment rows whether or not the cascade has removed them yet.
create or replace function trg_variant_device_fit_owner()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform refresh_product_device_fit(array[old.product_id]);
  else
    perform refresh_product_device_fit(array[new.product_id]);
    if tg_op = 'UPDATE' and old.product_id is distinct from new.product_id then
      perform refresh_product_device_fit(array[old.product_id]);
    end if;
  end if;
  return null;
end $$;
--> statement-breakpoint

create trigger variants_device_fit_delete
after delete on variants
for each row execute function trg_variant_device_fit_owner();
--> statement-breakpoint

-- A variant moving between products has to rebuild both sides.
create trigger variants_device_fit_move
after update on variants
for each row
when (old.product_id is distinct from new.product_id)
execute function trg_variant_device_fit_owner();
