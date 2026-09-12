"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/admin/toast";
import {
  deleteRate,
  deleteZone,
  saveRate,
  saveZone,
} from "@/lib/admin/shipping-actions";
import { LEBANON_REGIONS, type Region } from "@/lib/shipping/regions";

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

const dollars = (cents: number) => (cents / 100).toFixed(2);

export type ZoneRow = {
  id: string;
  name: string;
  regions: string[];
  position: number;
};

export type RateRow = {
  id: string;
  zoneId: string;
  name: string;
  priceCents: number;
  minSubtotalCents: number | null;
  position: number;
};

type ZoneDraft = { name: string; regions: Region[]; position: string };
type RateDraft = {
  name: string;
  price: string;
  minSubtotal: string;
  position: string;
};

export function ShippingManager({
  zones,
  rates,
  uncovered,
  canEdit,
}: {
  zones: ZoneRow[];
  rates: RateRow[];
  uncovered: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [zoneDraft, setZoneDraft] = useState<{
    id: string | null;
    draft: ZoneDraft;
  } | null>(null);
  const [rateDraft, setRateDraft] = useState<{
    zoneId: string;
    id: string | null;
    draft: RateDraft;
  } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function commitZone() {
    if (!zoneDraft) return;
    start(async () => {
      const result = await saveZone(zoneDraft.id, {
        name: zoneDraft.draft.name,
        regions: zoneDraft.draft.regions,
        position: zoneDraft.draft.position,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast({ text: result.error, tone: "error" });
        return;
      }
      setErrors({});
      setZoneDraft(null);
      toast({ text: "Zone saved." });
      router.refresh();
    });
  }

  function commitRate() {
    if (!rateDraft) return;
    start(async () => {
      const result = await saveRate(rateDraft.zoneId, rateDraft.id, {
        name: rateDraft.draft.name,
        priceCents: rateDraft.draft.price,
        minSubtotalCents: rateDraft.draft.minSubtotal,
        position: rateDraft.draft.position,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast({ text: result.error, tone: "error" });
        return;
      }
      setErrors({});
      setRateDraft(null);
      toast({ text: "Rate saved." });
      router.refresh();
    });
  }

  function removeZone(zone: ZoneRow) {
    start(async () => {
      const result = await deleteZone(zone.id);
      toast(
        result.ok
          ? { text: `${zone.name} removed.` }
          : { text: result.error, tone: "error" },
      );
      router.refresh();
    });
  }

  function removeRate(rate: RateRow) {
    start(async () => {
      const result = await deleteRate(rate.id);
      toast(
        result.ok
          ? { text: `${rate.name} removed.` }
          : { text: result.error, tone: "error" },
      );
      router.refresh();
    });
  }

  return (
    <div className="mt-5 space-y-5">
      {/*
        The one mistake with a silent cost. A governorate no zone claims is one
        checkout refuses, and the only symptom is a shopper who never completes
        an order — nothing appears in any log.
      */}
      {uncovered.length > 0 ? (
        <div className="rounded-lg border border-warn bg-raised p-4">
          <p className="text-sm font-medium text-warn">
            Not covered by any zone
          </p>
          <p className="mt-1 text-sm">{uncovered.join(", ")}</p>
          <p className="mt-1 text-xs text-muted">
            Checkout refuses these addresses. Add them to a zone, or leave them
            out deliberately.
          </p>
        </div>
      ) : null}

      {zones.map((zone) => {
        const zoneRates = rates.filter((r) => r.zoneId === zone.id);
        const editing = zoneDraft?.id === zone.id;

        return (
          <section
            key={zone.id}
            className="rounded-lg border border-line bg-raised p-4"
          >
            {editing ? (
              <ZoneFields
                draft={zoneDraft.draft}
                errors={errors}
                pending={pending}
                onChange={(draft) => setZoneDraft({ id: zone.id, draft })}
                onSave={commitZone}
                onCancel={() => {
                  setZoneDraft(null);
                  setErrors({});
                }}
              />
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">{zone.name}</h2>
                  <p className="mt-0.5 text-sm text-muted">
                    {zone.regions.join(", ")}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex gap-3 text-sm">
                    <button
                      type="button"
                      onClick={() =>
                        setZoneDraft({
                          id: zone.id,
                          draft: {
                            name: zone.name,
                            regions: zone.regions.filter((r): r is Region =>
                              (LEBANON_REGIONS as readonly string[]).includes(r),
                            ),
                            position: String(zone.position),
                          },
                        })
                      }
                      className="text-accent underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => removeZone(zone)}
                      className="text-warn underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            )}

            <table className="mt-3 w-full text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2 font-medium">Rate</th>
                  <th className="py-2 font-medium">Price</th>
                  <th className="py-2 font-medium">Free over</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {zoneRates.map((rate) => (
                  <tr key={rate.id} className="border-b border-line last:border-0">
                    <td className="py-2">{rate.name}</td>
                    <td className="py-2 tabular">{money(rate.priceCents)}</td>
                    <td className="py-2 tabular">
                      {rate.minSubtotalCents === null
                        ? "—"
                        : money(rate.minSubtotalCents)}
                    </td>
                    <td className="py-2 text-right">
                      {canEdit ? (
                        <span className="flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setRateDraft({
                                zoneId: zone.id,
                                id: rate.id,
                                draft: {
                                  name: rate.name,
                                  price: dollars(rate.priceCents),
                                  minSubtotal:
                                    rate.minSubtotalCents === null
                                      ? ""
                                      : dollars(rate.minSubtotalCents),
                                  position: String(rate.position),
                                },
                              })
                            }
                            className="text-accent underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => removeRate(rate)}
                            className="text-warn underline disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {zoneRates.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-2 text-warn">
                      No rate — this zone cannot be delivered to.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            {rateDraft?.zoneId === zone.id ? (
              <RateFields
                draft={rateDraft.draft}
                errors={errors}
                pending={pending}
                onChange={(draft) =>
                  setRateDraft({ zoneId: zone.id, id: rateDraft.id, draft })
                }
                onSave={commitRate}
                onCancel={() => {
                  setRateDraft(null);
                  setErrors({});
                }}
              />
            ) : canEdit ? (
              <button
                type="button"
                onClick={() =>
                  setRateDraft({
                    zoneId: zone.id,
                    id: null,
                    draft: {
                      name: "",
                      price: "",
                      minSubtotal: "",
                      position: String(zoneRates.length),
                    },
                  })
                }
                className="mt-2 text-sm text-accent underline"
              >
                + Add a rate
              </button>
            ) : null}
          </section>
        );
      })}

      {canEdit ? (
        zoneDraft && zoneDraft.id === null ? (
          <section className="rounded-lg border border-line bg-raised p-4">
            <ZoneFields
              draft={zoneDraft.draft}
              errors={errors}
              pending={pending}
              onChange={(draft) => setZoneDraft({ id: null, draft })}
              onSave={commitZone}
              onCancel={() => {
                setZoneDraft(null);
                setErrors({});
              }}
            />
          </section>
        ) : (
          <button
            type="button"
            onClick={() =>
              setZoneDraft({
                id: null,
                draft: { name: "", regions: [], position: String(zones.length) },
              })
            }
            className="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-on-accent"
          >
            Add a zone
          </button>
        )
      ) : null}
    </div>
  );
}

function ZoneFields({
  draft,
  errors,
  pending,
  onChange,
  onSave,
  onCancel,
}: {
  draft: ZoneDraft;
  errors: Record<string, string>;
  pending: boolean;
  onChange: (draft: ZoneDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-sm font-medium">Zone name</span>
        <input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          maxLength={80}
          className="mt-1 w-full max-w-sm rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
        {errors.name ? (
          <span className="mt-1 block text-xs text-warn">{errors.name}</span>
        ) : null}
      </label>

      <fieldset>
        <legend className="text-sm font-medium">Governorates</legend>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-2">
          {LEBANON_REGIONS.map((region) => (
            <label key={region} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.regions.includes(region)}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    regions: e.target.checked
                      ? [...draft.regions, region]
                      : draft.regions.filter((r) => r !== region),
                  })
                }
              />
              {region}
            </label>
          ))}
        </div>
        {errors.regions ? (
          <p className="mt-1 text-xs text-warn">{errors.regions}</p>
        ) : null}
      </fieldset>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onSave}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent disabled:opacity-50"
        >
          Save zone
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-line px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function RateFields({
  draft,
  errors,
  pending,
  onChange,
  onSave,
  onCancel,
}: {
  draft: RateDraft;
  errors: Record<string, string>;
  pending: boolean;
  onChange: (draft: RateDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 space-y-3 rounded-md border border-line p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="Standard delivery"
            className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm"
          />
          {errors.name ? (
            <span className="mt-1 block text-xs text-warn">{errors.name}</span>
          ) : null}
        </label>

        <label className="block">
          <span className="text-sm font-medium">Price</span>
          <input
            value={draft.price}
            onChange={(e) => onChange({ ...draft, price: e.target.value })}
            inputMode="decimal"
            placeholder="3.00"
            className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm"
          />
          {errors.priceCents ? (
            <span className="mt-1 block text-xs text-warn">
              {errors.priceCents}
            </span>
          ) : null}
        </label>

        <label className="block">
          <span className="text-sm font-medium">Free over</span>
          <input
            value={draft.minSubtotal}
            onChange={(e) => onChange({ ...draft, minSubtotal: e.target.value })}
            inputMode="decimal"
            placeholder="blank for never"
            className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm"
          />
          {errors.minSubtotalCents ? (
            <span className="mt-1 block text-xs text-warn">
              {errors.minSubtotalCents}
            </span>
          ) : null}
        </label>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onSave}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent disabled:opacity-50"
        >
          Save rate
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-line px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
