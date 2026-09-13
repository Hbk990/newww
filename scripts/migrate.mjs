// Applies only the migrations a database is missing, so running it again is
// harmless. Used for the local preview database and for the live one.
import {spawnSync} from 'node:child_process';

const CONFIG = 'dist/server/wrangler.json', STATE = '.wrangler/state';

// Each migration is paired with a check for something it creates.
const MIGRATIONS = [
  ['drizzle/0000_steep_pretty_boy.sql', db => db.hasTable('products')],
  ['drizzle/0001_empty_dust.sql', db => db.hasColumn('admins', 'recovery_hash')],
  ['drizzle/0002_messy_toxin.sql', db => db.hasTable('bundles')],
];

function runner({remote, database}) {
  const where = remote ? ['--remote'] : ['--local', '--persist-to', STATE];
  const wrangler = (args, opts) => spawnSync(
    process.execPath,
    ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js',
     'd1', 'execute', database, ...where, '--config', CONFIG, ...args],
    {...opts},
  );
  const query = sql => {
    const r = wrangler(['--json', '--command', sql], {stdio: ['ignore', 'pipe', 'pipe']});
    if (r.status !== 0) return null;
    const text = (r.stdout || '').toString();
    try { return JSON.parse(text.slice(text.indexOf('[')))[0].results; } catch { return null; }
  };
  return {
    hasTable: name => {
      const rows = query(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`);
      return Array.isArray(rows) && rows.length > 0;
    },
    hasColumn: (table, column) => {
      const rows = query(`SELECT 1 AS hit FROM pragma_table_info('${table}') WHERE name='${column}'`);
      return Array.isArray(rows) && rows.length > 0;
    },
    apply: file => wrangler(['--file', file], {stdio: ['ignore', 'pipe', 'inherit']}).status === 0,
  };
}

// Returns the number applied, or throws naming the migration that failed.
export function migrate({remote = false, database = 'DB', log = console.log} = {}) {
  const db = runner({remote, database});
  // A remote database we cannot read at all means the CLI is not authenticated or
  // the database name is wrong — say so rather than blaming a migration.
  if (remote && db.hasTable('sqlite_sequence') === null) {
    throw new Error(`Could not reach the "${database}" database. Check the name in cloudflare.json and that you have run \`npx wrangler login\`.`);
  }
  let applied = 0;
  for (const [file, done] of MIGRATIONS) {
    if (done(db)) { log(`already applied: ${file}`); continue; }
    if (!db.apply(file)) throw new Error(`Could not apply ${file}.`);
    log(`applied: ${file}`);
    applied++;
  }
  if (!applied) log('Database was already up to date.');
  return applied;
}
