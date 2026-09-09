/** Local reference catalog. Default: load the bundled full snapshot once.
 * --refresh fetches updates; --offline uses the snapshot (or small fallback).
 * --all explicitly includes all vPIC manufacturer types. Never runs at startup. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/lib/db.js';
import dotenv from 'dotenv';
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
import { fetchAllMakes, fetchMakes, fetchModels, sleep, type Make, type Model } from './vpic.js';

const offline = process.argv.includes('--offline');
const refresh = process.argv.includes('--refresh');
const all = process.argv.includes('--all');
const statusKey = all ? 'vehicleCatalogAllStatus' : 'vehicleCatalogStatus';
type Row = Make & { models: Model[] };
async function saveMake(make: Make, models: Model[]) {
  const existing = await prisma.carMake.findUnique({ where: { vpicId: make.vpicId } });
  const record = existing ?? await prisma.carMake.upsert({ where: { name: make.name },
    create: { name: make.name, vpicId: make.vpicId }, update: { vpicId: make.vpicId } });
  await prisma.$transaction(models.map(model => prisma.carModel.upsert({
    where: { makeId_name: { makeId: record.id, name: model.name } },
    create: { makeId: record.id, name: model.name, vpicId: model.vpicId },
    update: { vpicId: model.vpicId },
  })));
}
async function setStatus(value: object) {
  await prisma.setting.upsert({ where: { key: statusKey }, create: { key: statusKey, value: JSON.stringify(value) },
    update: { value: JSON.stringify(value) } });
}
async function importSnapshot(): Promise<boolean> {
  let raw: string;
  try { raw = await readFile(fileURLToPath(new URL('./vpic-catalog.json', import.meta.url)), 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  const data = JSON.parse(raw) as { complete: boolean; fetchedAt: string; scope: string; makes: Row[] };
  if (!data.complete || !data.makes.length || data.makes.some(m => !Array.isArray(m.models)))
    throw new Error('The bundled catalog is incomplete. Download a complete snapshot before importing it.');
  for (const make of data.makes) await saveMake(make, make.models);
  await setStatus({ complete: true, source: 'bundled-vpic-snapshot', fetchedAt: data.fetchedAt,
    importedAt: new Date().toISOString(), scope: data.scope });
  console.log(`Imported saved catalog: ${data.makes.length} makes. No external requests.`);
  return true;
}
async function fallback() {
  const data = JSON.parse(await readFile(fileURLToPath(new URL('./vpic-fallback.json', import.meta.url)), 'utf8')) as { makes: Record<string,string[]> };
  for (const [name, models] of Object.entries(data.makes)) {
    const make = await prisma.carMake.upsert({ where: { name }, create: { name }, update: {} });
    for (const model of models) await prisma.carModel.upsert({ where: { makeId_name: { makeId: make.id, name: model } },
      create: { makeId: make.id, name: model }, update: {} });
  }
  await setStatus({ complete: false, source: 'small-fallback', importedAt: new Date().toISOString() });
  console.warn('Only the small fallback catalog was imported. Use --refresh to fetch the official catalog.');
}
async function online() {
  if (refresh) {
    await setStatus({ complete: false, source: 'vpic', importedAt: new Date().toISOString() });
    const key = all ? 'vehicleCatalogAllProgress' : 'vehicleCatalogProgress';
    await prisma.setting.deleteMany({ where: { key } });
  }
  const options = { onProgress: (m: string) => console.log(m) };
  const makes = all ? await fetchAllMakes(options) : await fetchMakes(options);
  if (!makes.length) throw new Error('No makes returned');
  const failed: string[] = [];
  const progressKey = all ? 'vehicleCatalogAllProgress' : 'vehicleCatalogProgress';
  const previous = await prisma.setting.findUnique({ where: { key: progressKey } });
  const done = new Set<number>(!refresh && previous ? JSON.parse(previous.value) : []);
  for (const make of makes) {
    if (done.has(make.vpicId)) continue;
    let models: Model[];
    try { models = await fetchModels(make.vpicId); }
    catch (error) { failed.push(make.name); console.warn(`${make.name}: ${(error as Error).message}`); continue; }
    await saveMake(make, models); // Database failures must not masquerade as service outages.
    done.add(make.vpicId);
    await prisma.setting.upsert({ where: { key: progressKey }, create: { key: progressKey, value: JSON.stringify([...done]) },
      update: { value: JSON.stringify([...done]) } });
    console.log(`${done.size}/${makes.length}: ${make.name}, ${models.length} models`);
    await sleep(200);
  }
  await setStatus({ complete: failed.length === 0, source: 'vpic', importedAt: new Date().toISOString(), failed });
  if (failed.length) throw new Error(`${failed.length} makes incomplete. Run again without --refresh to resume.`);
  await prisma.setting.deleteMany({ where: { key: progressKey } });
}
try {
  const statusRow = await prisma.setting.findUnique({ where: { key: statusKey } });
  const status = statusRow ? JSON.parse(statusRow.value) : null;
  if (status?.complete && !refresh) console.log('Catalog already imported. Database lookup needs no internet. Use --refresh only when you want updates.');
  else if (!offline && !refresh && status?.source === 'vpic' && !status.complete) await online();
  else if (!refresh && !all && await importSnapshot()) { /* local import complete */ }
  else if (offline) await fallback();
  else await online();
  console.log(`${await prisma.carMake.count()} makes and ${await prisma.carModel.count()} models stored locally.`);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
