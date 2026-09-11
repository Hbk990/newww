import { DevicesManager } from "@/components/admin/devices-manager";
import { loadDevices } from "@/lib/admin/taxonomy-actions";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Devices · DRPHONE" };

export default async function Page() {
  await requirePermission("products.edit");
  const { brandRows, modelRows } = await loadDevices();

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Devices</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        The phones and tablets your products fit. These are models, never
        colours — a red iPhone 17 and a black one are the same body, so one row
        covers both.
      </p>
      <DevicesManager brandRows={brandRows} modelRows={modelRows} />
    </>
  );
}
