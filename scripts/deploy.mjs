// Publishes the shop to your own Cloudflare account.
//
//   npm run deploy
//
// One-time setup first — see DEPLOY.md:
//   npx wrangler login
//   npx wrangler d1 create <name>          copy the id it prints
//   npx wrangler r2 bucket create <bucket>
//   fill in cloudflare.json
import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';

const CONFIG = 'dist/server/wrangler.json';
const step = m => console.log('\n== ' + m);
const fail = (...lines) => { console.error('\nDeploy stopped.\n' + lines.join('\n') + '\n'); process.exit(1); };
const node = (args, opts = {}) => spawnSync(process.execPath, args, {stdio: 'inherit', ...opts});
const wrangler = (args, opts = {}) =>
  node(['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js', ...args], opts);

if (!existsSync('package.json')) fail('Run this from inside the project folder.');
if (!existsSync('node_modules')) fail('Dependencies are missing. Run `npm run setup` first.');

// 1. Target
let target;
try { target = JSON.parse(readFileSync('cloudflare.json', 'utf8')); }
catch { fail('cloudflare.json is missing or is not valid JSON.', 'See DEPLOY.md.'); }

const database = target.d1?.name?.trim();
const databaseId = target.d1?.id?.trim();
const bucket = target.r2?.bucket?.trim();
const workerName = target.workerName?.trim();
const missing = [
  !workerName && 'workerName',
  !database && 'd1.name',
  !databaseId && 'd1.id',
  !bucket && 'r2.bucket',
].filter(Boolean);
if (missing.length) {
  fail(`cloudflare.json still needs: ${missing.join(', ')}.`,
       '',
       'Run these, then paste the values in:',
       '',
       '    npx wrangler login',
       `    npx wrangler d1 create ${database || 'huqa'}`,
       `    npx wrangler r2 bucket create ${bucket || 'huqa-images'}`,
       '',
       '`d1 create` prints a database_id — that is the "id" field.');
}
console.log(`Worker   ${workerName}\nDatabase ${database}\nBucket   ${bucket}`);

// 2. Build, so wrangler.json carries the real ids
step('Building');
if (node(['scripts/run-framework.mjs', 'build']).status !== 0) fail('Build failed.');
if (!existsSync(CONFIG)) fail(`The build did not produce ${CONFIG}.`);
const built = JSON.parse(readFileSync(CONFIG, 'utf8'));
const builtId = built.d1_databases?.[0]?.database_id;
if (builtId !== databaseId) {
  fail(`The build wrote database id ${builtId} instead of ${databaseId}.`,
       'Delete the dist folder and run `npm run deploy` again.');
}

// 3. Migrations on the live database, before the new code goes out
step('Applying migrations to the live database');
const {migrate} = await import('./migrate.mjs');
try { migrate({remote: true, database}); }
catch (e) { fail(e.message, '', 'Nothing was deployed; the site is untouched.'); }

// 4. Publish
step('Publishing');
if (wrangler(['deploy', '--config', CONFIG]).status !== 0) {
  fail('Publishing failed. The error above is from Cloudflare.');
}

console.log(`
Published.

If this was the first deploy:

  1. Attach your domain in the Cloudflare dashboard —
     Workers & Pages > ${workerName} > Settings > Domains & Routes > Add custom domain.
  2. Open https://<your-domain>/admin and create your username and password.
     Save the recovery code; it is shown once.
  3. In the admin sidebar open Storefront, set the WhatsApp number and delivery
     fee, then switch the shop live.

Deploy again any time with \`npm run deploy\`.
`);
