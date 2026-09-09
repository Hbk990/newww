/**
 * Points every test at the test database. This runs before the test files are
 * imported, so the Prisma client is built with the right connection from the
 * start — the real database is never opened at all.
 */
import { testDatabaseUrl } from './test-database.js';

process.env.DATABASE_URL = testDatabaseUrl();
process.env.SESSION_SECRET ??= 'test-only-secret';
