-- Ecommerce schema (Postgres). Source of truth for review;
-- port to Drizzle once settled. All money is INTEGER minor units (cents).

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ---------------------------------------------------------------- enums

create type user_role          as enum ('customer', 'staff', 'admin');
create type product_status     as enum ('draft', 'active', 'archived');
create type inventory_policy   as enum ('deny', 'continue');   -- allow backorder?
create type cart_status        as enum ('active', 'converted', 'abandoned');
-- COD lifecycle: an order is pending until someone phones to confirm it, and
-- only a confirmed order is dispatched. Skipping that step is how you end up
-- paying couriers to deliver parcels nobody accepts.
create type order_status       as enum ('pending', 'confirmed', 'cancelled');
-- No gateway, so no 'authorized' step: cash is either collected or it is not.
create type payment_status     as enum ('unpaid', 'paid', 'partially_refunded', 'refunded');
create type fulfillment_status as enum ('unfulfilled', 'partial', 'fulfilled');
create type discount_kind      as enum ('percent', 'fixed', 'free_shipping');
-- Cash on Delivery is the only method. Kept as an enum rather than dropped
-- because it documents intent and because adding a method later is a one-line
-- `alter type payment_method add value 'whish'` with no table migration.
create type payment_method     as enum ('cod');

-- ---------------------------------------------------------------- identity

create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text,                       -- null when OAuth-only
  name          text,
  role          user_role not null default 'customer',
  created_at    timestamptz not null default now()
);

-- Reusable address book. Orders do NOT reference this; they snapshot (see below).
create table addresses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  name         text not null,
  line1        text not null,
  line2        text,
  city         text not null,
  region       text not null,               -- governorate; drives the shipping zone
  postal_code  text,                        -- nullable: no reliable coverage in Lebanon
  country      char(2) not null,            -- ISO 3166-1 alpha-2
  phone        text not null,               -- couriers need it
  directions   text,                        -- landmark directions, how deliveries work here
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);
create index on addresses (user_id);

-- ---------------------------------------------------------------- catalog

create table products (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  short_description text,                  -- one line, shown on cards and in listings
  description_html  text,                  -- the long copy, sanitized on write
  status       product_status not null default 'draft',
  meta_title       text,                   -- SEO overrides; fall back to title
  meta_description text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz
);
create index on products (status, published_at desc);

create table product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  url        text not null,
  alt        text,
  position   integer not null default 0
);
create index on product_images (product_id, position);

-- "Size", "Color" — per product, so products can differ in their axes.
create table option_types (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name       text not null,
  position   integer not null default 0,
  unique (product_id, name)
);

-- "M", "Red"
create table option_values (
  id             uuid primary key default gen_random_uuid(),
  option_type_id uuid not null references option_types(id) on delete cascade,
  value          text not null,
  position       integer not null default 0,
  unique (option_type_id, value)
);

-- The sellable unit: price, SKU and stock live here, not on products.
create table variants (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references products(id) on delete cascade,
  sku              text unique,
  title            text not null,             -- "M / Red", denormalized for display
  price_cents      integer not null check (price_cents >= 0),   -- what the customer pays
  cost_cents       integer check (cost_cents >= 0),          -- what you pay; from the source catalog
  compare_at_cents integer check (compare_at_cents >= 0),    -- strikethrough price
  weight_grams     integer,                   -- needed for shipping rates
  image_id         uuid references product_images(id) on delete set null,
  position         integer not null default 0,
  created_at       timestamptz not null default now()
);
create index on variants (product_id, position);

-- A variant is the set of option values it maps to. One row per option type.
create table variant_options (
  variant_id      uuid not null references variants(id) on delete cascade,
  option_value_id uuid not null references option_values(id) on delete cascade,
  primary key (variant_id, option_value_id)
);

-- ---------------------------------------------------------------- inventory

create table inventory (
  variant_id uuid primary key references variants(id) on delete cascade,
  on_hand    integer not null default 0,
  reserved   integer not null default 0 check (reserved >= 0),
  track      boolean not null default true,
  policy     inventory_policy not null default 'deny',
  updated_at timestamptz not null default now()
);
-- available = on_hand - reserved. Every write locks the row: SELECT ... FOR UPDATE.

