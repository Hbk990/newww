/** Downloads a reusable snapshot without needing MySQL. Interrupted runs resume.
 * --refresh starts a fresh catalog; an incomplete download never replaces the last complete one. */
import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fetchMakes, fetchModels, sleep, type Make, type Model } from './vpic.js';

const destination = fileURLToPath(new URL('./vpic-catalog.json', import.meta.url));
const checkpoint = `${destination}.partial`;
type Catalog = { source: string; scope: string; fetchedAt: string; complete: boolean;
  makes: (Make & { models?: Model[] })[] };
let catalog: Catalog;
try {
  if (process.argv.includes('--refresh')) throw new Error('refresh');
  catalog = JSON.parse(await readFile(checkpoint, 'utf8'));
  console.log('Resuming the previous download.');
} catch {
  catalog = { source: 'https://vpic.nhtsa.dot.gov/api/', scope: 'US-market cars, trucks and multipurpose passenger vehicles (including SUVs)',
    fetchedAt: new Date().toISOString(), complete: false, makes: await fetchMakes() };
}
if (!catalog.makes.length) throw new Error('No makes received; no catalog saved');
let pendingSave = Promise.resolve();
const save = () => {
  const content = JSON.stringify(catalog, null, 2) + '\n';
  pendingSave = pendingSave.then(async () => {
    await writeFile(`${checkpoint}.tmp`, content);
    await rename(`${checkpoint}.tmp`, checkpoint);
  });
  return pendingSave;
};
await save();
let next = 0;
let completed = catalog.makes.filter(m => m.models !== undefined).length;
const failed: string[] = [];
// Three workers, with a pause between requests, limit load on NHTSA.
await Promise.all(Array.from({ length: 3 }, async () => {
  while (next < catalog.makes.length) {
    const make = catalog.makes[next++];
    if (make.models !== undefined) continue;
    try {
      make.models = await fetchModels(make.vpicId);
      completed++;
    } catch (error) {
      failed.push(make.name);
      console.warn(`${make.name}: ${(error as Error).message}`);
    }
    console.log(`${completed}/${catalog.makes.length}: ${make.name}`);
    // Persist completed makes through one writer so interruptions can resume.
    await save();
    await sleep(350);
  }
}));
await save();
if (failed.length) {
  console.error(`Incomplete: ${failed.length} makes failed. Run again to resume. Last complete snapshot preserved.`);
  process.exitCode = 1;
} else {
  catalog.complete = true;
  catalog.fetchedAt = new Date().toISOString();
  await save();
  await rename(checkpoint, destination);
  console.log(`Saved ${catalog.makes.length} makes and ${catalog.makes.reduce((n,m) => n + m.models!.length, 0)} models.`);
}
