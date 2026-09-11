-- ============================================================
-- Attribute values: link enum choices, allow several of them
-- ============================================================

-- The two columns 0014 deliberately deferred. They land now, before the
-- product form exists, because product_attributes is still empty — the same
-- change over live rows would need a backfill that guesses which option a
-- stored string meant.

-- ------------------------------------------------------------
-- Several values for one attribute
-- ------------------------------------------------------------

alter table attribute_definitions
  add column is_multi boolean not null default false;

-- Multi-value only makes sense for a choice list: "Compatible with: USB-C,
-- Lightning" is a set drawn from bounded options. Multi free text would be a
-- column full of near-duplicates with nothing to filter on, and multi
-- yes/no is a contradiction.
alter table attribute_definitions
  add constraint attribute_definitions_multi_requires_enum
  check (not is_multi or data_type = 'enum');

-- ------------------------------------------------------------
-- An enum value points at its option, instead of copying its text
-- ------------------------------------------------------------

alter table product_attributes
  add column option_id uuid;

-- Needed as the target of the composite foreign key below. `id` is already
-- unique on its own; this pairing is what lets the key carry attribute_id too.
alter table attribute_options
  add constraint attribute_options_attribute_id_key unique (attribute_id, id);

/*
 * The composite key is the point: a plain option_id reference would happily
 * pair product_attributes.attribute_id = "Material" with an option belonging
 * to "Colour", and the product page would render a colour under a material
 * heading. Naming both columns makes that unrepresentable.
 *
 * MATCH SIMPLE (the default) skips the check when any column is null, so a
 * text, number or boolean row with option_id null is unaffected.
 *
 * RESTRICT, not CASCADE: deleting an option that products use would silently
 * strip the spec from each of them. The admin refuses with a count instead.
 */
alter table product_attributes
  add constraint product_attributes_option_fk
  foreign key (attribute_id, option_id)
  references attribute_options (attribute_id, id)
  on delete restrict;

alter table product_attributes
  drop constraint product_attributes_exactly_one_value;

alter table product_attributes
  add constraint product_attributes_exactly_one_value
  check (num_nonnulls(value_text, value_number, value_bool, option_id) = 1);

-- ------------------------------------------------------------
-- Relaxing the primary key
-- ------------------------------------------------------------

-- (product_id, attribute_id) as the key is exactly what caps an attribute at
-- one value, so it has to go. A surrogate key replaces it and the two
-- constraints below take over the job it was doing.
alter table product_attributes
  add column id uuid not null default gen_random_uuid();

alter table product_attributes
  drop constraint product_attributes_product_id_attribute_id_pk;

alter table product_attributes
  add constraint product_attributes_pkey primary key (id);

/*
 * NULLS NOT DISTINCT is doing real work here.
 *
 * Postgres treats nulls as distinct by default, so without it this index
 * would permit unlimited rows for any attribute whose option_id is null —
 * every text, number and boolean attribute. With it, those rows collide on
 * (product, attribute, null) and are capped at one apiece, which is correct:
 * is_multi is only allowed on enum types.
 *
 * For an enum it stops the same option being recorded twice. Both cases are
 * enforced by the index itself, so they hold under concurrency.
 */
create unique index product_attributes_value_uq
  on product_attributes (product_id, attribute_id, option_id) nulls not distinct;

-- Faceted filtering on a choice list: "material = Silicone".
create index product_attributes_attribute_option_idx
  on product_attributes (attribute_id, option_id);

/*
 * What the index above cannot express: an enum attribute with is_multi = false
 * must not collect two *different* options. The predicate lives in another
 * table, and an index predicate has to be constant, so this is a trigger.
 *
 * Being a trigger, it is not airtight under concurrency — two transactions
 * inserting different options at the same moment each see a table without the
 * other's uncommitted row, and both pass. That is accepted rather than
 * hidden: it needs two people writing the same attribute on the same product
 * in the same instant, the product form writes a product's values in one
 * transaction, and the damage is a spare row an admin can delete. The
 * airtight alternative is denormalising is_multi into every value row and
 * keeping it in sync from a second trigger, which trades a real maintenance
 * hazard for a race nobody will hit.
 */
create or replace function trg_single_value_attribute() returns trigger
language plpgsql as $$
declare
  v_multi boolean;
begin
  select is_multi into v_multi
  from attribute_definitions
  where id = new.attribute_id;

  if coalesce(v_multi, false) then
    return new;
  end if;

  if exists (
    select 1 from product_attributes
    where product_id = new.product_id
      and attribute_id = new.attribute_id
      and id <> new.id
  ) then
    raise exception 'attribute % already has a value on product %',
      new.attribute_id, new.product_id
      using hint = 'This attribute holds one value. Update the existing row, or allow several values on the attribute.';
  end if;

  return new;
end $$;

create trigger product_attributes_single_value
after insert or update of product_id, attribute_id, option_id on product_attributes
for each row execute function trg_single_value_attribute();
