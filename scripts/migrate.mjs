/**
 * Applies pending migrations from ./drizzle.
 *
 * Uses drizzle-orm's migrator rather than `drizzle-kit migrate`: the CLI exits
 * non-zero without printing the failing statement, which makes a broken
 * migration almost impossible to diagnose. This prints the error.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.");
  process.exit(1);
}

// max: 1 — migrations must run in order on one connection.
const client = postgres(url, { max: 1 });

try {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
} catch (error) {
  console.error("\nMigration failed.\n");
  console.error(error?.message ?? error);
  if (error?.cause) console.error("\nCaused by:", error.cause.message ?? error.cause);
  for (const key of ["severity", "code", "detail", "hint", "where", "position", "query"]) {
    if (error?.[key]) console.error(`  ${key}: ${error[key]}`);
  }
  process.exitCode = 1;
} finally {
  await client.end();
}
