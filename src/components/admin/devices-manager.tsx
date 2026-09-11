"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useToast } from "@/components/admin/toast";
import {
  deleteDeviceBrand,
  deleteDeviceModel,
  saveDeviceBrand,
  saveDeviceModel,
  setDeviceModelActive,
  type DeviceBrandInput,
  type DeviceModelInput,
} from "@/lib/admin/taxonomy-actions";

export type DeviceBrandRow = {
  id: string;
  name: string;
  slug: string;
  position: number;
};

export type DeviceModelRow = {
  id: string;
  deviceBrandId: string;
  name: string;
  slug: string;
  family: string | null;
  releaseYear: number | null;
  isActive: boolean;
  position: number;
  /** How many variants list this device as a fit. */
  fitted: number;
};

type ModelDraft = {
  name: string;
  slug: string;
  deviceBrandId: string;
  family: string;
  releaseYear: string;
  isActive: boolean;
  position: number;
};

export function DevicesManager({
  brandRows,
  modelRows,
}: {
  brandRows: DeviceBrandRow[];
  modelRows: DeviceModelRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState("");
  const [openBrand, setOpenBrand] = useState<string | null>(brandRows[0]?.id ?? null);
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [addingModelFor, setAddingModelFor] = useState<string | null>(null);
  const [modelDraft, setModelDraft] = useState<ModelDraft | null>(null);
  const [addingBrand, setAddingBrand] = useState(false);
  const [brandDraft, setBrandDraft] = useState<DeviceBrandInput>({
    name: "",
    slug: "",
    position: 0,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string | null>(null);

  const needle = filter.trim().toLowerCase();
  const matching = useMemo(
    () =>
      needle
        ? modelRows.filter(
            (m) =>
              m.name.toLowerCase().includes(needle) ||
              (m.family ?? "").toLowerCase().includes(needle),
          )
        : modelRows,
    [modelRows, needle],
  );

  const modelsFor = (brandId: string) =>
    matching.filter((m) => m.deviceBrandId === brandId);

  /*
   * A model whose name has no family is worth surfacing.
   *
   * The seed derived families from the catalog export and left a handful
   * unmatched — "A3", "X 11PRO" — which are real devices nobody has
   * identified. Without a family they sit alone in the fitment picker instead
   * of under a range, so they are easy to miss and easy to fix from here.
   */
  const unfamilied = modelRows.filter((m) => !m.family);

  function openModelEdit(model: DeviceModelRow) {
    setAddingModelFor(null);
    setEditingModel(model.id);
    setErrors({});
    setModelDraft({
      name: model.name,
      slug: model.slug,
      deviceBrandId: model.deviceBrandId,
      family: model.family ?? "",
      releaseYear: model.releaseYear?.toString() ?? "",
      isActive: model.isActive,
      position: model.position,
    });
  }

  function openModelAdd(brandId: string) {
    setEditingModel(null);
    setAddingModelFor(brandId);
    setErrors({});
    setModelDraft({
      name: "",
      slug: "",
      deviceBrandId: brandId,
      family: "",
      releaseYear: "",
      isActive: true,
      position: modelRows.filter((m) => m.deviceBrandId === brandId).length,
    });
  }

  function submitModel(id: string | null) {
    if (!modelDraft) return;
    start(async () => {
      const payload: DeviceModelInput = {
        name: modelDraft.name,
        // Blank means "derive from brand and name", which the action does —
        // and which is how the seed built these slugs.
        slug: modelDraft.slug,
        deviceBrandId: modelDraft.deviceBrandId,
        family: modelDraft.family || null,
        releaseYear: modelDraft.releaseYear ? Number(modelDraft.releaseYear) : null,
        isActive: modelDraft.isActive,
        position: modelDraft.position,
      };
      const result = await saveDeviceModel(id, payload);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast({ text: result.error, tone: "error" });
        return;
      }
      toast({ text: `${modelDraft.name} saved.` });
      setEditingModel(null);
      setAddingModelFor(null);
      setModelDraft(null);
      router.refresh();
    });
  }

  function removeModel(model: DeviceModelRow) {
    start(async () => {
      const result = await deleteDeviceModel(model.id);
      if (!result.ok) {
        toast({ text: result.error, tone: "error" });
        setConfirming(null);
        return;
      }
      toast({ text: `${model.name} deleted.` });
      setConfirming(null);
      router.refresh();
    });
  }

  function toggleActive(model: DeviceModelRow) {
    start(async () => {
      const result = await setDeviceModelActive(model.id, !model.isActive);
      if (!result.ok) {
        toast({ text: result.error, tone: "error" });
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      {unfamilied.length > 0 ? (
        <p className="mt-3 rounded-md border border-warn bg-raised px-3 py-2 text-sm">
          <strong>
            {unfamilied.length} device{unfamilied.length === 1 ? "" : "s"} with no
            range
          </strong>{" "}
          — {unfamilied.map((m) => m.name).join(", ")}. Giving each one a range
          groups it with its siblings in the fitment picker instead of standing
          alone.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter models — iPhone 15, Galaxy A…"
          aria-label="Filter models"
          className="w-full max-w-xs rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => {
            setAddingBrand(true);
            setBrandDraft({ name: "", slug: "", position: brandRows.length });
          }}
          className="rounded-md border border-line px-3 py-1.5 text-sm"
        >
          New device brand
        </button>
        <span className="text-xs text-muted">
          {brandRows.length} brands · {modelRows.length} models
        </span>
      </div>

      {addingBrand ? (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-md border border-line bg-raised p-3">
          <label className="min-w-40 flex-1">
            <span className="text-xs font-medium">Brand name</span>
            <input
              value={brandDraft.name}
              onChange={(e) => setBrandDraft({ ...brandDraft, name: e.target.value })}
              autoFocus
              maxLength={80}
              className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={pending || !brandDraft.name.trim()}
            onClick={() =>
              start(async () => {
                const result = await saveDeviceBrand(null, brandDraft);
                if (!result.ok) {
                  toast({ text: result.error, tone: "error" });
                  return;
                }
                toast({ text: `${brandDraft.name} added.` });
                setAddingBrand(false);
                router.refresh();
              })
            }
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setAddingBrand(false)}
            className="pb-1.5 text-xs text-muted underline"
          >
            Cancel
          </button>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {brandRows.map((brand) => {
          const models = modelsFor(brand.id);
          const total = modelRows.filter((m) => m.deviceBrandId === brand.id).length;
          const open = openBrand === brand.id || needle.length > 0;
          if (needle.length > 0 && models.length === 0) return null;

          return (
            <div key={brand.id} className="rounded-lg border border-line bg-raised">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setOpenBrand(open && !needle ? null : brand.id)}
                  aria-expanded={open}
                  className="font-medium"
                >
                  {open ? "▾" : "▸"} {brand.name}
                </button>
                <span className="text-xs text-muted">
                  {total} model{total === 1 ? "" : "s"}
                  {needle && models.length !== total ? ` · ${models.length} matching` : null}
                </span>
                <span className="ml-auto flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openModelAdd(brand.id)}
                    className="text-xs text-accent underline"
                  >
                    Add model
                  </button>
                  {confirming === brand.id ? (
                    <>
                      <span className="text-xs">Delete {brand.name}?</span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const result = await deleteDeviceBrand(brand.id);
                            if (!result.ok) {
                              toast({ text: result.error, tone: "error" });
                              setConfirming(null);
                              return;
                            }
                            toast({ text: `${brand.name} deleted.` });
                            setConfirming(null);
                            router.refresh();
                          })
                        }
                        className="text-xs font-medium text-warn underline"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="text-xs text-muted underline"
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(brand.id)}
                      aria-label={`Delete ${brand.name}`}
                      className="text-xs text-warn underline"
                    >
                      Delete
                    </button>
                  )}
                </span>
              </div>

              {addingModelFor === brand.id && modelDraft ? (
                <div className="px-3 pb-3">
                  <ModelEditor
                    draft={modelDraft}
                    setDraft={setModelDraft}
                    errors={errors}
                    pending={pending}
                    onSave={() => submitModel(null)}
                    onCancel={() => {
                      setAddingModelFor(null);
                      setModelDraft(null);
                    }}
                  />
                </div>
              ) : null}

              {open ? (
                <ul className="divide-y divide-line border-t border-line">
                  {models.map((model) => (
                    <li key={model.id} className="px-3 py-2">
                      {editingModel === model.id && modelDraft ? (
                        <ModelEditor
                          draft={modelDraft}
                          setDraft={setModelDraft}
                          errors={errors}
                          pending={pending}
                          onSave={() => submitModel(model.id)}
                          onCancel={() => {
                            setEditingModel(null);
                            setModelDraft(null);
                          }}
                        />
                      ) : (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className={`text-sm ${model.isActive ? "" : "text-muted"}`}>
                            {model.name}
                          </span>
                          {model.family ? (
                            <span className="rounded bg-sunken px-1.5 py-0.5 text-[10px] text-muted">
                              {model.family}
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase tracking-wide text-warn">
                              no range
                            </span>
                          )}
                          {!model.isActive ? (
                            <span className="text-[10px] uppercase tracking-wide text-muted">
                              off
                            </span>
                          ) : null}
                          <span className="text-xs text-muted">
                            {model.fitted === 0
                              ? "nothing fits it"
                              : model.fitted === 1
                                ? "1 variant fits"
                                : `${model.fitted} variants fit`}
                          </span>

                          <span className="ml-auto flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => toggleActive(model)}
                              disabled={pending}
                              className="text-xs text-muted underline"
                            >
                              {model.isActive ? "Switch off" : "Switch on"}
                            </button>
                            <button
                              type="button"
                              onClick={() => openModelEdit(model)}
                              className="text-xs text-accent underline"
                            >
                              Edit
                            </button>
                            {confirming === model.id ? (
                              <>
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() => removeModel(model)}
                                  className="text-xs font-medium text-warn underline"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirming(null)}
                                  className="text-xs text-muted underline"
                                >
                                  Keep
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirming(model.id)}
                                aria-label={`Delete ${model.name}`}
                                className="text-xs text-warn underline"
                              >
                                Delete
                              </button>
                            )}
                          </span>
                        </div>
                      )}
                    </li>
                  ))}
                  {models.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-muted">No models yet.</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

function ModelEditor({
  draft,
  setDraft,
  errors,
  pending,
  onSave,
  onCancel,
}: {
  draft: ModelDraft;
  setDraft: (next: ModelDraft) => void;
  errors: Record<string, string>;
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-md border border-line bg-surface p-3">
      <label className="min-w-36 flex-1">
        <span className="text-xs font-medium">Model name</span>
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          autoFocus
          maxLength={80}
          placeholder="iPhone 15 Plus"
          className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm"
        />
        {errors.name ? <span className="text-xs text-warn">{errors.name}</span> : null}
      </label>

      <label className="min-w-28 flex-1">
        <span className="text-xs font-medium">Range</span>
        <input
          value={draft.family}
          onChange={(e) => setDraft({ ...draft, family: e.target.value })}
          maxLength={40}
          placeholder="iPhone"
          className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm"
        />
      </label>

      <label className="w-24">
        <span className="text-xs font-medium">Year</span>
        <input
          value={draft.releaseYear}
          onChange={(e) => setDraft({ ...draft, releaseYear: e.target.value })}
          inputMode="numeric"
          placeholder="2025"
          className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm"
        />
        {errors.releaseYear ? (
          <span className="text-xs text-warn">{errors.releaseYear}</span>
        ) : null}
      </label>

      <label className="mt-5 flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={draft.isActive}
          onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
        />
        Offered
      </label>

      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={pending || !draft.name.trim()}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-muted underline">
          Cancel
        </button>
      </div>
      {errors.slug ? <p className="w-full text-xs text-warn">{errors.slug}</p> : null}
    </div>
  );
}
