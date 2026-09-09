import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { checkVin, yearFromVin } from '../lib/vin.js';

/**
 * Make/model lookup. The data lives in our own MySQL (seeded from NHTSA vPIC),
 * so typing "m" and getting Mercedes-Benz, Mazda, Mitsubishi works with no
 * internet at all. VIN decoding is the only part that reaches outside, and it
 * is optional — you can always type the details in by hand.
 */
export async function vehicleRoutes(app: FastifyInstance) {
  /** Type "m" -> every make containing m, best matches (prefix) first. */
  app.get('/api/vehicles/makes', async (request) => {
    const { q, limit } = z
      .object({ q: z.string().optional(), limit: z.coerce.number().max(100).default(30) })
      .parse(request.query);

    const makes = await prisma.carMake.findMany({
      where: q ? { name: { contains: q } } : {},
      orderBy: { name: 'asc' },
      take: 300,
    });

    if (!q) return makes.slice(0, limit);
    const needle = q.toLowerCase();
    return makes
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(needle) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(needle) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name);
      })
      .slice(0, limit);
  });

  app.get('/api/vehicles/models', async (request) => {
    const { makeId, makeName, q, limit } = z
      .object({
        makeId: z.coerce.number().optional(),
        makeName: z.string().optional(),
        q: z.string().optional(),
        limit: z.coerce.number().max(200).default(50),
      })
      .parse(request.query);

    if (!makeId && !makeName) return [];
    const models = await prisma.carModel.findMany({
      where: {
        ...(makeId ? { makeId } : { make: { name: makeName } }),
        ...(q ? { name: { contains: q } } : {}),
      },
      orderBy: { name: 'asc' },
      take: limit,
    });
    return models;
  });

  /** Years, newest first — the newest cars are the ones usually entered. */
  app.get('/api/vehicles/years', async () => {
    const max = new Date().getFullYear() + 1;
    return Array.from({ length: max - 1989 }, (_, i) => max - i);
  });

  /**
   * Checks a VIN and, when the internet is available, fills in make/model/year
   * from NHTSA. A failed lookup is never an error — it just returns what the
   * VIN itself encodes so you can type the rest.
   */
  app.get('/api/vehicles/vin/:vin', async (request) => {
    const { vin } = z.object({ vin: z.string() }).parse(request.params);
    const check = checkVin(vin);

    const duplicate = check.wellFormed
      ? await prisma.car.findUnique({
          where: { vin: check.normalized },
          select: { id: true, makeName: true, modelName: true, year: true, status: true },
        })
      : null;

    const result = {
      ...check,
      duplicate,
      decoded: null as null | { makeName?: string; modelName?: string; year?: number },
      decodeSource: 'none' as 'none' | 'vin' | 'nhtsa',
      decodeError: null as string | null,
    };

    const yearGuess = yearFromVin(vin);
    if (yearGuess) {
      result.decoded = { year: yearGuess };
      result.decodeSource = 'vin';
    }
    if (!check.wellFormed) return result;

    try {
      const response = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${check.normalized}?format=json`,
        { signal: AbortSignal.timeout(6000) },
      );
      if (response.ok) {
        const body = (await response.json()) as { Results?: Record<string, string>[] };
        const row = body.Results?.[0];
        if (row?.Make) {
          result.decoded = {
            makeName: titleCase(row.Make),
            modelName: row.Model || undefined,
            year: row.ModelYear ? Number(row.ModelYear) : yearGuess ?? undefined,
          };
          result.decodeSource = 'nhtsa';
        }
      }
    } catch {
      // Offline or the service is down — the year from the VIN still stands.
      result.decodeError = 'Could not reach the VIN service. Enter the details by hand.';
    }

    return result;
  });
}

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(' ')
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()))
    .join(' ');
