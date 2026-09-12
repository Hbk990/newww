import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";

import { loadDevicePicker } from "@/lib/shop/device-picker";
import { storefrontSettings } from "@/lib/storefront/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await storefrontSettings();
  return {
    title: `Shop by phone · ${settings.storeName}`,
    description:
      "Find accessories that fit your phone — pick your model and see what works with it.",
    robots: settings.isPrivate ? { index: false, follow: false } : undefined,
  };
}

/**
 * Shop by phone: the browse path chosen as the shop's main way in.
 *
 * Models link into search for now. Fitment is recorded per variant and rolled
 * up per product, but not one product in the catalog has a fitment row yet, so
 * a "fits this phone" listing would be an empty page for every model. Search
 * on the model name finds the covers and protectors that name it in their
 * title, which is how the catalog actually describes fitment today.
 */
export default async function PhonesPage() {
  const devices = await loadDevicePicker();

  const byBrand = new Map<string, typeof devices>();
  for (const device of devices) {
    const list = byBrand.get(device.brand) ?? [];
    list.push(device);
    byBrand.set(device.brand, list);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="display text-3xl sm:text-4xl">Shop by phone</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Pick your model and we will show what we have for it. Not sure of the
        exact name? Search the number on the back of the phone.
      </p>

      <div className="mt-8 space-y-8">
        {[...byBrand.entries()].map(([brand, models]) => (
          <section key={brand}>
            <h2 className="display text-xl">{brand}</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {models.map((model) => (
                <li key={model.id}>
                  <Link
                    href={
                      `/search?q=${encodeURIComponent(model.model)}` as Route
                    }
                    className="inline-block rounded-md border border-line px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
                  >
                    {model.model}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-10 text-sm text-muted">
        Your phone not listed?{" "}
        <Link href="/account/devices" className="text-accent underline">
          Save your phone to your account
        </Link>{" "}
        and we will tell you what fits.
      </p>
    </main>
  );
}
