import { db } from "@/db";
import { storeSettings } from "@/db/schema";

export type StorefrontSettings = {
  storeName: string;
  phone: string | null;
  whatsappNumber: string | null;
  /** Null when no threshold is set, which means nothing ships free. */
  freeDeliveryThresholdCents: number | null;
  isPrivate: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
};

/**
 * The handful of settings the storefront itself needs.
 *
 * A narrow select rather than the whole row: this runs on every storefront
 * request, and the row carries currency, tax and display-rate fields no page
 * reads.
 *
 * Falls back to sensible values when there is no row rather than throwing — a
 * missing configuration row must not take the shop down. Note the fallback is
 * `isPrivate: true`, so an unconfigured shop stays out of search engines rather
 * than being indexed half-built.
 */
export async function storefrontSettings(): Promise<StorefrontSettings> {
  const [row] = await db
    .select({
      storeName: storeSettings.storeName,
      phone: storeSettings.phone,
      whatsappNumber: storeSettings.whatsappNumber,
      freeDeliveryThresholdCents: storeSettings.freeDeliveryThresholdCents,
      isPrivate: storeSettings.isPrivate,
      maintenanceMode: storeSettings.maintenanceMode,
      maintenanceMessage: storeSettings.maintenanceMessage,
    })
    .from(storeSettings)
    .limit(1);

  return (
    row ?? {
      storeName: "DRPHONE",
      phone: null,
      whatsappNumber: null,
      freeDeliveryThresholdCents: null,
      isPrivate: true,
      maintenanceMode: false,
      maintenanceMessage: null,
    }
  );
}
