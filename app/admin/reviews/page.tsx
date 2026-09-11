import { Placeholder } from "@/components/admin/placeholder";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Reviews · DRPHONE" };

// The guard runs before anything is returned, so its redirect happens before
// the response starts streaming.
export default async function Page() {
  await requirePermission("reviews.moderate");

  return (
    <Placeholder
      title="Reviews"
      description="The moderation queue for reviews from verified purchasers, with their photos."
    />
  );
}
