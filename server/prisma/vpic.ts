/**
 * Talking to NHTSA vPIC — the US government's vehicle database.
 *
 * Free, no API key. Manufacturer-reported data for vehicles intended for sale
 * or import into the USA; not a complete worldwide catalog. NHTSA rate-limits
 * traffic. Make/model searches use our saved database, never this service.
 *
 * The fetching logic lives here, apart from the database writing, so it can be
 * tested against recorded responses without touching the network.
 */

const BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles';

/**
 * The vehicle types worth importing. "GetAllMakes" returns about 11,000
 * manufacturers — including trailer, motorcycle and bus builders — and would
 * mean one request per make. These three types cover the cars, pickups and
 * SUVs you actually ship, in a couple of hundred requests instead.
 */
export const VEHICLE_TYPES = ['car', 'truck', 'multipurpose passenger vehicle'] as const;

export interface Make {
  vpicId: number;
  name: string;
}

export interface Model {
  vpicId: number | null;
  name: string;
}

/**
 * vPIC is inconsistent about field names: GetAllMakes returns Make_ID/Make_Name
 * while GetMakesForVehicleType returns MakeId/MakeName. Both shapes are read
 * here so a change on their side cannot silently return nothing.
 */
interface VpicRow {
  Make_ID?: number;
  MakeId?: number;
  Make_Name?: string;
  MakeName?: string;
  Model_ID?: number;
  Model_Name?: string;
}

const makeIdOf = (row: VpicRow) => row.Make_ID ?? row.MakeId ?? null;
const makeNameOf = (row: VpicRow) => row.Make_Name ?? row.MakeName ?? null;

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  /** Wait between retries; kept short in tests. */
  retryDelayMs?: number;
  /** Injected in tests; defaults to the real fetch. */
  fetchImpl?: typeof fetch;
  onProgress?: (message: string) => void;
}

export async function vpicGet(path: string, options: FetchOptions = {}): Promise<VpicRow[]> {
  const { timeoutMs = 25000, retries = 2, retryDelayMs = 1000, fetchImpl = fetch } = options;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchImpl(`${BASE}/${path}?format=json`, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`vPIC responded ${response.status}`);
      const body = (await response.json()) as { Results?: VpicRow[] };
      if (!Array.isArray(body.Results)) throw new Error('vPIC returned an invalid Results payload');
      return body.Results;
    } catch (error) {
      lastError = error as Error;
      // A blocked or unreachable service fails the same way every time, so
      // only wait and retry for what looks transient.
      if (attempt < retries) await sleep(retryDelayMs * (attempt + 1));
    }
  }
  throw lastError ?? new Error('vPIC request failed');
}

/** The makes worth having, de-duplicated across vehicle types. */
export async function fetchMakes(options: FetchOptions = {}): Promise<Make[]> {
  const byId = new Map<number, Make>();

  for (const type of VEHICLE_TYPES) {
    const rows = await vpicGet(`GetMakesForVehicleType/${encodeURIComponent(type)}`, options);
    for (const row of rows) {
      const id = makeIdOf(row);
      const name = makeNameOf(row);
      if (id === null || !name) continue;
      // A brand appears under several types (Ford makes cars and trucks).
      if (!byId.has(id)) byId.set(id, { vpicId: id, name: titleCase(name) });
    }
    options.onProgress?.(`  ${type}: ${rows.length} makes`);
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Every make vPIC knows, including trailer and bus builders. Rarely wanted. */
export async function fetchAllMakes(options: FetchOptions = {}): Promise<Make[]> {
  const rows = await vpicGet('GetAllMakes', options);
  const byId = new Map<number, Make>();
  for (const row of rows) {
    const id = makeIdOf(row);
    const name = makeNameOf(row);
    if (id === null || !name || byId.has(id)) continue;
    byId.set(id, { vpicId: id, name: titleCase(name) });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchModels(makeId: number, options: FetchOptions = {}): Promise<Model[]> {
  const rows = await vpicGet(`GetModelsForMakeId/${makeId}`, options);
  const seen = new Set<string>();
  const models: Model[] = [];
  for (const row of rows) {
    const name = (row.Model_Name ?? '').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    models.push({ vpicId: row.Model_ID ?? null, name });
  }
  return models.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Brands that are written in capitals rather than as a word. Length alone
 * cannot tell them apart — BMW and KIA are both three letters, but one is an
 * acronym and the other is a name — so the acronyms are listed explicitly.
 */
const CAPITALISED_BRANDS = new Set([
  'BMW', 'GMC', 'MG', 'DS', 'KTM', 'BYD', 'VW', 'RAM', 'MINI', 'FIAT',
  'SRT', 'AMG', 'MAN', 'TVR', 'SEAT', 'FAW', 'GAC', 'SAIC', 'JAC',
]);

/** "MERCEDES-BENZ" -> "Mercedes-Benz", "KIA" -> "Kia", "BMW" stays "BMW". */
export function titleCase(value: string): string {
  return value
    .trim()
    .split(/(\s|-)/)
    .map((part) => {
      if (part === ' ' || part === '-') return part;
      if (CAPITALISED_BRANDS.has(part.toUpperCase())) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
