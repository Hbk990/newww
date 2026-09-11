import { Placeholder } from "@/components/admin/placeholder";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Staff · DRPHONE" };

// The guard runs before anything is returned, so its redirect happens before
// the response starts streaming.
export default async function Page() {
  await requirePermission("users.manage");

  return (
    <Placeholder
      title="Staff"
      description="Create and edit staff accounts, change roles, suspend an account, and force a sign-out or a password change."
    />
  );
}
