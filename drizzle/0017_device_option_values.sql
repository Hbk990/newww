-- ============================================================
-- A device option value names a real device
-- ============================================================

/*
 * Selling a cover at a different price per phone size means the device is an
 * option axis: one variant per device, each with its own SKU, price and
 * availability.
 *
 * But option_values.value is free text, while "shop by device" reads
 * product_device_fit, which rolls up from variant_device_fit — and that wants
 * a real device_models row. Left as it was, typing "iPhone 15 Pro Max" as an
 * option value would create a variant that the device filter cannot see, and
 * the same devices would have to be ticked a second time in the fitment
 * picker. One list of devices, entered twice, drifting apart.
 *
 * So a device axis picks from device_models, and generating variants writes
 * variant_device_fit from the axis. Ticked once, both jobs done.
 */

-- The denormalised kind and the composite key below are what let a plain
-- row-level CHECK enforce "only a device axis carries a device", without a
-- trigger reaching into another table to find out what kind its parent is.
alter table option_types
  add constraint option_types_id_kind_key unique (id, kind);

alter table option_values
  add column kind option_kind not null default 'other';

-- ON UPDATE CASCADE so changing an axis's kind carries to its values rather
-- than being blocked by the key; the CHECK below then refuses the change if it
-- would strand a device reference.
alter table option_values
  add constraint option_values_kind_fk
  foreign key (option_type_id, kind)
  references option_types (id, kind)
  on update cascade on delete cascade;

alter table option_values
  add column device_model_id uuid references device_models (id) on delete restrict;

/*
 * One direction only.
 *
 * A colour or capacity axis must never carry a device — that would generate a
 * fitment row for a product that fits nothing in particular. But a device axis
 * is allowed a value with no model behind it: the catalog still has device
 * labels nobody has identified yet ("A3", "X 11PRO"), and blocking those would
 * stop the shop selling a product over a naming question. Such a value simply
 * does not appear under "shop by device" until it is matched to a model.
 */
alter table option_values
  add constraint option_values_device_only_on_device_axis
  check (device_model_id is null or kind = 'device_fit');

-- The same phone twice on one axis would generate two identical variants.
-- Nulls stay distinct here on purpose: several unidentified device labels on
-- one axis are legitimate, and they are told apart by `value`, which
-- option_values_type_value_key already keeps unique.
create unique index option_values_type_device_uq
  on option_values (option_type_id, device_model_id);
