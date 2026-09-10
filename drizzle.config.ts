import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  // Column names come from the TS keys: `shortDescription` -> short_description.
  // Keeps the SQL identical to docs/schema.sql without naming every column twice.
  casing: "snake_case",
  // Migrations are reviewed before they run: generate SQL, read it, then apply.
  strict: true,
  verbose: true,
});
