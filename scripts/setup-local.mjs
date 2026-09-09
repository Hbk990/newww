#!/usr/bin/env node
/**
 * One command to get the system running on your own machine for testing.
 *
 *   npm run setup
 *
 * It creates the database, builds the tables, loads the car brands, loads the
 * practice data, and creates your login. It is safe to run again — it only
 * fills in whatever is missing.
 *
 * Options:
 *   --db "mysql://user:password@127.0.0.1:3306/carshowroom"   database to use
 *   --user NAME --password PASS                               the login to create
 *   --no-demo                                                 skip the practice data
 *   --fresh                                                   ERASE and start over
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const serverDir = join(root, 'server');
const envPath = join(serverDir, '.env');
const require = createRequire(join(serverDir, 'package.json'));

const argv = process.argv.slice(2);
const flag = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
};
const has = (name) => argv.includes(`--${name}`);

const say = (message) => console.log(message);
const step = (message) => console.log(`\n\x1b[1m${message}\x1b[0m`);
const ok = (message) => console.log(`  \x1b[32m✓\x1b[0m ${message}`);
const warn = (message) => console.log(`  \x1b[33m!\x1b[0m ${message}`);
const fail = (message) => {
  console.error(`\n\x1b[31m✗ ${message}\x1b[0m\n`);
  process.exit(1);
};

/** Never print a database password to the screen or a log. */
const redact = (url) => url.replace(/\/\/([^:]+):[^@]*@/, '//$1:****@');

const run = (command, args, cwd = serverDir, env = {}) =>
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
  });

// ---------------------------------------------------------------------------

say('\n  Car Showroom — local setup\n  ──────────────────────────');

const major = Number(process.versions.node.split('.')[0]);
if (major < 20) fail(`Node 20 or newer is needed. You have ${process.versions.node}.`);

// --- 1. The .env file -------------------------------------------------------

step('1. Configuration');

let databaseUrl = flag('db');

if (existsSync(envPath)) {
  const existing = readFileSync(envPath, 'utf8');
  const match = existing.match(/^DATABASE_URL="?([^"\n]+)"?/m);
  if (match && !databaseUrl) {
    databaseUrl = match[1];
    ok(`Using the database already configured in server/.env`);
  }
}

if (!databaseUrl) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  say('  Where is your MySQL? Press Enter to accept the suggestion.');
  const host = (await rl.question('  Host [127.0.0.1]: ')) || '127.0.0.1';
  const port = (await rl.question('  Port [3306]: ')) || '3306';
  const dbUser = (await rl.question('  MySQL username [root]: ')) || 'root';
  const dbPassword = await rl.question('  MySQL password (blank if none): ');
  const dbName = (await rl.question('  Database name [carshowroom]: ')) || 'carshowroom';
  await rl.close();
  databaseUrl = `mysql://${dbUser}:${encodeURIComponent(dbPassword)}@${host}:${port}/${dbName}`;
}

if (!existsSync(envPath)) {
  writeFileSync(
    envPath,
    [
      '# Local testing configuration. Never commit this file.',
      `DATABASE_URL="${databaseUrl}"`,
      `SESSION_SECRET="${randomBytes(32).toString('hex')}"`,
      'PORT=4000',
      'NODE_ENV=development',
      '',
    ].join('\n'),
  );
  ok('Created server/.env with a fresh session secret');
} else {
  // A run that failed at the database step still wrote this file. If you are
  // now pointing at a different database — a different port, say, because
  // something else was already using 3306 — the file has to follow, or setup
  // would succeed here and the app would fail to connect afterwards.
  const existing = readFileSync(envPath, 'utf8');
  const current = existing.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
  if (current && current !== databaseUrl) {
    writeFileSync(
      envPath,
      existing.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${databaseUrl}"`),
    );
    warn('server/.env pointed at a different database — updated it to the one you gave.');
    say(`    was: ${redact(current)}`);
    say(`    now: ${redact(databaseUrl)}`);
  } else {
    ok('server/.env already exists — leaving it alone');
  }
}

// --- 2. The database --------------------------------------------------------

step('2. Database');

const url = new URL(databaseUrl);
const dbName = url.pathname.replace(/^\//, '');
const connection = {
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
};

let mysql;
try {
  mysql = require('mysql2/promise');
} catch {
  fail('Run "npm install" in this folder first.');
}

let db;
try {
  db = await mysql.createConnection(connection);
} catch (error) {
  say('');
  fail(
    `Could not reach MySQL at ${connection.host}:${connection.port}.\n\n` +
      `  ${error.message}\n\n` +
      '  Is MySQL running? The quickest way to get one:\n' +
      '    docker run --name showroom-db -e MYSQL_ROOT_PASSWORD=devpassword -p 3306:3306 -d mysql:8\n\n' +
      '  Then run this again with:\n' +
      '    npm run setup -- --db "mysql://root:devpassword@127.0.0.1:3306/carshowroom"',
  );
}

if (has('fresh')) {
  await db.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  warn(`Dropped the database "${dbName}" — starting over`);
}

await db.query(
  `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
);
ok(`Database "${dbName}" is ready at ${connection.host}:${connection.port}`);

// --- 3. Tables --------------------------------------------------------------

step('3. Tables');
run('npx', ['prisma', 'migrate', 'deploy']);
run('npx', ['prisma', 'generate']);
ok('Tables created');

// --- 4. Car brands ----------------------------------------------------------

step('4. Car brands and models');
try {
  run('npx', ['tsx', 'prisma/seed-vpic.ts']);
} catch {
  warn('Could not load the full list — falling back to the bundled one');
  run('npx', ['tsx', 'prisma/seed-vpic.ts', '--offline']);
}

// --- 4b. Somewhere for sale money to land -----------------------------------

step('5. Cash box');
run('npx', ['tsx', 'scripts/ensure-cash-box.ts']);

// --- 5. Practice data -------------------------------------------------------

if (!has('no-demo')) {
  step('6. Practice data');
  // Never overwrite data that is already there — it might be real.
  const [[{ cars }]] = await db.query(`SELECT COUNT(*) AS cars FROM \`${dbName}\`.Car`);
  const existing = Number(cars);
  if (existing > 0) {
    warn(`There are already ${existing} cars — leaving your data alone.`);
    say('    To replace it with fresh practice data: npm run db:seed:demo -- --wipe');
  } else {
    run('npx', ['tsx', 'prisma/seed-demo.ts']);
  }
}

await db.end();

// --- 6. Login ---------------------------------------------------------------

step('7. Your login');

const username = flag('user') ?? 'owner';
const password = flag('password') ?? 'Showroom-Test-2026';

try {
  run('npx', ['tsx', 'scripts/create-user.ts', username, password]);
} catch {
  fail('Could not create the login. Check the message above.');
}

// --- Done -------------------------------------------------------------------

say(`
  ──────────────────────────────────────────────
  Ready. Start it with:

      npm run dev

  Then open  http://localhost:5173

      username:  ${username}
      password:  ${password}

  ${flag('password') ? '' : 'That is a default password — fine for testing on your own\n  machine, but change it before this touches real data.\n'}
  The practice data has three cars mid-journey:
    · Mercedes CLA 300 — in the garage, cost so far 7,550,000
    · Toyota Camry and RAV4 — in the showroom

  Try finishing the Mercedes repair and selling it at 9,000,000.
  You should see a profit of exactly 1,450,000.

  Every figure is explained in docs/money-rules.md
  ──────────────────────────────────────────────
`);
