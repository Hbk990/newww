#!/usr/bin/env node
/**
 * Checks the things that stop this system working, and says which one is wrong
 * in plain words.
 *
 *   npm run doctor
 *
 * It only reads. It never changes a setting, a table or a login. Run it any
 * time something does not behave, and send the output to whoever is helping.
 */
import { execFileSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const serverDir = join(root, 'server');
const envPath = join(serverDir, '.env');
const require = createRequire(join(serverDir, 'package.json'));

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const note = (m) => console.log(`      ${m}`);
const head = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);
const redact = (url) => url.replace(/\/\/([^:]+):[^@]*@/, '//$1:****@');

let problems = 0;
const problem = (message, fix) => {
  problems++;
  bad(message);
  if (fix) note(`-> ${fix}`);
};

console.log('\n  Car Showroom - checking this installation\n  ─────────────────────────────────────────');
console.log(`  Folder: ${root}`);

// --- Node --------------------------------------------------------------------

head('Node');
const major = Number(process.versions.node.split('.')[0]);
if (major >= 20) ok(`Node ${process.versions.node}`);
else problem(`Node ${process.versions.node} is too old`, 'Install Node 20 or newer from nodejs.org');

// --- Configuration -----------------------------------------------------------

head('Configuration');
let databaseUrl;
if (!existsSync(envPath)) {
  problem('server/.env is missing - nothing knows which database to use', 'Run setup.cmd, or npm run setup');
} else {
  const env = readFileSync(envPath, 'utf8');
  databaseUrl = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
  if (!databaseUrl) problem('server/.env has no DATABASE_URL line', 'Run setup.cmd, or npm run setup');
  else ok(`Database configured: ${redact(databaseUrl)}`);
  if (!/^SESSION_SECRET="?.{16,}/m.test(env)) warn('SESSION_SECRET is missing or very short - logins will not stay signed in');
}

// --- Installed code ----------------------------------------------------------

head('Installed code');
if (!existsSync(join(root, 'node_modules'))) {
  problem('Nothing is installed yet', 'Run: npm ci');
} else {
  ok('node_modules is present');
  try {
    const client = await import('@prisma/client');
    if (typeof client.CarStatus === 'object') ok('The database client is built and matches the code');
    else problem('The database client is a stub', 'Run: npm run generate --workspace=server');
  } catch {
    problem('The database client is missing', 'Run: npm run generate --workspace=server');
  }
}

// --- Database ----------------------------------------------------------------

let db;
if (databaseUrl) {
  head('Database');
  const url = new URL(databaseUrl);
  const dbName = url.pathname.replace(/^\//, '');
  try {
    const mysql = require('mysql2/promise');
    db = await mysql.createConnection({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    });
    ok(`MySQL is reachable at ${url.hostname}:${url.port || 3306}`);
  } catch (error) {
    problem(
      `Cannot reach MySQL at ${url.hostname}:${url.port || 3306} - ${error.message}`,
      'Open Docker Desktop, then: docker start showroom-db',
    );
  }

  if (db) {
    const [dbs] = await db.query('SHOW DATABASES');
    const names = dbs.map((row) => Object.values(row)[0]);
    if (!names.includes(dbName)) {
      problem(`There is no database called "${dbName}" on that server`, 'Run setup.cmd, or npm run setup');
      note(`Databases that do exist: ${names.filter((n) => !['information_schema','mysql','performance_schema','sys'].includes(n)).join(', ') || 'none'}`);
      await db.end();
      db = null;
    } else {
      ok(`Database "${dbName}" exists`);
      await db.changeUser({ database: dbName });
    }
  }

  if (db) {
    const [tables] = await db.query('SHOW TABLES');
    if (tables.length === 0) {
      problem('The database is empty - the tables were never built', 'Run: npm run db:migrate');
    } else {
      ok(`${tables.length} tables`);
      const [[cars]] = await db.query('SELECT COUNT(*) AS n FROM Car');
      const [[parties]] = await db.query('SELECT COUNT(*) AS n FROM Party');
      const [[practice]] = await db.query("SELECT COUNT(*) AS n FROM Car WHERE vin LIKE 'TEST5%'");
      ok(`${cars.n} cars (${practice.n} of them practice data), ${parties.n} accounts`);
      if (cars.n === 0) warn('No cars at all. For the practice showroom: npm run db:seed:large -- --wipe');
    }
  }

  // --- Logins ----------------------------------------------------------------

  if (db) {
    head('Logins');
    const [users] = await db.query('SELECT username, totpEnabled, failedLogins, lockedUntil FROM User');
    if (users.length === 0) {
      problem('There are no logins on this database', 'Run: npm run create:user -- owner "a-password-12-chars+"');
    }
    for (const user of users) {
      const locked = user.lockedUntil && new Date(user.lockedUntil) > new Date();
      ok(`"${user.username}" - two-factor ${user.totpEnabled ? 'ON (a code is required)' : 'off'}${locked ? ', LOCKED OUT' : ''}`);
      if (user.totpEnabled) note(`If you cannot produce a code: npm run reset:2fa -- ${user.username}`);
      if (locked) note(`Locked until ${new Date(user.lockedUntil).toLocaleTimeString()} after ${user.failedLogins} wrong attempts. Wait, or: npm run create:user -- ${user.username} "a-new-password"`);
    }
    note('A wrong password cannot be read from here - it is stored scrambled.');
    note('To set a known one: npm run create:user -- <username> "a-password-12-chars+"');
    await db.end();
  }
}

// --- Is it running? ----------------------------------------------------------

head('Running now');
const listening = (port) =>
  new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
      .on('connect', () => (socket.end(), resolve(true)))
      .on('error', () => resolve(false));
    socket.setTimeout(1500, () => (socket.destroy(), resolve(false)));
  });

const api = await listening(4000);
const web = await listening(5173);
if (api) ok('The part that holds your data is running (port 4000)');
else warn('Nothing is listening on port 4000 - the system is stopped, or it crashed');
if (web) ok('The screens are running (port 5173)');
else warn('Nothing is listening on port 5173 - the system is stopped');
if (web && !api) note('This is what causes "ECONNREFUSED 127.0.0.1:4000" in the browser.');
if (!api && !web) note('Start it with start.cmd, or: npm run dev');
if (web && !api) note('Run the halves apart to see the real error: npm run dev:api');

// --- Verdict -----------------------------------------------------------------

console.log('\n  ─────────────────────────────────────────');
if (problems === 0) console.log('  Nothing wrong found.\n');
else console.log(`  ${problems} problem${problems === 1 ? '' : 's'} above, each with what to do about it.\n`);