-- Soft holds taken when an item enters a cart; a sweeper deletes expired rows
-- and decrements inventory.reserved.
create table inventory_reservations (
  id         uuid primary key default gen_random_uuid(),
  variant_id uuid not null references variants(id) on delete cascade,
  cart_id    uuid not null,
  quantity   integer not null check (quantity > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on inventory_reservations (expires_at);
create index on inventory_reservations (cart_id);

-- Append-only audit of every stock movement. Never updated.
create table inventory_ledger (
  id           uuid primary key default gen_random_uuid(),
  variant_id   uuid not null references variants(id) on delete cascade,
  delta        integer not null,            -- signed
  reason       text not null,               -- 'sale' | 'restock' | 'adjustment' | 'refund' | 'shrinkage' | 'refused_delivery'
  reference_id uuid,                        -- order id, etc.
  note         text,
  created_at   timestamptz not null default now()
);
create index on inventory_ledger (variant_id, created_at desc);

-- ---------------------------------------------------------------- cart

create table carts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references users(id) on delete set null,   -- null for guests
  token      text not null unique,          -- opaque id in an httpOnly cookie
  status     cart_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz
);
create index on carts (user_id) where user_id is not null;

create table cart_items (
  id              uuid primary key default gen_random_uuid(),
  cart_id         uuid not null references carts(id) on delete cascade,
  variant_id      uuid not null references variants(id) on delete cascade,
  quantity        integer not null check (quantity > 0),
  unit_price_cents integer not null,        -- price when added; re-validated at checkout
  created_at      timestamptz not null default now(),
  unique (cart_id, variant_id)              -- adding again bumps quantity
);

-- ---------------------------------------------------------------- shipping

-- Single-country store, so a zone is a set of governorates, not countries:
-- Beirut, Mount Lebanon, North, Akkar, South, Nabatieh, Bekaa, Baalbek-Hermel.
create table shipping_zones (
  id       uuid primary key default gen_random_uuid(),
  name     text not null,
  regions  text[] not null,
  position integer not null default 0
);

create table shipping_rates (
  id                uuid primary key default gen_random_uuid(),
  zone_id           uuid not null references shipping_zones(id) on delete cascade,
  name              text not null,          -- "Standard (3-5 days)"
  price_cents       integer not null check (price_cents >= 0),
  min_subtotal_cents integer,               -- free over X
  max_weight_grams  integer,
  position          integer not null default 0
);

-- ---------------------------------------------------------------- discounts

create table discounts (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  kind               discount_kind not null,
  value              integer not null,      -- basis points if percent, else cents
  min_subtotal_cents integer,
  starts_at          timestamptz,
  ends_at            timestamptz,
  usage_limit        integer,               -- null = unlimited
  used_count         integer not null default 0,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------- orders

create table orders (
  id                uuid primary key default gen_random_uuid(),
  order_number      text not null unique,   -- human-facing, e.g. "1042"
  user_id           uuid references users(id) on delete set null,
  email             text not null,          -- guest checkout needs this standalone

  status            order_status not null default 'pending',
  payment_status    payment_status not null default 'unpaid',
  fulfillment_status fulfillment_status not null default 'unfulfilled',

  currency          char(3) not null default 'USD',
  subtotal_cents    integer not null,
  discount_cents    integer not null default 0,
  shipping_cents    integer not null default 0,
  tax_cents         integer not null default 0,
  total_cents       integer not null,       -- what the courier must collect in cash

  -- Snapshots, not FKs: the customer may edit or delete the address later.
  shipping_address  jsonb not null,
  billing_address   jsonb,
  shipping_method   text,

  payment_method    payment_method not null default 'cod',
  phone             text not null,          -- couriers call ahead; not optional here
  cod_fee_cents     integer not null default 0,  -- courier's collection fee, if passed on
  confirmed_at      timestamptz,            -- when the confirmation call succeeded
  confirmed_by      uuid references users(id) on delete set null,
  confirm_attempts  integer not null default 0,

  cart_id           uuid references carts(id) on delete set null,
  placed_at         timestamptz,
  cancelled_at      timestamptz,
  cancel_reason     text,                   -- 'refused_delivery' | 'customer_request' | ...
  created_at        timestamptz not null default now()
);
create index on orders (user_id, created_at desc);
create index on orders (email);
create index on orders (status, created_at desc);

-- Immutable snapshot of what was bought. Display from these columns only.
create table order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references orders(id) on delete cascade,
  variant_id       uuid references variants(id) on delete set null,  -- reporting only
  product_title    text not null,
  variant_title    text not null,
  sku              text,
  unit_price_cents integer not null,
  quantity         integer not null check (quantity > 0),
  total_cents      integer not null
);
create index on order_items (order_id);

create table order_discounts (
  order_id     uuid not null references orders(id) on delete cascade,
  discount_id  uuid references discounts(id) on delete set null,
  code         text not null,
  amount_cents integer not null,
  primary key (order_id, code)
);

-- ---------------------------------------------------------------- payments

-- Cash actually received. There is no gateway and no checkout-time payment, so
-- a row appears only once the courier remits: an unpaid order has none, and the
-- absence of a row is the meaningful state.
create table payments (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  method        payment_method not null default 'cod',
  amount_cents  integer not null check (amount_cents > 0),
  currency      char(3) not null,
  -- Couriers remit in batches; this is what you reconcile a batch against.
  remittance_ref text,
  courier        text,
  collected_by  uuid references users(id) on delete set null,  -- staff who booked it
  collected_at  timestamptz not null default now(),
  note          text,
  created_at    timestamptz not null default now()
);
create index on payments (order_id);
create index on payments (remittance_ref);
-- Cash refunds, recorded by staff. No gateway to call, so this is bookkeeping:
-- it must reconcile against the till, hence who issued it.
create table refunds (
  id           uuid primary key default gen_random_uuid(),
  payment_id   uuid not null references payments(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  reason       text,
  issued_by    uuid references users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index on refunds (payment_id);

-- ---------------------------------------------------------------- fulfillment

-- Local couriers, so carrier is free text and there is no carrier API to call.
create table fulfillments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  carrier         text,
  tracking_number text,
  tracking_url    text,
  shipped_at      timestamptz,
  delivered_at    timestamptz,
  attempts        integer not null default 0,   -- COD deliveries get retried
  refused_at      timestamptz,                  -- goods returned; stock goes back
  created_at      timestamptz not null default now()
);
create index on fulfillments (order_id);

-- Partial shipments: which items went in which box.
create table fulfillment_items (
  fulfillment_id uuid not null references fulfillments(id) on delete cascade,
  order_item_id  uuid not null references order_items(id) on delete cascade,
  quantity       integer not null check (quantity > 0),
  primary key (fulfillment_id, order_item_id)
);

-- ---------------------------------------------------------------- plumbing

-- NOTE: there is no webhook_events table. With Cash on Delivery there is no
-- gateway and nothing to receive, so an idempotency guard for callbacks would be
-- a dead table. Adding an online payment method later means adding it back —
-- deliberately deferred, not forgotten.

-- Audit trail surfaced in the admin order timeline.
create table order_events (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders(id) on delete cascade,
  type       text not null,                 -- 'placed' | 'paid' | 'shipped' | 'note' | ...
  data       jsonb,
  actor_id   uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on order_events (order_id, created_at);

-- ================================================================
-- PART 2 — Taxonomy, brands, device fitment, attributes, navigation.
-- Added after analyzing the DRPHONE catalog export; see
-- docs/CATALOG_FINDINGS.md for the evidence behind each table.
-- ================================================================

create type option_kind as enum (
  'color', 'size', 'capacity', 'device_fit', 'connector',
  'power', 'flavor', 'other'
);

-- The CSV flattens four different axes into one untyped options list.
-- Typing them lets the variant picker render a swatch, a capacity dropdown
-- and a device selector differently, and makes device fit filterable.
alter table option_types add column kind option_kind not null default 'other';

-- ---------------------------------------------------------------- categories

-- Two levels today (9 groups -> 48 categories); parent_id doesn't cap it there.
create table categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references categories(id) on delete restrict,
  slug        text not null unique,
  name        text not null,
  description text,
  image_url   text,
  position    integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on categories (parent_id, position);

-- Many-to-many: a Razer gaming headset is Headphones and reachable from Gaming.
-- Exactly one row per product carries is_primary, which drives breadcrumbs and
-- the canonical URL.
create table product_categories (
  product_id  uuid not null references products(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  is_primary  boolean not null default false,
  primary key (product_id, category_id)
);
create index on product_categories (category_id);
create unique index on product_categories (product_id) where is_primary;

-- ---------------------------------------------------------------- brands

-- 226 brands in the export, and two of them (Razer, HyperX) were being used as
-- categories. First-class here, with their own landing pages.
create table brands (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  logo_url    text,
  description text,
  is_featured boolean not null default false,
  position    integer not null default 0
);

-- 67 products have no brand, so this stays nullable.
alter table products add column brand_id uuid references brands(id) on delete set null;
create index on products (brand_id);

-- ------------------------------------------------------- device compatibility

-- "What fits my phone?" is the primary shopping intent for an accessory store.
-- 101 free-text fit labels in the export ('17 Pro Max' / '17 pro Max' /
-- '17 PRO MAX' are three values today); these tables normalize them.
create table device_brands (
  id       uuid primary key default gen_random_uuid(),
  slug     text not null unique,
  name     text not null,                  -- Apple, Samsung, Xiaomi, Infinix, Tecno
  position integer not null default 0
);

create table device_models (
  id              uuid primary key default gen_random_uuid(),
  device_brand_id uuid not null references device_brands(id) on delete cascade,
  slug            text not null unique,    -- 'iphone-17-pro-max'
  name            text not null,           -- 'iPhone 17 Pro Max'
  family          text,                    -- 'iPhone', 'Galaxy S', 'iPad Air'
  release_year    integer,
  is_active        boolean not null default true,
  position        integer not null default 0
);
create index on device_models (device_brand_id, release_year desc);

-- Which variant physically fits which device. '17 Pro / 18 Pro' in the CSV
-- becomes two rows here instead of one unparseable string.
create table variant_device_fit (
  variant_id      uuid not null references variants(id) on delete cascade,
  device_model_id uuid not null references device_models(id) on delete cascade,
  primary key (variant_id, device_model_id)
);
create index on variant_device_fit (device_model_id);

-- Denormalized rollup so a "Shop by device" page is one indexed lookup rather
-- than a join through every variant. Maintained by trigger from the table above.
create table product_device_fit (
  product_id      uuid not null references products(id) on delete cascade,
  device_model_id uuid not null references device_models(id) on delete cascade,
  primary key (product_id, device_model_id)
);
create index on product_device_fit (device_model_id);

-- ---------------------------------------------------------------- attributes

-- Specs that are filterable but are NOT variant axes: wattage, capacity in mAh,
-- connector type, RGB, wireless. Currently these live in product names
-- ('Green Lion - Thoofan 20W'), which makes faceted filtering impossible.
create type attribute_type as enum ('text', 'number', 'boolean', 'enum');

create table attribute_definitions (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,      -- 'capacity_mah', 'wattage_w'
  label         text not null,             -- 'Battery capacity'
  data_type     attribute_type not null,
  unit          text,                      -- 'mAh', 'W'
  is_filterable boolean not null default true,
  is_comparable boolean not null default false,
  position      integer not null default 0
);

-- Which attributes make sense for which category: mAh for Power Bank,
-- not for Gaming Chair.
create table category_attributes (
  category_id  uuid not null references categories(id) on delete cascade,
  attribute_id uuid not null references attribute_definitions(id) on delete cascade,
  is_required  boolean not null default false,
  position     integer not null default 0,
  primary key (category_id, attribute_id)
);

create table product_attributes (
  product_id   uuid not null references products(id) on delete cascade,
  attribute_id uuid not null references attribute_definitions(id) on delete cascade,
  value_text   text,
  value_number numeric,
  value_bool   boolean,
  primary key (product_id, attribute_id),
  -- exactly one value column populated, matching the definition's data_type
  check (num_nonnulls(value_text, value_number, value_bool) = 1)
);
create index on product_attributes (attribute_id, value_number);
create index on product_attributes (attribute_id, value_text);

-- ---------------------------------------------------------------- collections

-- Merchandising groupings that cut across the tree: Sale, New Arrivals,
-- Back to School. 'smart' collections match on rules instead of a fixed list.
create type collection_kind as enum ('manual', 'smart');

create table collections (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  kind       collection_kind not null default 'manual',
  rules      jsonb,                        -- smart only: brand/category/price/tag predicates
  image_url  text,
  position   integer not null default 0
);

create table collection_products (
  collection_id uuid not null references collections(id) on delete cascade,
  product_id    uuid not null references products(id) on delete cascade,
  position      integer not null default 0,
  primary key (collection_id, product_id)
);

-- ---------------------------------------------------------------- navigation

-- Menus are curated, not a mirror of the category tree: with 9 groups and 48
-- categories the mega-menu needs its own ordering, promoted items and imagery.
create table nav_menus (
  id     uuid primary key default gen_random_uuid(),
  handle text not null unique,             -- 'main', 'footer', 'mobile'
  name   text not null
);

create table nav_items (
  id            uuid primary key default gen_random_uuid(),
  menu_id       uuid not null references nav_menus(id) on delete cascade,
  parent_id     uuid references nav_items(id) on delete cascade,
  label         text not null,
  position      integer not null default 0,
  is_featured   boolean not null default false,   -- highlighted column in mega-menu
  image_url     text,
  -- Exactly one destination.
  url             text,
  category_id     uuid references categories(id) on delete cascade,
  collection_id   uuid references collections(id) on delete cascade,
  brand_id        uuid references brands(id) on delete cascade,
  device_model_id uuid references device_models(id) on delete cascade,
  check (num_nonnulls(url, category_id, collection_id, brand_id, device_model_id) = 1)
);
create index on nav_items (menu_id, parent_id, position);

-- ---------------------------------------------------------------- import

-- Reference copy of the wholesale catalog export. Products are created one at a
-- time by hand, so nothing here is ever promoted automatically: this table exists
-- so the admin's "new product" form can search 1,155 known lines and prefill
-- name, brand, category, cost and image instead of retyping them. The CSV's own
-- data is known to be incomplete and partly wrong, so every prefilled field is
-- editable and nothing here is customer-visible.
--
-- The searchable columns are extracted from `raw` on load so the lookup can
-- filter and sort without querying into jsonb.
create table source_products (
  id             uuid primary key default gen_random_uuid(),
  source         text not null,            -- 'DRPHONEcatalog20260910.csv'
  source_ref     text not null,            -- original sku, e.g. 'DR-001202'
  raw            jsonb not null,           -- the untouched CSV row

  -- extracted for browsing
  name           text not null,
  brand_name     text,
  category_name  text,
  category_group text,
  cost_cents     integer,                  -- the catalog price: what you pay
  image_url      text,
  option_count   integer not null default 0,
  color_count    integer not null default 0,

  -- set when a hand-created product was prefilled from this line, so the
  -- lookup can show what has already been used
  promoted_product_id uuid references products(id) on delete set null,
  promoted_at    timestamptz,
  excluded       boolean not null default false,
  excluded_reason text,                    -- 'age-restricted', 'no price', ...
  needs_review   boolean not null default false,
  review_reason  text,                     -- 'ambiguous option axis', ...
  note           text,                     -- curator's own note

  imported_at    timestamptz not null default now(),
  unique (source, source_ref)
);
create index on source_products (category_group, category_name);
create index on source_products (brand_name);
create index on source_products (promoted_product_id) where promoted_product_id is not null;
create index on source_products (needs_review) where needs_review;
-- The default lookup view: lines not yet used for a product.
create index on source_products (imported_at desc)
  where promoted_product_id is null and not excluded;

-- Deferred FK: inventory_reservations is declared above carts in Part 1.
alter table inventory_reservations
  add constraint inventory_reservations_cart_id_fkey
  foreign key (cart_id) references carts(id) on delete cascade;

-- ================================================================
-- PART 3 — Stock claim function.
-- ================================================================

-- Claims stock atomically and records the movement in one statement.
--
-- Do NOT decrement inventory and insert the ledger row as two separate
-- statements: the guard on the UPDATE can filter the row out while the
-- following INSERT still runs, recording a sale that never happened. Chaining
-- the ledger insert off the UPDATE's RETURNING makes the pair inseparable, and
-- raising on an empty result turns a silent no-op into a caught error.
--
-- Verified under concurrency: two transactions racing for one unit produce one
-- sale, one ledger row, and one insufficient-stock exception.
create or replace function claim_stock(p_variant uuid, p_qty int, p_order uuid)
returns void language plpgsql as $$
declare v_ok boolean;
begin
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

-- ================================================================
-- PART 4 — Store settings.
-- Retail-only, single currency, single country for v1.
-- ================================================================

-- One row, enforced. The store's currency lives here rather than on every
-- variant and cart: with a single currency those columns only create drift.
-- orders and payments keep their own currency column because those are
-- snapshots that must survive a future settings change and reconcile
-- against the payment gateway.
create table store_settings (
  id               boolean primary key default true check (id),
  currency         char(3) not null,
  country          char(2) not null,        -- the one country we ship to
  tax_rate_bps     integer not null default 1100, -- basis points; Lebanon VAT is 11%
  prices_include_tax boolean not null default false,
  -- Display-only secondary currency (e.g. LBP shown alongside a USD price).
  -- Never a second price list and never used for settlement.
  display_currency      char(3),
  display_rate          numeric(18,6),
  display_rate_updated_at timestamptz,
  order_number_seq integer not null default 1000,
  store_name       text not null
);
