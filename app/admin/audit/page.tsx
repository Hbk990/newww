import { Placeholder } from "@/components/admin/placeholder";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Audit log · DRPHONE" };

// The guard runs before anything is returned, so its redirect happens before
// the response starts streaming.
export default async function Page() {
  await requirePermission("audit.view");

  return (
    <Placeholder
      title="Audit log"
      description="Who changed what, when, and what it was before. Append-only, enforced by the database."
    />
  );
}
