/**
 * Loads car makes and models into MySQL so the brand/model search works with
 * no internet afterwards.
 *
 *   npm run seed:vpic              cars, pickups and SUVs from NHTSA (recommended)
 *   npm run seed:vpic -- --all     every manufacturer vPIC knows, trailers included
 *   npm run seed:vpic -- --offline the bundled list, no internet needed
 *
 * NHTSA vPIC is the US government's vehicle database: free, no API key, no
 * account. If it cannot be reached the bundled list is used instead, so the
 * system is never blocked — and a model in neither can always be typed by hand.
 *
 * Safe to run again at any time: it only adds what is missing.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { prisma } from '../src/lib/db.js';
import { fetchAllMakes, fetchMakes, fetchModels, sleep } from './vpic.js';

const here = dirname(fileURLToPath(import.meta.url));
const offlineOnly = process.argv.includes('--offline');
const everything = process.argv.includes('--all');

async function seedFromVpic() {
  console.log('Asking NHTSA vPIC for the makes...');

  const makes = everything
    ? await fetchAllMakes({ onProgress: (m) => console.log(m) })
    : await fetchMakes({ onProgress: (m) => console.log(m) });

  if (makes.length === 0) throw new Error('vPIC returned no makes');
  console.log(`\n${makes.length} makes. Fetching their models — this takes a few minutes.\n`);

  let modelCount = 0;
  let failed = 0;

  for (const [index, make] of makes.entries()) {
    const record = await prisma.carMake.upsert({
      where: { name: make.name },
      create: { name: make.name, vpicId: make.vpicId },
      update: { vpicId: make.vpicId },
    });

    try {
      const models = await fetchModels(make.vpicId);
      for (const model of models) {
        await prisma.carModel.upsert({
          where: { makeId_name: { makeId: record.id, name: model.name } },
          create: { makeId: record.id, name: model.name, vpicId: model.vpicId },
          update: {},
        });
        modelCount++;
      }
    } catch {
      // One brand failing is not worth losing the whole run over — the brand
      // is still saved, and its models can be typed in by hand.
      failed++;
      console.warn(`  could not fetch models for ${make.name}`);
    }

    const done = index + 1;
    if (done % 10 === 0 || done === makes.length) {
      const percent = Math.round((done / makes.length) * 100);
      console.log(`  ${done}/${makes.length} makes (${percent}%) — ${modelCount} models so far`);
    }
    await sleep(60); // gentle on a free public service
  }

  console.log(`\nDone: ${makes.length} makes, ${modelCount} models from NHTSA vPIC.`);
  if (failed > 0) console.log(`${failed} make(s) had no models — run this again to retry them.`);
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
  console.log('Run this again from a machine with internet for the full official list.');
}

try {
  if (offlineOnly) {
    await seedFromFallback();
  } else {
    try {
      await seedFromVpic();
    } catch (error) {
      console.warn(`\nCould not reach NHTSA vPIC (${(error as Error).message}).`);
      console.warn('Check https://vpic.nhtsa.dot.gov/api/ opens in your browser.');
      console.warn('Using the bundled list for now so the system still works.\n');
      await seedFromFallback();
    }
  }

  const [makes, models] = await Promise.all([prisma.carMake.count(), prisma.carModel.count()]);
  console.log(`\nThe database now holds ${makes} makes and ${models} models.`);
} finally {
  await prisma.$disconnect();
}
