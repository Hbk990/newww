import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { deviceBrands, deviceModels } from "@/db/schema";

export type DeviceChoice = {
  id: string;
  model: string;
  brand: string;
};

/**
 * Every device a customer can claim to own, brand then model.
 *
 * A plain module rather than a `"use server"` one: this is read by a page, not
 * called from the browser, and it is shared by the account screen and whatever
 * fitment picker the storefront grows later.
 */
export async function loadDevicePicker(): Promise<DeviceChoice[]> {
  return db
    .select({
      id: deviceModels.id,
      model: deviceModels.name,
      brand: deviceBrands.name,
    })
    .from(deviceModels)
    .innerJoin(deviceBrands, eq(deviceBrands.id, deviceModels.deviceBrandId))
    .orderBy(asc(deviceBrands.name), asc(deviceModels.name));
}
