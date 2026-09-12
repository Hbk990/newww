import { SettingsForm } from "@/components/admin/settings-form";
import { loadSettings } from "@/lib/admin/settings-actions";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";

export const metadata = { title: "Settings · DRPHONE" };

// The guard runs before anything is returned, so its redirect happens before
// the response starts streaming.
export default async function Page() {
  const user = await requirePermission("settings.view");
  const settings = await loadSettings();

  if (!settings) {
    return (
      <>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-3 max-w-prose text-sm text-warn">
          There is no settings row. It is seeded by migration 0024 — run{" "}
          <code className="rounded bg-sunken px-1">npm run db:migrate</code>.
          Until then order numbers fall back to the DR prefix and the
          free-delivery threshold has nothing to read.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 max-w-prose text-sm text-muted">
        One row, shop-wide. Delivery prices live under Delivery zones; this is
        the threshold that makes them free.
      </p>

      <SettingsForm settings={settings} canEdit={can(user, "settings.edit")} />
    </>
  );
}
