// One-command local setup that works on Windows, macOS and Linux: install
// dependencies, build, and create the local database.
//
//   npm run setup
//
// `npm run install:ci` is the hosting platform's installer — a bash script that
// needs flock and GNU timeout, so it cannot run on Windows. This does the same
// job with plain Node and pnpm.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';

const win = process.platform === 'win32';
const CONFIG = 'dist/server/wrangler.json', STATE = '.wrangler/state';
const step = m => console.log('\n== ' + m);
const fail = (...lines) => { console.error('\nSetup stopped.\n' + lines.join('\n') + '\n'); process.exit(1); };

const node = (args, opts = {}) => spawnSync(process.execPath, args, {stdio: 'inherit', ...opts});
const wrangler = (args, opts = {}) =>
  node(['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js', ...args], opts);

// 1. Node version
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  fail(`This project needs Node 22.13 or newer. You have ${process.versions.node}.`,
       'Install the LTS build from https://nodejs.org, then run this again.');
}
if (!existsSync('package.json')) {
  fail('Run this from inside the project folder — the one containing package.json.');
}

// 2. pnpm, at the version package.json pins
step('Checking pnpm');
const probe = cmd => {
  const r = spawnSync(cmd[0], [...cmd.slice(1), '--version'], {encoding: 'utf8', shell: win});
  return r.status === 0 ? (r.stdout || '').trim().split('\n').pop().trim() : null;
};
let pnpm = null;
if (probe(['corepack', 'pnpm']) === '11.25.0') pnpm = ['corepack', 'pnpm'];
else if (probe(['pnpm']) === '11.25.0') pnpm = ['pnpm'];
if (!pnpm) {
  fail('Could not find pnpm 11.25.0.', 'Run this once, then try again:', '', '    npm install -g pnpm@11.25.0', '');
}
console.log('Using: ' + pnpm.join(' '));

// 3. Dependencies
step('Installing dependencies (a few minutes the first time)');
if (spawnSync(pnpm[0], [...pnpm.slice(1), 'install', '--frozen-lockfile'], {stdio: 'inherit', shell: win}).status !== 0) {
  fail('Dependency install failed.',
       'If the error mentions the network, check your connection and run `npm run setup` again.');
}

// 4. Build
step('Building');
if (node(['scripts/run-framework.mjs', 'build']).status !== 0) {
  fail('Build failed. Copy the error above and send it over.');
}
if (!existsSync(CONFIG)) {
  fail(`The build did not produce ${CONFIG}. Copy the output above and send it over.`);
}

// 5. Database — apply only the migrations this database is missing, so running
// setup again is harmless.
step('Preparing the local database');
function query(sql) {
  const r = wrangler(['d1', 'execute', 'DB', '--local', '--config', CONFIG, '--persist-to', STATE, '--json', '--command', sql],
                     {stdio: ['ignore', 'pipe', 'pipe']});
  if (r.status !== 0) return null;
  const text = (r.stdout || '').toString();
  try { return JSON.parse(text.slice(text.indexOf('[')))[0].results; } catch { return null; }
}
const hasTable = name => {
  const rows = query(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`);
  return Array.isArray(rows) && rows.length > 0;
};
const hasColumn = (table, column) => {
  const rows = query(`SELECT 1 AS hit FROM pragma_table_info('${table}') WHERE name='${column}'`);
  return Array.isArray(rows) && rows.length > 0;
};

const migrations = [
  ['drizzle/0000_steep_pretty_boy.sql', () => hasTable('products')],
  ['drizzle/0001_empty_dust.sql', () => hasColumn('admins', 'recovery_hash')],
  ['drizzle/0002_messy_toxin.sql', () => hasTable('bundles')],
];
let applied = 0;
for (const [file, done] of migrations) {
  if (done()) { console.log(`already applied: ${file}`); continue; }
  if (wrangler(['d1', 'execute', 'DB', '--local', '--config', CONFIG, '--persist-to', STATE, '--file', file],
               {stdio: ['ignore', 'pipe', 'inherit']}).status !== 0) {
    fail(`Could not apply ${file}.`, 'Delete the .wrangler folder and run `npm run setup` again.');
  }
  console.log(`applied: ${file}`);
  applied++;
}
if (!applied) console.log('Database was already set up.');

console.log(`
Ready.

Next:

    npm run demo     fill the shop with demo products (optional)
    npm start        start the site

Then open http://127.0.0.1:8787 and, to create your admin login,
http://127.0.0.1:8787/admin
`);
