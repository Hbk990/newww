"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/admin/toast";
import { saveSettings, type SettingsInput } from "@/lib/admin/settings-actions";

const dollars = (cents: number | null) =>
  cents === null ? "" : (cents / 100).toFixed(2);

export type SettingsRow = {
  storeName: string;
  currency: string;
  country: string;
  phone: string | null;
  whatsappNumber: string | null;
  logoUrl: string | null;
  timezone: string;
  orderNumberPrefix: string;
  freeDeliveryThresholdCents: number | null;
  defaultLowStockThreshold: number | null;
  isPrivate: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  taxRateBps: number;
  pricesIncludeTax: boolean;
};

export function SettingsForm({
  settings,
  canEdit,
}: {
  settings: SettingsRow;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<SettingsInput>({
    storeName: settings.storeName,
    phone: settings.phone ?? "",
    whatsappNumber: settings.whatsappNumber ?? "",
    logoUrl: settings.logoUrl ?? "",
    timezone: settings.timezone,
    orderNumberPrefix: settings.orderNumberPrefix,
    freeDeliveryThresholdCents: dollars(settings.freeDeliveryThresholdCents),
    defaultLowStockThreshold:
      settings.defaultLowStockThreshold === null
        ? ""
        : String(settings.defaultLowStockThreshold),
    isPrivate: settings.isPrivate,
    maintenanceMode: settings.maintenanceMode,
    maintenanceMessage: settings.maintenanceMessage ?? "",
  });

  const set = <K extends keyof SettingsInput>(
    key: K,
    value: SettingsInput[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await saveSettings(form);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast({ text: result.error, tone: "error" });
        return;
      }
      setErrors({});
      toast({ text: "Settings saved." });
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="mt-5 max-w-2xl space-y-6">
      <fieldset
        disabled={!canEdit || pending}
        className="space-y-5 disabled:opacity-70"
      >
        <Section title="The shop">
          <Field label="Store name" error={errors.storeName}>
            <input
              value={form.storeName}
              onChange={(e) => set("storeName", e.target.value)}
              maxLength={80}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" error={errors.phone}>
              <input
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+961 1 000 000"
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field
              label="WhatsApp"
              hint="Where order enquiries arrive."
              error={errors.whatsappNumber}
            >
              <input
                value={form.whatsappNumber ?? ""}
                onChange={(e) => set("whatsappNumber", e.target.value)}
                placeholder="+961 70 000 000"
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <Field label="Logo URL" error={errors.logoUrl}>
            <input
              value={form.logoUrl ?? ""}
              onChange={(e) => set("logoUrl", e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm"
            />
          </Field>

          <Field
            label="Timezone"
            hint="Orders are stored in UTC; this only changes how times are shown."
            error={errors.timezone}
          >
            <input
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm"
            />
          </Field>
        </Section>

        <Section title="Orders and delivery">
          <Field
            label="Order number prefix"
            hint={`Numbers look like ${form.orderNumberPrefix || "DR"}-20260912-00001. Existing orders keep the numbers they were given.`}
            error={errors.orderNumberPrefix}
          >
            <input
              value={form.orderNumberPrefix}
              onChange={(e) => set("orderNumberPrefix", e.target.value)}
              maxLength={8}
              className="w-32 rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm"
            />
          </Field>

          <Field
            label="Free delivery over"
            hint="Blank for never. Applies shop-wide, on top of any per-zone offer — whichever a basket clears first."
            error={errors.freeDeliveryThresholdCents}
          >
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted">$</span>
              <input
                value={form.freeDeliveryThresholdCents}
                onChange={(e) =>
                  set("freeDeliveryThresholdCents", e.target.value)
                }
                inputMode="decimal"
                placeholder="blank for never"
                className="w-40 rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm"
              />
            </div>
          </Field>

          <Field
            label="Default low-stock threshold"
            hint="Used for counted variants that have no threshold of their own. Blank for none."
            error={errors.defaultLowStockThreshold}
          >
            <input
              value={form.defaultLowStockThreshold}
              onChange={(e) => set("defaultLowStockThreshold", e.target.value)}
              inputMode="numeric"
              className="w-32 rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm"
            />
          </Field>
        </Section>

        <Section title="Visibility">
          <Toggle
            label="Keep the shop out of search engines"
            hint="Sends noindex. Leave on until the catalog is ready; a half-finished shop that gets indexed is hard to undo."
            checked={form.isPrivate}
            onChange={(v) => set("isPrivate", v)}
          />

          <Toggle
            label="Maintenance mode"
            hint="Shoppers see a holding page. Staff keep full access, so you can work while it is on."
            checked={form.maintenanceMode}
            onChange={(v) => set("maintenanceMode", v)}
          />

          {form.maintenanceMode ? (
            <Field label="What shoppers see" error={errors.maintenanceMessage}>
              <input
                value={form.maintenanceMessage ?? ""}
                onChange={(e) => set("maintenanceMessage", e.target.value)}
                maxLength={500}
                placeholder="Back shortly — call us on +961 …"
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
              />
            </Field>
          ) : null}
        </Section>
      </fieldset>

      {/*
        Shown, not editable. Currency is single by design — a second one is a
        schema change, not a setting — and tax is zero and price-inclusive
        because prices are entered with it already in. An editable tax field
        would be an invitation to add tax twice.
      */}
      <section className="rounded-lg border border-line bg-sunken p-4 text-sm">
        <p className="text-xs uppercase tracking-wide text-muted">Fixed</p>
        <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <Fixed label="Currency" value={settings.currency} />
          <Fixed label="Delivers to" value={settings.country} />
          <Fixed
            label="Tax"
            value={
              settings.taxRateBps === 0
                ? "None — prices include it"
                : `${settings.taxRateBps / 100}%`
            }
          />
          <Fixed
            label="Prices include tax"
            value={settings.pricesIncludeTax ? "Yes" : "No"}
          />
        </dl>
      </section>

      {canEdit ? (
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
      ) : (
        <p className="text-sm text-muted">
          You can read these but not change them.
        </p>
      )}
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-raised p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
      <span className="mt-1.5 block">{children}</span>
      {error ? <span className="mt-1 block text-xs text-warn">{error}</span> : null}
    </label>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}

function Fixed({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
