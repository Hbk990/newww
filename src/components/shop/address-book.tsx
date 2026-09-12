"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  deleteAddress,
  saveAddress,
  setDefaultAddress,
  type AddressInput,
} from "@/lib/account/address-actions";
import { MAX_ADDRESSES } from "@/lib/account/addresses";
import { LEBANON_REGIONS, type Region } from "@/lib/shipping/regions";

export type BookAddress = {
  id: string;
  label: string | null;
  name: string;
  phone: string;
  line1: string;
  building: string | null;
  floor: string | null;
  city: string;
  region: string;
  directions: string | null;
  isDefault: boolean;
};

const EMPTY: AddressInput = {
  label: "",
  name: "",
  phone: "",
  line1: "",
  building: "",
  floor: "",
  city: "",
  region: "Beirut",
  directions: "",
};

/**
 * The address book: the saved places, and one form that adds or edits.
 *
 * One form rather than two screens. Adding and editing an address differ only
 * in whether an id goes with it, and a separate edit page would mean the same
 * eight fields maintained twice — which is how the two slowly stop matching.
 *
 * Deleting asks first. It is one tap next to "Use this one by default", and an
 * address is a minute of typing that nobody wants to repeat because their
 * thumb landed a centimetre off.
 */
export function AddressBook({ addresses }: { addresses: BookAddress[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<AddressInput>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const full = addresses.length >= MAX_ADDRESSES;

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setErrors({});
    setFailure(null);
    setOpen(true);
  }

  function openEdit(address: BookAddress) {
    setEditing(address.id);
    setForm({
      label: address.label ?? "",
      name: address.name,
      phone: address.phone,
      line1: address.line1,
      building: address.building ?? "",
      floor: address.floor ?? "",
      city: address.city,
      // An address saved before the governorate list existed can hold
      // something not on it; the select then starts unset rather than showing
      // a value the delivery lookup would not match.
      region: (LEBANON_REGIONS as readonly string[]).includes(address.region)
        ? (address.region as Region)
        : "Beirut",
      directions: address.directions ?? "",
    });
    setErrors({});
    setFailure(null);
    setOpen(true);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setFailure(null);
    start(async () => {
      const result = await saveAddress(editing, form);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFailure(result.error);
        return;
      }
      setOpen(false);
      setErrors({});
      router.refresh();
    });
  }

  function act(run: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const result = await run();
      setFailure(result.ok ? null : (result.error ?? "That did not work."));
      setConfirming(null);
      router.refresh();
    });
  }

  return (
    <div className="mt-6">
      {failure ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-warn px-3 py-2 text-sm text-warn"
        >
          {failure}
        </p>
      ) : null}

      {addresses.length === 0 ? (
        <p className="text-muted">
          Nothing saved yet. Your next order will keep its address here
          automatically, or add one now.
        </p>
      ) : (
        <ul
          aria-label="Saved addresses"
          className="divide-y divide-line border-y border-line"
        >
          {addresses.map((address) => (
            <li key={address.id} className="py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {address.label ?? address.city}
                    {address.isDefault ? (
                      <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">
                        default
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm text-muted">{address.name}</p>
                  <p className="text-sm text-muted">
                    {[
                      address.line1,
                      address.building,
                      address.floor ? `floor ${address.floor}` : null,
                      address.city,
                      address.region,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  <p className="text-sm text-muted">{address.phone}</p>
                  {address.directions ? (
                    <p className="mt-1 text-sm text-muted">
                      {address.directions}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5 text-sm">
                  <button
                    type="button"
                    onClick={() => openEdit(address)}
                    disabled={pending}
                    className="underline underline-offset-4 disabled:opacity-50"
                  >
                    Edit
                  </button>

                  {address.isDefault ? null : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => act(() => setDefaultAddress(address.id))}
                      className="text-accent underline underline-offset-4 disabled:opacity-50"
                    >
                      Use by default
                    </button>
                  )}

                  {confirming === address.id ? (
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => act(() => deleteAddress(address.id))}
                        className="text-warn underline underline-offset-4 disabled:opacity-50"
                      >
                        Really remove
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="text-muted underline underline-offset-4"
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setConfirming(address.id)}
                      className="text-muted underline underline-offset-4 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <form
          onSubmit={submit}
          className="mt-6 space-y-4 rounded-xl border border-line bg-raised p-5"
        >
          <h2 className="display text-xl">
            {editing ? "Edit address" : "New address"}
          </h2>

          <Row>
            <Field
              id="addr-label"
              label="Name this place"
              hint="Home, work, the shop — optional."
              value={form.label}
              onChange={(v) => setForm({ ...form, label: v })}
              error={errors.label}
            />
            <Field
              id="addr-name"
              label="Who the driver asks for"
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
              error={errors.name}
              autoComplete="name"
            />
          </Row>

          <Field
            id="addr-phone"
            label="Phone"
            hint="The driver calls before arriving."
            value={form.phone}
            onChange={(v) => setForm({ ...form, phone: v })}
            error={errors.phone}
            autoComplete="tel"
          />

          <Field
            id="addr-line1"
            label="Street address"
            value={form.line1}
            onChange={(v) => setForm({ ...form, line1: v })}
            error={errors.line1}
            autoComplete="address-line1"
          />

          <Row>
            <Field
              id="addr-building"
              label="Building"
              value={form.building}
              onChange={(v) => setForm({ ...form, building: v })}
              error={errors.building}
            />
            <Field
              id="addr-floor"
              label="Floor"
              value={form.floor}
              onChange={(v) => setForm({ ...form, floor: v })}
              error={errors.floor}
            />
          </Row>

          <Row>
            <Field
              id="addr-city"
              label="City or town"
              value={form.city}
              onChange={(v) => setForm({ ...form, city: v })}
              error={errors.city}
              autoComplete="address-level2"
            />
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Governorate</span>
              <select
                id="addr-region"
                value={form.region}
                onChange={(e) =>
                  setForm({ ...form, region: e.target.value as Region })
                }
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
              >
                {LEBANON_REGIONS.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
              {errors.region ? (
                <span className="text-xs text-warn">{errors.region}</span>
              ) : null}
            </label>
          </Row>

          {/* The line that actually gets a parcel delivered here. */}
          <Field
            id="addr-directions"
            label="How to find it"
            hint="Near the pharmacy, blue gate, second door — optional."
            value={form.directions}
            onChange={(v) => setForm({ ...form, directions: v })}
            error={errors.directions}
          />

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
            >
              {pending ? "Saving…" : editing ? "Save changes" : "Add address"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-muted underline underline-offset-4"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-6">
          <button
            type="button"
            onClick={openNew}
            disabled={full}
            className="rounded-md border border-line px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Add an address
          </button>
          {full ? (
            <p className="mt-2 text-sm text-muted">
              {MAX_ADDRESSES} is the most we keep. Remove one to add another.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  error,
  autoComplete,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoComplete?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm" htmlFor={id}>
      <span className="font-medium">{label}</span>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        className={`rounded-md border bg-surface px-3 py-2 text-sm ${
          error ? "border-warn" : "border-line"
        }`}
      />
      {error ? (
        <span className="text-xs text-warn">{error}</span>
      ) : hint ? (
        <span className="text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}
