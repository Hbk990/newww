/**
 * Runs once before the whole test suite: makes sure the separate test database
 * exists and has the current tables. Never touches your real database.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { testDatabaseName, testDatabaseUrl } from './test-database.js';

const require = createRequire(import.meta.url);

export async function setup() {
  const url = testDatabaseUrl();
  const name = testDatabaseName();
  const parsed = new URL(url);

  const mysql = require('mysql2/promise');
  const db = await mysql.createConnection({
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  });
  await db.query(
    `CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await db.end();

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: url },
    shell: process.platform === 'win32',
  });
}
