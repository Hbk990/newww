"use client";

import { useMemo, useState } from "react";

import { comboKey, expand } from "@/lib/admin/variant-combos";
import { skuFragment } from "@/lib/slug";

export type DeviceOption = { id: string; name: string; family: string | null };

export type AxisValue = {
  id?: string;
  value: string;
  deviceModelId: string | null;
};
export type Axis = {
  id?: string;
  name: string;
  kind: string;
  values: AxisValue[];
};

/** Just enough of an image to choose between them in a dropdown. */
export type VariantImage = { id: string; label: string };

export type Row = {
  /** Set for a variant that already exists; absent means it will be created. */
  id?: string;
  /** Which image this variant shows. Null uses the product's main photo. */
  imageId?: string | null;
  /** Has been sold at least once, so it can be hidden but never deleted. */
  sold?: boolean;
  /** Indexes into each axis, in axis order — the identity of this combination. */
  combo: number[];
  key: string;
  title: string;
  sku: string;
  price: string;
  available: boolean;
  /** Generated but not yet edited, so the form can point at what needs a price. */
  fresh: boolean;
  /** Its combination no longer exists on the axes; kept visible until saved. */
  leaving?: boolean;
};

const KINDS = [
  { value: "color", label: "Colour" },
  { value: "capacity", label: "Capacity" },
  { value: "size", label: "Size" },
  { value: "device_fit", label: "Device" },
  { value: "connector", label: "Connector" },
  { value: "power", label: "Power" },
  { value: "other", label: "Other" },
];

