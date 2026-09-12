-- The one store_settings row, and the prefix finally read from it.
--
-- store_settings has had zero rows since it was created. Nothing broke, which
-- is the problem: every setting on it has been quietly inoperative. The
-- free-delivery threshold that migration 0023's quoting reads had nothing to
-- read, `maintenance_mode` could not be turned on, and `order_number_prefix`
-- was ignored outright — next_order_number hardcodes 'DR-'.
--
-- One row, enforced by a boolean primary key with a check that it is true, so a
-- second row is a constraint violation rather than a silent ambiguity about
-- which settings apply.

insert into store_settings (
  id, currency, country, store_name, timezone, order_number_prefix,
  tax_rate_bps, prices_include_tax
)
select true, 'USD', 'LB', 'DRPHONE', 'Asia/Beirut', 'DR', 0, true
where not exists (select 1 from store_settings);
--> statement-breakpoint

-- `is_private` and `maintenance_mode` keep their schema defaults: private and
-- not in maintenance. Private is right for today — the catalog is half
-- finished and should not be indexed — and the settings screen is where it gets
-- turned off at launch.

-- ============================================================
-- next_order_number reads the prefix
-- ============================================================
--
-- The counter stays in order_number_counters, per day, which is what makes the
-- number sequential per day without a global sequence to contend on. Only the
-- prefix moves.
--
-- coalesce rather than a join, so a database whose settings row has been
-- deleted still takes orders under the old prefix instead of failing at the
-- moment of sale. An order that cannot be numbered is an order that cannot be
-- placed, and that is too high a price for a missing configuration row.
create or replace function next_order_number()
returns text language plpgsql as $$
declare
  d date := current_date;
  n integer;
  p text;
begin
  insert into order_number_counters (day, seq) values (d, 1)
  on conflict (day) do update set seq = order_number_counters.seq + 1
  returning seq into n;

  select coalesce(nullif(trim(order_number_prefix), ''), 'DR')
    into p
  from store_settings
  limit 1;

  return coalesce(p, 'DR') || '-' || to_char(d, 'YYYYMMDD') || '-' || lpad(n::text, 5, '0');
end $$;
