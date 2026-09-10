-- Ecommerce schema (Postgres). Source of truth for review;
-- port to Drizzle once settled. All money is INTEGER minor units (cents).

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ---------------------------------------------------------------- enums

create type user_role          as enum ('customer', 'staff', 'admin');
create type product_status     as enum ('draft', 'active', 'archived');
create type inventory_policy   as enum ('deny', 'continue');   -- allow backorder?
create type cart_status        as enum ('active', 'converted', 'abandoned');
create type order_status       as enum ('pending', 'open', 'cancelled');
create type payment_status     as enum ('unpaid', 'authorized', 'paid', 'partially_refunded', 'refunded', 'failed');
create type fulfillment_status as enum ('unfulfilled', 'partial', 'fulfilled');
create type discount_kind      as enum ('percent', 'fixed', 'free_shipping');

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
  region       text,                        -- state / province
  postal_code  text not null,
  country      char(2) not null,            -- ISO 3166-1 alpha-2
  phone        text,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);
create index on addresses (user_id);

-- ---------------------------------------------------------------- catalog

create table products (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  description  text,
  status       product_status not null default 'draft',
  vendor       text,
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
  price_cents      integer not null check (price_cents >= 0),
  compare_at_cents integer check (compare_at_cents >= 0),   -- strikethrough price
  currency         char(3) not null default 'USD',
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
  reason       text not null,               -- 'sale' | 'restock' | 'adjustment' | 'refund' | 'shrinkage'
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
  currency   char(3) not null default 'USD',
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

create table shipping_zones (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  countries char(2)[] not null
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
  total_cents       integer not null,

  -- Snapshots, not FKs: the customer may edit or delete the address later.
  shipping_address  jsonb not null,
  billing_address   jsonb,
  shipping_method   text,

  cart_id           uuid references carts(id) on delete set null,
  placed_at         timestamptz,
  cancelled_at      timestamptz,
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

create table payments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references orders(id) on delete cascade,
  provider            text not null default 'stripe',
  provider_intent_id  text not null unique,
  amount_cents        integer not null,
  currency            char(3) not null,
  status              text not null,        -- mirrors Stripe's intent status
  created_at          timestamptz not null default now()
);
create index on payments (order_id);

create table refunds (
  id                 uuid primary key default gen_random_uuid(),
  payment_id         uuid not null references payments(id) on delete cascade,
  provider_refund_id text not null unique,
  amount_cents       integer not null check (amount_cents > 0),
  reason             text,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------- fulfillment

create table fulfillments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  carrier         text,
  tracking_number text,
  tracking_url    text,
  shipped_at      timestamptz,
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

-- Idempotency guard. Insert before processing; a duplicate event violates the
-- unique constraint and is safely discarded.
create table webhook_events (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null,
  provider_event_id  text not null,
  type               text not null,
  payload            jsonb not null,
  received_at        timestamptz not null default now(),
  processed_at       timestamptz,
  error              text,
  unique (provider, provider_event_id)
);

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