export function VariantGrid({
  axes,
  setAxes,
  rows,
  setRows,
  devices,
  skuPrefix,
  showCost,
  error,
  images = [],
}: {
  axes: Axis[];
  setAxes: (axes: Axis[]) => void;
  rows: Row[];
  setRows: (rows: Row[]) => void;
  devices: DeviceOption[];
  skuPrefix: string;
  showCost: boolean;
  error?: string;
  /**
   * The product's images, for the per-variant picker. Empty while creating —
   * images are uploaded after the product exists, so there is nothing to pick.
   */
  images?: VariantImage[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /**
   * Regenerates rows from the axes, keeping what was already typed.
   *
   * Rows are matched by their combination, not their position, so adding a
   * colour in the middle of the list does not shift every price down a row.
   */
  function rebuild(next: Axis[]) {
    const previous = new Map(rows.map((r) => [r.key, r]));
    const combos = next.length === 0 ? [[]] : expand(next);
    const first = rows.find((r) => !r.leaving);
    setAxes(next);

    /*
     * "I sold it one way, now I stock two colours."
     *
     * A product with no options has a single row keyed "". Adding the first
     * option produces keys like "Black", none of which match it, so without
     * this the original variant is orphaned — deleted, or kept as a hidden
     * tombstone if it had sold — and its SKU, price and history are replaced
     * by a freshly generated row. Reusing its id makes the first combination
     * *be* that variant.
     *
     * Deliberately narrow: only when the previous state was exactly one
     * unsaved-axis row. With several rows there is no non-arbitrary way to say
     * which new combination each becomes, and guessing would silently
     * reassign real prices.
     */
    const orphanedDefaults = rows.filter((r) => r.id && r.key === "");
    // Keyed off the row, not off axes.length: clicking "Add an option" creates
    // an axis with no values, which expands to zero combinations and orphans
    // the default row one render before any value is typed. By the time
    // "Black" arrives there is already an axis, so counting axes would miss it.
    const soleDefault =
      orphanedDefaults.length === 1 ? orphanedDefaults[0] : null;

    const wanted: Row[] = combos.map((combo, comboIndex) => {
      const key = comboKey(next, combo);
      const existing = previous.get(key);
      if (existing) return { ...existing, combo, leaving: false };
      if (soleDefault && comboIndex === 0) {
        return {
          ...soleDefault,
          combo,
          key,
          title: key || soleDefault.title,
          leaving: false,
        };
      }
      return {
        combo,
        key,
        title: key || "Default",
        sku: autoSku(next, combo, skuPrefix),
        // Copied from the first row so a new axis value does not mean
        // retyping every price — flagged fresh so it is still visible.
        price: first?.price ?? "",
        available: true,
        fresh: true,
      };
    });

    /*
     * Saved variants whose combination the axes no longer produce.
     *
     * They stay on screen, greyed, rather than vanishing the moment a value is
     * removed: dropping a colour on a live product removes real rows with real
     * prices, and doing that silently is how someone loses work to a mis-click.
     * The save then deletes them, except any that have been sold.
     */
    const wantedKeys = new Set(wanted.map((r) => r.key));
    const reusedId = wanted.find((r) => r.id === soleDefault?.id)?.id;
    const orphans = rows
      .filter((r) => r.id && !wantedKeys.has(r.key) && r.id !== reusedId)
      .map((r) => ({ ...r, leaving: true }));

    setRows([...wanted, ...orphans]);
    setSelected(new Set());
  }

  function addAxis() {
    if (axes.length >= 3) return;
    rebuild([...axes, { name: "", kind: "other", values: [] }]);
  }

  function patchAxis(index: number, patch: Partial<Axis>) {
    const next = axes.map((a, i) => (i === index ? { ...a, ...patch } : a));
    rebuild(next);
  }

  function removeAxis(index: number) {
    rebuild(axes.filter((_, i) => i !== index));
  }

  function addValue(axisIndex: number, value: AxisValue) {
    const axis = axes[axisIndex];
    if (!axis || !value.value.trim()) return;
    if (axis.values.some((v) => v.value === value.value)) return;
    patchAxis(axisIndex, { values: [...axis.values, value] });
  }

  function removeValue(axisIndex: number, valueIndex: number) {
    const axis = axes[axisIndex];
    if (!axis) return;
    patchAxis(axisIndex, {
      values: axis.values.filter((_, i) => i !== valueIndex),
    });
  }

  function patchRow(key: string, patch: Partial<Row>) {
    setRows(
      rows.map((r) => (r.key === key ? { ...r, ...patch, fresh: false } : r)),
    );
  }

  /** Copies the first row's value down the column — most rows share a price. */
  function fillDown(field: "sku" | "price") {
    const first = rows.find((r) => !r.leaving);
    if (!first) return;
    setRows(
      rows.map((r) =>
        r.leaving || r.key === first.key
          ? r
          : { ...r, [field]: first[field], fresh: false },
      ),
    );
  }

  function regenerateSkus() {
    setRows(
      rows.map((r) => ({ ...r, sku: autoSku(axes, r.combo, skuPrefix) })),
    );
  }

  const freshCount = useMemo(() => rows.filter((r) => r.fresh).length, [rows]);
  // Existing rows the current axes no longer produce. They are not silently
  // dropped: sold ones will be hidden, the rest deleted, and the form says so
  // before the save rather than after.
  const leaving = useMemo(() => rows.filter((r) => r.leaving), [rows]);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Options and variants</h2>
        <span className="text-xs text-muted">
          {rows.length - leaving.length} variant
          {rows.length - leaving.length === 1 ? "" : "s"}
          {freshCount > 0 ? ` · ${freshCount} new` : null}
          {leaving.length > 0 ? (
            <span className="text-warn"> · {leaving.length} leaving</span>
          ) : null}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Add an option and every combination appears below. Leave it empty for a
        product sold one way.
      </p>

      <div className="mt-4 space-y-3">
        {axes.map((axis, ai) => (
          <AxisEditor
            key={ai}
            axis={axis}
            devices={devices}
            usedDeviceIds={
              new Set(
                axis.values
                  .map((v) => v.deviceModelId)
                  .filter(Boolean) as string[],
              )
            }
            onPatch={(patch) => patchAxis(ai, patch)}
            onRemove={() => removeAxis(ai)}
            onAddValue={(v) => addValue(ai, v)}
            onRemoveValue={(vi) => removeValue(ai, vi)}
          />
        ))}
        {axes.length < 3 ? (
          <button
            type="button"
            onClick={addAxis}
            className="rounded-md border border-dashed border-line px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-accent"
          >
            + Add an option
          </button>
        ) : (
          <p className="text-xs text-muted">
            Three options is the limit — a fourth multiplies the grid past what
            anyone can check.
          </p>
        )}
      </div>

      {error ? <p className="mt-3 text-sm text-warn">{error}</p> : null}

      {rows.length > 0 ? (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => fillDown("price")}
              className="rounded-md border border-line px-2.5 py-1.5"
            >
              Fill price down
            </button>
            <button
              type="button"
              onClick={regenerateSkus}
              className="rounded-md border border-line px-2.5 py-1.5"
            >
              Rebuild SKUs
            </button>
            {selected.size > 0 ? (
              <>
                <span className="ml-1 text-muted">
                  {selected.size} selected
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setRows(
                      rows.map((r) =>
                        selected.has(r.key)
                          ? { ...r, available: true, fresh: false }
                          : r,
                      ),
                    )
                  }
                  className="text-accent underline"
                >
                  Mark available
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setRows(
                      rows.map((r) =>
                        selected.has(r.key)
                          ? { ...r, available: false, fresh: false }
                          : r,
                      ),
                    )
                  }
                  className="text-accent underline"
                >
                  Mark unavailable
                </button>
              </>
            ) : null}
          </div>

          <div className="mt-2 max-h-[28rem] overflow-auto rounded-lg border border-line">
            <table className="w-full min-w-[42rem] text-sm">
              <thead className="sticky top-0 z-10 bg-raised text-left text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-line">
                  <th className="w-8 px-2 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all variants"
                      checked={selected.size === rows.length && rows.length > 0}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? new Set(
                                rows
                                  .filter((r) => !r.leaving)
                                  .map((r) => r.key),
                              )
                            : new Set(),
                        )
                      }
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">Variant</th>
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="w-28 px-3 py-2 font-medium">Price</th>
                  {showCost ? (
                    <th className="w-28 px-3 py-2 font-medium">Cost</th>
                  ) : null}
                  {images.length > 0 ? (
                    <th className="w-32 px-3 py-2 font-medium">Photo</th>
                  ) : null}
                  <th className="w-36 px-3 py-2 font-medium">Available</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) =>
                  row.leaving ? (
                    <tr
                      key={row.key}
                      className="border-b border-line last:border-0"
                    >
                      <td className="px-2 py-1.5" />
                      <td className="px-3 py-1.5 text-muted line-through">
                        {row.title}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs text-muted line-through">
                        {row.sku}
                      </td>
                      <td
                        colSpan={
                          (showCost ? 3 : 2) + (images.length > 0 ? 1 : 0)
                        }
                        className="px-3 py-1.5 text-xs text-warn"
                      >
                        {!row.sold
                          ? "Will be removed when you save."
                          : row.available
                            ? "Sold before — will be hidden, not deleted, so its orders keep their link."
                            : "Sold before, now hidden. Kept so its orders keep their link."}
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={row.key}
                      className={`border-b border-line last:border-0 ${
                        selected.has(row.key) ? "bg-accent-soft" : ""
                      }`}
                    >
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.title}`}
                          checked={selected.has(row.key)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(row.key);
                            else next.delete(row.key);
                            setSelected(next);
                          }}
                        />
                      </td>
                      <td className="px-3 py-1.5 font-medium">{row.title}</td>
                      <td className="px-3 py-1.5">
                        <input
                          value={row.sku}
                          onChange={(e) =>
                            patchRow(row.key, { sku: e.target.value })
                          }
                          aria-label={`SKU for ${row.title}`}
                          className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 font-mono text-xs hover:border-line focus:border-accent focus:bg-surface focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted">$</span>
                          <input
                            value={row.price}
                            onChange={(e) =>
                              patchRow(row.key, { price: e.target.value })
                            }
                            placeholder="0.00"
                            inputMode="decimal"
                            aria-label={`Price for ${row.title}`}
                            className={`w-full rounded border bg-transparent px-1.5 py-1 font-mono text-xs focus:border-accent focus:bg-surface focus:outline-none ${
                              row.fresh && !row.price
                                ? "border-warn"
                                : "border-transparent hover:border-line"
                            }`}
                          />
                        </div>
                      </td>
                      {showCost ? (
                        <td className="px-3 py-1.5">
                          <span className="text-xs text-muted">—</span>
                        </td>
                      ) : null}
                      {images.length > 0 ? (
                        <td className="px-3 py-1.5">
                          <select
                            value={row.imageId ?? ""}
                            onChange={(e) =>
                              patchRow(row.key, {
                                imageId: e.target.value || null,
                              })
                            }
                            aria-label={`Photo for ${row.title}`}
                            className="w-full rounded border border-line bg-surface px-1 py-1 text-xs"
                          >
                            {/* Empty means "use the product's main photo", which
                                is what most variants want. */}
                            <option value="">Main photo</option>
                            {images.map((image, i) => (
                              <option key={image.id} value={image.id}>
                                {image.label || `Image ${i + 1}`}
                              </option>
                            ))}
                          </select>
                        </td>
                      ) : null}
                      <td className="px-3 py-1.5">
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={row.available}
                            onChange={(e) =>
                              patchRow(row.key, { available: e.target.checked })
                            }
                            aria-label={`Available: ${row.title}`}
                          />
                          <span className="text-xs text-muted">
                            {row.available ? "Available" : "Unavailable"}
                          </span>
                        </label>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}

function autoSku(axes: Axis[], combo: number[], prefix: string): string {
  if (!prefix) return "";
  const parts = combo
    .map((valueIndex, axisIndex) => {
      const axis = axes[axisIndex];
      const value = axis?.values[valueIndex];
      if (!axis || !value) return "";
      // Drops the family word from a device name, so iPhone 15 / 15 Pro /
      // 15 Pro Max give 15 / 15PRO / 15PROMAX instead of IPHONE three times.
      const drop = axis.kind === "device_fit" ? familyWords(axis) : [];
      return skuFragment(value.value, drop).slice(0, 10);
    })
    .filter(Boolean);
  return [prefix, ...parts].join("-");
}

/** The leading word every value on a device axis shares, if there is one. */
function familyWords(axis: Axis): string[] {
  const firsts = axis.values
    .map((v) => v.value.split(/\s+/)[0])
    .filter(Boolean);
  const unique = new Set(firsts);
  return unique.size === 1 && firsts[0] ? [firsts[0]] : [];
}

function AxisEditor({
  axis,
  devices,
  usedDeviceIds,
  onPatch,
  onRemove,
  onAddValue,
  onRemoveValue,
}: {
  axis: Axis;
  devices: DeviceOption[];
  usedDeviceIds: Set<string>;
  onPatch: (patch: Partial<Axis>) => void;
  onRemove: () => void;
  onAddValue: (value: AxisValue) => void;
  onRemoveValue: (index: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const isDevice = axis.kind === "device_fit";

  return (
    <div className="rounded-lg border border-line bg-raised p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={axis.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          placeholder="Option name"
          aria-label="Option name"
          className="w-40 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm"
        />
        <select
          value={axis.kind}
          onChange={(e) => {
            const kind = e.target.value;
            // Device references are only legal on a device axis — the database
            // check refuses them elsewhere, so they are dropped on the way out.
            onPatch({
              kind,
              values:
                kind === "device_fit"
                  ? axis.values
                  : axis.values.map((v) => ({ ...v, deviceModelId: null })),
            });
          }}
          aria-label="Option kind"
          className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm"
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto text-xs text-warn underline"
        >
          Remove option
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {axis.values.map((v, i) => (
          <span
            key={v.value}
            className="inline-flex items-center gap-1.5 rounded border border-line bg-surface px-2 py-1 text-xs"
          >
            {v.value}
            {isDevice && !v.deviceModelId ? (
              // Allowed, but worth flagging: it sells fine and never appears
              // under "shop by device" until someone identifies it.
              <span
                className="text-warn"
                title="Not matched to a device — won't appear in Shop by device"
              >
                unmatched
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onRemoveValue(i)}
              aria-label={`Remove ${v.value}`}
              className="text-muted"
            >
              ×
            </button>
          </span>
        ))}

        {isDevice ? (
          <select
            value=""
            aria-label="Add a device"
            onChange={(e) => {
              const device = devices.find((d) => d.id === e.target.value);
              if (device)
                onAddValue({ value: device.name, deviceModelId: device.id });
            }}
            className="rounded-md border border-dashed border-line bg-surface px-2 py-1 text-xs"
          >
            <option value="">+ Add a device</option>
            {devices
              .filter((d) => !usedDeviceIds.has(d.id))
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        ) : null}

        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // The grid lives inside a form; Enter here must add a value, not
            // submit the half-built product.
            e.preventDefault();
            onAddValue({ value: draft.trim(), deviceModelId: null });
            setDraft("");
          }}
          placeholder={
            isDevice
              ? "or type an unlisted device"
              : "Type a value, press Enter"
          }
          aria-label="New option value"
          className="w-48 rounded-md border border-line bg-surface px-2 py-1 text-xs"
        />
      </div>
    </div>
  );
}
