-- ============================================================
-- Which attributes apply to a category
-- ============================================================

-- `category_attributes` already lets an attribute be attached to any category,
-- and the eight seeded parent groups are themselves categories — so assigning
-- at group level already works structurally. What was missing is the read side:
-- nothing resolved "Power Bank inherits Warranty from Phone Accessories".
--
-- Without this the admin has to attach every attribute to all 52 leaf
-- categories by hand, and keep 52 rows in sync forever. With it, one row on the
-- group covers its children and a child can still override.
--
-- Deliberately NOT in this migration, because nothing writes product attribute
-- values until the product form exists and an empty table needs no backfill:
--   * product_attributes.option_id  -- link an enum value to attribute_options
--                                      instead of copying its text
--   * attribute_definitions.is_multi + a relaxed product_attributes primary key
--                                      -- "Compatible with: USB-C, Lightning"
-- Both belong to the product-form migration. Adding them here would ship two
-- columns the application cannot yet populate.

create or replace function attributes_for_category(p_category uuid)
returns table (
  attribute_id uuid,
  code text,
  label text,
  data_type attribute_type,
  unit text,
  is_filterable boolean,
  is_comparable boolean,
  is_required boolean,
  "position" integer,
  assigned_category_id uuid,
  inherited boolean
)
language sql
stable
as $$
  with recursive ancestry as (
    -- Depth 0 is the category itself; each step toward the root adds one.
    select c.id, c.parent_id, 0 as depth
    from categories c
    where c.id = p_category

    union all

    -- The depth guard is not about tree size — the tree is two levels deep.
    -- It is there because parent_id is self-referencing with no constraint
    -- against a cycle, and a cycle here would spin this query forever.
    select c.id, c.parent_id, a.depth + 1
    from categories c
    join ancestry a on c.id = a.parent_id
    where a.depth < 10
  ),
  -- Nearest assignment wins. A child that attaches an attribute its group
  -- already attaches overrides the group's is_required and position, rather
  -- than appearing twice.
  resolved as (
    select distinct on (ca.attribute_id)
      ca.attribute_id,
      ca.is_required,
      ca.position,
      a.id as assigned_category_id,
      a.depth
    from ancestry a
    join category_attributes ca on ca.category_id = a.id
    order by ca.attribute_id, a.depth
  )
  select
    r.attribute_id,
    d.code,
    d.label,
    d.data_type,
    d.unit,
    d.is_filterable,
    d.is_comparable,
    r.is_required,
    r.position,
    r.assigned_category_id,
    -- Lets the admin grey out an inherited row and point at where it came from,
    -- so "why is this field here?" is answerable without reading the tree.
    r.depth > 0 as inherited
  from resolved r
  join attribute_definitions d on d.id = r.attribute_id
  order by r.position, d.label;
$$;
