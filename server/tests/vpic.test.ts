/**
 * The car-brand source (NHTSA vPIC) cannot be called from the test machine, so
 * its responses are replayed here in the exact shapes the service returns —
 * including the inconsistent field naming between its two make endpoints,
 * which is the thing most likely to silently return an empty list.
 */
import { describe, it, expect, vi } from 'vitest';
import { fetchAllMakes, fetchMakes, fetchModels, titleCase, vpicGet } from '../prisma/vpic.js';

const respond = (results: unknown[]) =>
  ({ ok: true, status: 200, json: async () => ({ Count: results.length, Results: results }) }) as Response;

/** Answers each URL from a map, and records what was asked for. */
function mockApi(routes: Record<string, unknown[]>) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL) => {
    const href = String(url);
    calls.push(href);
    const match = Object.keys(routes).find((key) => href.includes(key));
    if (!match) throw new Error(`unexpected request: ${href}`);
    return respond(routes[match]);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('reading the brand list', () => {
  it('reads the MakeId/MakeName shape that the vehicle-type endpoint returns', async () => {
    const { fetchImpl } = mockApi({
      'GetMakesForVehicleType/car': [
        { MakeId: 452, MakeName: 'MERCEDES-BENZ', VehicleTypeName: 'Passenger Car' },
        { MakeId: 448, MakeName: 'TOYOTA', VehicleTypeName: 'Passenger Car' },
      ],
      'GetMakesForVehicleType/truck': [{ MakeId: 460, MakeName: 'FORD', VehicleTypeName: 'Truck' }],
      'GetMakesForVehicleType/multipurpose': [
        { MakeId: 448, MakeName: 'TOYOTA', VehicleTypeName: 'MPV' },
      ],
    });

    const makes = await fetchMakes({ fetchImpl });
    expect(makes.map((m) => m.name)).toEqual(['Ford', 'Mercedes-Benz', 'Toyota']);
  });

  it('counts a brand once even when it appears under several vehicle types', async () => {
    const { fetchImpl } = mockApi({
      'GetMakesForVehicleType/car': [{ MakeId: 448, MakeName: 'TOYOTA' }],
      'GetMakesForVehicleType/truck': [{ MakeId: 448, MakeName: 'TOYOTA' }],
      'GetMakesForVehicleType/multipurpose': [{ MakeId: 448, MakeName: 'TOYOTA' }],
    });
    const makes = await fetchMakes({ fetchImpl });
    expect(makes).toHaveLength(1);
  });

  it('asks only for road vehicles, not all 11,000 manufacturers', async () => {
    const { fetchImpl, calls } = mockApi({
      'GetMakesForVehicleType/car': [{ MakeId: 1, MakeName: 'A' }],
      'GetMakesForVehicleType/truck': [],
      'GetMakesForVehicleType/multipurpose': [],
    });
    await fetchMakes({ fetchImpl });
    expect(calls).toHaveLength(3);
    expect(calls.some((c) => c.includes('GetAllMakes'))).toBe(false);
  });

  it('also reads the Make_ID/Make_Name shape of the full list', async () => {
    const { fetchImpl } = mockApi({
      GetAllMakes: [
        { Make_ID: 452, Make_Name: 'MERCEDES-BENZ' },
        { Make_ID: 999, Make_Name: 'WABASH TRAILER' },
      ],
    });
    const makes = await fetchAllMakes({ fetchImpl });
    expect(makes.map((m) => m.name)).toEqual(['Mercedes-Benz', 'Wabash Trailer']);
  });

  it('skips rows with a missing name instead of saving a blank brand', async () => {
    const { fetchImpl } = mockApi({
      'GetMakesForVehicleType/car': [{ MakeId: 1, MakeName: '' }, { MakeId: 2, MakeName: 'KIA' }],
      'GetMakesForVehicleType/truck': [],
      'GetMakesForVehicleType/multipurpose': [],
    });
    expect((await fetchMakes({ fetchImpl })).map((m) => m.name)).toEqual(['Kia']);
  });
});

describe('reading the model list', () => {
  it('keeps each model once, in order', async () => {
    const { fetchImpl } = mockApi({
      'GetModelsForMakeId/452': [
        { Make_ID: 452, Model_ID: 1861, Model_Name: 'CLA 300' },
        { Make_ID: 452, Model_ID: 1862, Model_Name: 'C 300' },
        { Make_ID: 452, Model_ID: 1863, Model_Name: 'cla 300' }, // same model, different case
      ],
    });
    const models = await fetchModels(452, { fetchImpl });
    expect(models.map((m) => m.name)).toEqual(['C 300', 'CLA 300']);
  });
});

describe('brand names', () => {
  it('makes SHOUTING names readable without ruining the short ones', () => {
    expect(titleCase('MERCEDES-BENZ')).toBe('Mercedes-Benz');
    expect(titleCase('ASTON MARTIN')).toBe('Aston Martin');
    expect(titleCase('BMW')).toBe('BMW');
    expect(titleCase('GMC')).toBe('GMC');
    expect(titleCase('RAM')).toBe('RAM');
    expect(titleCase('LAND ROVER')).toBe('Land Rover');
    expect(titleCase('ROLLS-ROYCE')).toBe('Rolls-Royce');
    // A three-letter name is not automatically an acronym.
    expect(titleCase('KIA')).toBe('Kia');
    expect(titleCase('MERCEDES-AMG')).toBe('Mercedes-AMG');
  });
});

describe('when the service misbehaves', () => {
  it('retries a request that fails once, then succeeds', async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw new Error('network hiccup');
      return respond([{ Make_ID: 1, Make_Name: 'KIA' }]);
    }) as unknown as typeof fetch;

    const rows = await vpicGet('GetAllMakes', { fetchImpl, retryDelayMs: 1 });
    expect(attempts).toBe(2);
    expect(rows).toHaveLength(1);
  });

  it('gives up with a clear message when the service is blocked', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403 }) as Response) as unknown as typeof fetch;
    await expect(vpicGet('GetAllMakes', { fetchImpl, retries: 1, retryDelayMs: 1 })).rejects.toThrow(
      /403/,
    );
  });

  it('treats an empty Results array as no data rather than crashing', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response) as unknown as typeof fetch;
    expect(await vpicGet('GetAllMakes', { fetchImpl })).toEqual([]);
  });
});
