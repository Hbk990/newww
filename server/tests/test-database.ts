/**
 * The tests wipe every table before they run. That is fine for a database that
 * exists only for testing, and catastrophic for the one holding your cars.
 *
 * So the test suite never touches the database in your .env. It derives a
 * separate one by adding "_test" to the name, creates it if needed, and works
 * only in there. Running `npm test` can never cost you data.
 */
import 'dotenv/config';

export function testDatabaseUrl(): string {
  const original = process.env.DATABASE_URL;
  if (!original) throw new Error('DATABASE_URL is not set — copy server/.env.example to server/.env');

  const url = new URL(original);
  const name = url.pathname.replace(/^\//, '');
  if (!name) throw new Error(`DATABASE_URL has no database name: ${original}`);

  // Already pointed at a test database — leave it alone.
  url.pathname = `/${name.endsWith('_test') ? name : `${name}_test`}`;
  return url.toString();
}

export const testDatabaseName = () => new URL(testDatabaseUrl()).pathname.replace(/^\//, '');
