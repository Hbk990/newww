"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useToast } from "@/components/admin/toast";
import { setFitment, type FitmentDevice } from "@/lib/admin/fitment-actions";

/**
 * Which devices a product fits.
 *
 * Grouped by brand and family because that is how the question is actually
 * asked — "does it fit the Galaxy A range?" — and because 79 flat checkboxes
 * is a list nobody reads. The groups come from `device_models.family`, which
 * the seed already populated; the `device_groups` table is for curated sets
 * that cut across a family and stays unused until something needs one.
 */
export function FitmentPicker({
  productId,
  devices,
  selectedIds,
  fromAxis,
}: {
  productId: string;
  devices: FitmentDevice[];
  selectedIds: string[];
  fromAxis: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [filter, setFilter] = useState("");
  const [dirty, setDirty] = useState(false);

  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matching = needle
      ? devices.filter(
          (d) =>
            d.name.toLowerCase().includes(needle) ||
            d.brand.toLowerCase().includes(needle) ||
            (d.family ?? "").toLowerCase().includes(needle),
        )
      : devices;

    const byKey = new Map<
      string,
      { brand: string; family: string; items: FitmentDevice[] }
    >();
    for (const device of matching) {
      // A model with no family stands alone rather than being lumped into a
      // fake "Other" that would hide it.
      const family = device.family ?? device.name;
      const key = `${device.brand} :: ${family}`;
      const existing = byKey.get(key);
      if (existing) existing.items.push(device);
      else byKey.set(key, { brand: device.brand, family, items: [device] });
    }
    return [...byKey.values()];
  }, [devices, filter]);

  function toggle(id: string, on: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    setDirty(true);
  }

  function toggleGroup(items: FitmentDevice[], on: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const item of items) {
        if (on) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
    setDirty(true);
  }

  function save() {
    start(async () => {
      const result = await setFitment(productId, [...selected]);
      if (!result.ok) {
        toast({ text: result.error, tone: "error" });
        return;
      }
      setDirty(false);
      toast({
        text:
          result.devices === 0
            ? "Fitment cleared — this product no longer lists a device."
            : `Fits ${result.devices} device${result.devices === 1 ? "" : "s"}.`,
      });
      router.refresh();
    });
  }

  if (fromAxis) {
    return (
      <section className="mt-8">
        <h2 className="text-base font-semibold">Fits which devices</h2>
        <p className="mt-2 rounded-md border border-line bg-raised px-3 py-2.5 text-sm text-muted">
          This product has a <strong>Device</strong> option, so each variant
          carries its own device and fitment is taken from the grid above.
          Nothing to set here — remove that option if you would rather list
          devices for the whole product.
        </p>
        {selectedIds.length > 0 ? (
          <p className="mt-2 text-xs text-muted">
            Currently fitting {selectedIds.length} device
            {selectedIds.length === 1 ? "" : "s"} from the Device option.
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Fits which devices</h2>
        <span className="text-xs text-muted">
          {selected.size === 0
            ? "none — it won't appear under Shop by device"
            : `${selected.size} selected`}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        For something that fits many phones without changing — a cable, a
        charger. Tick a range to take all of it.
      </p>

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter — iPhone 15, Galaxy A, Redmi…"
        aria-label="Filter devices"
        className="mt-3 w-full max-w-sm rounded-md border border-line bg-surface px-3 py-2 text-sm"
      />

      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          No device matches &ldquo;{filter}&rdquo;. Add it under Devices if you
          stock for it.
        </p>
      ) : (
        <div className="mt-3 max-h-80 space-y-3 overflow-auto rounded-lg border border-line bg-raised p-3">
          {groups.map((group) => {
            const all = group.items.every((i) => selected.has(i.id));
            const some = !all && group.items.some((i) => selected.has(i.id));
            return (
              <div key={`${group.brand}-${group.family}`}>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={all}
                    // Indeterminate says "part of this range" — without it a
                    // half-selected family looks the same as an empty one.
                    ref={(el) => {
                      if (el) el.indeterminate = some;
                    }}
                    onChange={(e) => toggleGroup(group.items, e.target.checked)}
                    aria-label={`All ${group.brand} ${group.family}`}
                  />
                  <span className="text-sm font-medium">
                    {group.brand} {group.family}
                  </span>
                  <span className="text-xs text-muted">
                    {group.items.length} model
                    {group.items.length === 1 ? "" : "s"}
                  </span>
                </label>
                <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 border-l border-line pl-4 sm:grid-cols-3">
                  {group.items.map((device) => (
                    <label
                      key={device.id}
                      className="flex cursor-pointer items-center gap-1.5 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(device.id)}
                        onChange={(e) => toggle(device.id, e.target.checked)}
                      />
                      {device.name}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save fitment"}
        </button>
        {dirty ? (
          <button
            type="button"
            onClick={() => {
              setSelected(new Set(selectedIds));
              setDirty(false);
            }}
            className="text-sm text-muted underline"
          >
            Undo changes
          </button>
        ) : null}
        {selected.size > 0 ? (
          <button
            type="button"
            onClick={() => {
              setSelected(new Set());
              setDirty(true);
            }}
            className="ml-auto text-xs text-warn underline"
          >
            Clear all
          </button>
        ) : null}
      </div>
      {/*
        Saved separately from the product form on purpose. Fitment writes a row
        per variant per device — 40 devices across 3 lengths is 120 rows — and
        folding that into the product save would let an unrelated typo in the
        title roll back the whole selection.
      */}
      <p className="mt-2 text-xs text-muted">
        Saved on its own, not with the product form.
      </p>
    </section>
  );
}
