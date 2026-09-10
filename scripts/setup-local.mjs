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
 *   --big                                                     50 cars instead of 3
 *   --fresh                                                   ERASE and start over
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
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

/**
 * Everything printed also goes here. A step that fails prints its reason and
 * then scrolls away under whatever comes next, and asking someone to find it
 * again in a terminal is asking a lot. One file can just be sent.
 */
const logPath = join(root, 'setup-log.txt');
writeFileSync(
  logPath,
  [
    `Car Showroom setup log`,
    `${new Date().toISOString()}`,
    `node ${process.version} on ${process.platform}`,
    `folder ${root}`,
    `arguments ${argv.join(' ') || '(none)'}`,
    '',
    '',
  ].join('\n'),
);
const log = (text) => {
  try {
    // Strip the colour codes: they are noise in a file.
    appendFileSync(logPath, String(text).replace(/\x1b\[[0-9;]*m/g, ''));
  } catch {
    // A log that cannot be written must never stop the setup it is logging.
  }
};

const say = (message) => (console.log(message), log(`${message}\n`));
const step = (message) => (console.log(`\n\x1b[1m${message}\x1b[0m`), log(`\n== ${message} ==\n`));
const ok = (message) => (console.log(`  \x1b[32m✓\x1b[0m ${message}`), log(`  OK   ${message}\n`));
const warn = (message) => (console.log(`  \x1b[33m!\x1b[0m ${message}`), log(`  WARN ${message}\n`));
const fail = (message) => {
  console.error(`\n\x1b[31m✗ ${message}\x1b[0m\n`);
  log(`\nFAILED ${message}\n`);
  console.error(`  The whole run, including the message above, is saved in:`);
  console.error(`    ${logPath}\n`);
  process.exit(1);
};

/** Never print a database password to the screen or a log. */
const redact = (url) => url.replace(/\/\/([^:]+):[^@]*@/, '//$1:****@');

/**
 * Runs one of this project's own TypeScript scripts.
 *
 * Deliberately not "npx tsx": npx re-resolves the tool on every call and will
 * try the network when it does not like what it finds, which turns an offline
 * moment into a failed install. This uses the Node already running and the tsx
 * that npm installed, and nothing else.
 */
const script = (file, ...args) => [process.execPath, ['--import', 'tsx', file, ...args]];

/**
 * Runs a step, showing its output as it appears and keeping a copy in the log.
 * Resolves with the exit code; never throws, so each caller decides what a
 * failure means.
 */
const attempt = (command, args, cwd = serverDir, env = {}) =>
  new Promise((resolve) => {
    log(`\n$ ${[command, ...args].join(' ')}\n`);
    const child = spawn(command, args, {
      cwd,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
      // Windows needs a shell to run npm and npx, which are .cmd files. It must
      // not get one for a full path like C:\Program Files\nodejs\node.exe:
      // the shell splits that at the space and reports 'C:\Program' missing.
      shell: process.platform === 'win32' && !isAbsolute(command),
    });
    const tee = (stream, out) =>
      stream?.on('data', (chunk) => {
        out.write(chunk);
        log(chunk.toString());
      });
    tee(child.stdout, process.stdout);
    tee(child.stderr, process.stderr);
    child.on('error', (error) => {
      const message = `Could not run "${command}": ${error.message}\n`;
      process.stderr.write(message);
      log(message);
      resolve(1);
    });
    child.on('close', (code) => resolve(code ?? 1));
  });

/** Runs a step that must succeed. */
const run = async (command, args, cwd = serverDir, env = {}) => {
  const code = await attempt(command, args, cwd, env);
  if (code !== 0)
    fail(
      `This step stopped:  ${[command, ...args].join(' ')}\n\n` +
        '  Its own error message is printed above this box — that is the one\n' +
        '  that says why. Everything below it is just Node reporting that the\n' +
        '  step failed.',
    );
};

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

// A container started seconds ago is still bringing MySQL up, so a first
// attempt fails on a machine where everything is actually fine. Wait for it
// rather than reporting a problem that is about to solve itself.
let db;
let lastError;
for (let attempt = 1; attempt <= 20; attempt++) {
  try {
    db = await mysql.createConnection(connection);
    break;
  } catch (error) {
    lastError = error;
    if (attempt === 1) say('  Waiting for MySQL to be ready…');
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

if (!db) {
  const error = lastError;
  say('');
  // Access denied means MySQL is there and answering — it is the password that
  // is wrong, which on a machine like this nearly always means an old container
  // from an earlier attempt is still running, with the password it was born
  // with. Saying "is MySQL running?" there sends people looking in the wrong
  // place, so name the real cause and the way out of it.
  const denied = /access denied/i.test(error.message);
  fail(
    `Could not use MySQL at ${connection.host}:${connection.port}.\n\n` +
      `  ${error.message}\n\n` +
      (denied
        ? '  MySQL is running, but it did not accept that password. If this is a\n' +
          '  container left over from an earlier attempt, it still has its old\n' +
          '  password. Delete it and let this build a new one:\n\n' +
          '    docker rm -f showroom-db\n' +
          `    docker run --name showroom-db -e MYSQL_ROOT_PASSWORD=devpassword -p ${connection.port}:3306 -d mysql:8\n\n` +
          '  WARNING: that erases whatever was in the old container.\n' +
          '  Then run this setup again.'
        : '  Is MySQL running? The quickest way to get one:\n' +
          `    docker run --name showroom-db -e MYSQL_ROOT_PASSWORD=devpassword -p ${connection.port}:3306 -d mysql:8\n\n` +
          '  Then run this again with:\n' +
          `    npm run setup -- --db "mysql://root:devpassword@127.0.0.1:${connection.port}/carshowroom"`),
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
await run('npx', ['prisma', 'migrate', 'deploy']);
await run(process.execPath, ['scripts/ensure-client.mjs']);
ok('Tables created');

// --- 4. Car brands ----------------------------------------------------------

step('4. Car brands and models');
if ((await attempt(...script('prisma/seed-vpic.ts'))) !== 0) {
  warn('Could not load the full list — falling back to the bundled one');
  await run(...script('prisma/seed-vpic.ts', '--offline'));
}

// --- 5. Practice data -------------------------------------------------------

const big = has('big');

/** The chassis numbers the practice data uses, and nothing else ever does. */
/**
 * Practice data is a convenience; the login is not. A seeder that fails must
 * never stop setup before the login exists, or you are left with a system you
 * cannot sign in to and no obvious way back.
 */
const loadPractice = async (seeder, extra) => {
  if ((await attempt(...script(seeder, ...extra))) !== 0) {
    warn('The practice data did not load. Its reason is printed above.');
    warn('Setup is carrying on — the system itself is fine, it just has no');
    warn('practice cars in it. Load them later with:');
    say(`      npm run db:seed:${seeder.includes('large') ? 'large' : 'demo'} -- --wipe`);
  }
};

const DEMO_VINS = ['WDDSJ4EB0KN712345', '4T1B11HK5LU123456', '2T3P1RFV8MC123456'];
const isPractice = (vin) => DEMO_VINS.includes(vin) || String(vin).startsWith('TEST5');

if (!has('no-demo')) {
  step('5. Practice data');
  const [rows] = await db.query(`SELECT vin FROM \`${dbName}\`.Car`);
  const vins = rows.map((row) => row.vin);
  const seeder = big ? 'prisma/seed-large.ts' : 'prisma/seed-demo.ts';

  if (vins.length === 0) {
    await loadPractice(seeder, []);
  } else if (vins.every(isPractice)) {
    // Only practice cars are there, so swapping them for the set you asked for
    // loses nothing. Doing it by hand every time was needless work.
    warn(`Replacing the ${vins.length} practice cars that were already here.`);
    await loadPractice(seeder, ['--wipe']);
  } else {
    // Real cars. Never touch them.
    warn(`There are already ${vins.length} cars, and some are not practice data — leaving them alone.`);
    say(`    To wipe everything and load practice data: npm run db:seed:${big ? 'large' : 'demo'} -- --wipe`);
  }
}

await db.end();

// --- Somewhere for sale money to land ---------------------------------------
// After the practice data, so it adopts the cash box that came with it rather
// than adding a second one.

step('6. Cash box');
await run(...script('scripts/ensure-cash-box.ts'));

// --- 6. Login ---------------------------------------------------------------

step('7. Your login');

const username = flag('user') ?? 'owner';
const password = flag('password') ?? 'Showroom-Test-2026';

await run(...script('scripts/create-user.ts', username, password));

// --- Done -------------------------------------------------------------------

say(`
  ──────────────────────────────────────────────
  Ready. Start it with:

      npm run dev

  Then open  http://localhost:5173

      username:  ${username}
      password:  ${password}

  ${flag('password') ? '' : 'That is a default password — fine for testing on your own\n  machine, but change it before this touches real data.\n'}
${
  has('no-demo')
    ? '  The system is empty — start by adding a supplier under Accounts.\n'
    : big
      ? `  The practice data is a full showroom:
    · 50 cars for sale, 14 already sold, 3 held with a deposit
    · 5 suppliers (3 American, 2 Canadian), 5 shippers, 5 transfer companies

  Every practice chassis number starts with TEST5, so it can never be
  mistaken for a real car. Clear it with:
      npm run db:seed:large -- --wipe
`
      : `  The practice data has three cars mid-journey:
    · Mercedes CLA 300 — in the garage, cost so far 7,550,000
    · Toyota Camry and RAV4 — in the showroom

  Try finishing the Mercedes repair and selling it at 9,000,000.
  You should see a profit of exactly 1,450,000.
`
}
  Every figure is explained in docs/money-rules.md
  ──────────────────────────────────────────────
`);
