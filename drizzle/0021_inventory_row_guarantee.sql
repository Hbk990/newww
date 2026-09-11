-- Every variant gets an inventory row, and cannot exist without one.
--
-- The product form has always created one alongside each variant it makes. The
-- seed import does not, so all 1,901 seeded variants had no inventory row at
-- all: `claim_stock` raises 'no inventory row for variant %' for every one of
-- them, and `createOrder` reports them as "not set up for sale yet". A catalog
-- of 1,201 products where nothing can be bought is not a useful state, and it
-- is not one the admin can fix variant by variant.
--
-- Two halves: backfill what is missing, then make the gap unreachable.

-- ============================================================
-- Backfill
-- ============================================================

-- Defaults are the wholesale defaults the schema already documents: not
-- counted, and available. An untracked-but-available row means the variant is
-- buyable and nothing is decremented, which is the correct starting point for
-- a business whose shelf stock is shared with trade customers.
insert into inventory (variant_id)
select v.id
from variants v
where not exists (select 1 from inventory i where i.variant_id = v.id);
--> statement-breakpoint

-- ============================================================
-- The guarantee
-- ============================================================

-- Statement-level with a transition table rather than FOR EACH ROW: the seed
-- inserts variants in bulk, and a row-level trigger would issue 1,901 separate
-- inserts where one set-based statement does.
--
-- `on conflict do nothing` is what lets the product form keep its own insert,
-- which passes a real `available` value rather than the default. The form runs
-- after this trigger has already put the default row in place, so its insert
-- becomes an upsert; without the clause here, every product created through
-- the admin would fail on a primary key violation.
create or replace function trg_variant_inventory_row()
returns trigger language plpgsql as $$
begin
  insert into inventory (variant_id)
  select n.id from new_variants n
  on conflict (variant_id) do nothing;
  return null;
end $$;
--> statement-breakpoint

drop trigger if exists variants_inventory_row on variants;
--> statement-breakpoint

create trigger variants_inventory_row
after insert on variants
referencing new table as new_variants
for each statement execute function trg_variant_inventory_row();
--> statement-breakpoint

-- The summary column is derived from inventory, and 1,901 variants just became
-- buyable. Without this, products.in_stock stays false until something else
-- touches each product.
select refresh_product_stock(id) from products;
