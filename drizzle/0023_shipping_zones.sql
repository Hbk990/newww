-- Delivery zones for Lebanon, and a rate for each.
--
-- Both tables have existed since 0002 and neither has ever had a row. Until
-- they do, checkout cannot price delivery: a staff member taking an order by
-- phone types the fee, which is right for a phone call, but a web customer
-- cannot type their own — so src/lib/checkout/fees.ts has been charging a flat
-- $3 to Beirut and the Bekaa alike.
--
-- The zones are geography and are correct as written: Lebanon's eight
-- governorates, grouped the way a courier actually prices them. An address's
-- `region` is matched against these arrays.
--
-- THE PRICES ARE PLACEHOLDERS. $2 / $3 / $5 are plausible Lebanese
-- cash-on-delivery fees and nothing more — nobody has quoted them. They exist
-- so the shop is functional on the day this lands rather than unable to take an
-- order, and /admin/shipping is where the owner replaces them with real
-- numbers. The free-delivery threshold is left null here deliberately; it is a
-- commercial decision, and store_settings carries a shop-wide one.

insert into shipping_zones (name, regions, "position")
select 'Beirut', array['Beirut'], 0
where not exists (select 1 from shipping_zones where name = 'Beirut');
--> statement-breakpoint

insert into shipping_zones (name, regions, "position")
select 'Mount Lebanon', array['Mount Lebanon'], 1
where not exists (select 1 from shipping_zones where name = 'Mount Lebanon');
--> statement-breakpoint

-- The remaining six governorates share a rate. Kept as one zone rather than
-- six because the owner prices "outside the city" as one thing today; splitting
-- it later is adding a zone and moving a region between arrays, not a schema
-- change.
insert into shipping_zones (name, regions, "position")
select 'Rest of Lebanon',
       array['North', 'Akkar', 'South', 'Nabatieh', 'Beqaa', 'Baalbek-Hermel'],
       2
where not exists (select 1 from shipping_zones where name = 'Rest of Lebanon');
--> statement-breakpoint

-- One rate per zone. `position` decides which applies when a zone has several,
-- so adding an express option later means inserting at a higher position rather
-- than touching this one.
insert into shipping_rates (zone_id, name, price_cents, "position")
select z.id, 'Standard delivery', v.cents, 0
from shipping_zones z
join (values
  ('Beirut', 200),
  ('Mount Lebanon', 300),
  ('Rest of Lebanon', 500)
) as v(zone, cents) on v.zone = z.name
where not exists (
  select 1 from shipping_rates r where r.zone_id = z.id
);
