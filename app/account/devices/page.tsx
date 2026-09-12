import { MyDevices } from "@/components/shop/my-devices";
import { requireVerified } from "@/lib/auth/guards";
import { loadDevicePicker } from "@/lib/shop/device-picker";
import { loadMyDevices } from "@/lib/shop/my-devices";

export const metadata = { title: "My phones · DRPHONE" };
export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  await requireVerified();
  const [mine, choices] = await Promise.all([
    loadMyDevices(),
    loadDevicePicker(),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">My phones</h1>
      <p className="mt-2 text-sm text-muted">
        Tell us what you own and we will say whether a case or a cable fits it,
        without you choosing a model every visit.
      </p>

      <MyDevices mine={mine} choices={choices} />
    </main>
  );
}
