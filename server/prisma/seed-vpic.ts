/**
 * Loads car makes and models into MySQL so the brand/model search works with
 * no internet.
 *
 *   npm run seed:vpic          -> full official list from NHTSA vPIC
 *   npm run seed:vpic -- --offline  -> bundled fallback list only
 *
 * NHTSA vPIC is the US government's vehicle database: free, no API key, and it
 * covers every make and model sold in the USA and Canada. If it cannot be
 * reached the bundled list is used instead, so the system is never blocked —
 * and a model that is in neither can always be typed in by hand.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { prisma } from '../src/lib/db.js';

const VPIC = 'https://vpic.nhtsa.dot.gov/api/vehicles';
const TIMEOUT_MS = 20000;
const here = dirname(fileURLToPath(import.meta.url));

const offlineOnly = process.argv.includes('--offline');

interface VpicRow {
  Make_ID?: number;
  Make_Name?: string;
  Model_ID?: number;
  Model_Name?: string;
}

async function vpicGet(path: string): Promise<VpicRow[]> {
  const response = await fetch(`${VPIC}/${path}?format=json`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`vPIC responded ${response.status}`);
  const body = (await response.json()) as { Results?: VpicRow[] };
  return body.Results ?? [];
}

async function seedFromVpic(): Promise<boolean> {
  console.log('Fetching the make list from NHTSA vPIC...');
  const makes = await vpicGet('getallmakes');
  if (makes.length === 0) throw new Error('vPIC returned no makes');
  console.log(`  ${makes.length} makes.`);

  let modelCount = 0;
  for (const [index, make] of makes.entries()) {
    const name = titleCase(make.Make_Name ?? '');
    if (!name) continue;

    const record = await prisma.carMake.upsert({
      where: { name },
      create: { name, vpicId: make.Make_ID ?? null },
      update: { vpicId: make.Make_ID ?? null },
    });

    try {
      const models = await vpicGet(`getmodelsformakeid/${make.Make_ID}`);
      for (const model of models) {
        const modelName = (model.Model_Name ?? '').trim();
        if (!modelName) continue;
        await prisma.carModel.upsert({
          where: { makeId_name: { makeId: record.id, name: modelName } },
          create: { makeId: record.id, name: modelName, vpicId: model.Model_ID ?? null },
          update: {},
        });
        modelCount++;
      }
    } catch {
      console.warn(`  Could not fetch models for ${name} — skipping that brand's models.`);
    }

    if ((index + 1) % 25 === 0) console.log(`  ${index + 1}/${makes.length} makes done...`);
  }

  console.log(`Done: ${makes.length} makes, ${modelCount} models from vPIC.`);
  return true;
}

async function seedFromFallback() {
  const raw = await readFile(join(here, 'vpic-fallback.json'), 'utf8');
  const data = JSON.parse(raw) as { makes: Record<string, string[]> };
  let models = 0;

  for (const [makeName, modelNames] of Object.entries(data.makes)) {
    const make = await prisma.carMake.upsert({
      where: { name: makeName },
      create: { name: makeName },
      update: {},
    });
    for (const name of modelNames) {
      await prisma.carModel.upsert({
        where: { makeId_name: { makeId: make.id, name } },
        create: { makeId: make.id, name },
        update: {},
      });
      models++;
    }
  }

  console.log(`Done: ${Object.keys(data.makes).length} makes, ${models} models from the bundled list.`);
  console.log('Run this again from a machine with internet to load the full official list.');
}

const titleCase = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .split(/[\s-]+/)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()))
    .join(' ');

try {
  if (offlineOnly) {
    await seedFromFallback();
  } else {
    try {
      await seedFromVpic();
    } catch (error) {
      console.warn(`Could not reach NHTSA vPIC (${(error as Error).message}).`);
      console.warn('Falling back to the bundled list so the system still works.');
      await seedFromFallback();
    }
  }
} finally {
  await prisma.$disconnect();
}
