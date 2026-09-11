import { Placeholder } from "@/components/admin/placeholder";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Settings · DRPHONE" };

// The guard runs before anything is returned, so its redirect happens before
// the response starts streaming.
export default async function Page() {
  await requirePermission("settings.view");

  return (
    <Placeholder
      title="Settings"
      description="Store name, logo, phone, WhatsApp, timezone, delivery thresholds and maintenance mode."
    />
  );
}
