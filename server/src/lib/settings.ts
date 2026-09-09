import { prisma } from './db.js';

/**
 * System settings, stored in the database so they can be changed from the
 * Settings screen without a redeploy.
 */
export const SETTING_DEFAULTS = {
  /** XOF (West Africa) or XAF (Central Africa). Shown next to every local amount. */
  cfaCode: 'XOF',
  /** Canada: tax up to this amount enters the car's cost; the excess is refundable. */
  taxThresholdUsd: '500',
  businessName: 'Car Showroom',
  /** Where money from a car sale lands. Empty until an account is chosen. */
  defaultCashAccountId: '',
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

let cache: Record<string, string> | null = null;

export async function getSettings(): Promise<Record<SettingKey, string>> {
  if (!cache) {
    const rows = await prisma.setting.findMany();
    cache = { ...SETTING_DEFAULTS };
    for (const row of rows) cache[row.key] = row.value;
  }
  return cache as Record<SettingKey, string>;
}

export async function getSetting(key: SettingKey): Promise<string> {
  return (await getSettings())[key];
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  cache = null;
}

/** The currency code used for every local amount. */
export const cfaCode = () => getSetting('cfaCode');

/** The Canada tax threshold, as a number for the money engine. */
export const taxThreshold = async () => Number(await getSetting('taxThresholdUsd'));
