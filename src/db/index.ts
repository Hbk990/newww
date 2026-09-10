import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/env";
import * as schema from "./schema";

/**
 * Postgres connection.
 *
 * Next dev reloads modules on every edit, which would open a new pool each time
 * and exhaust the server's connection limit within a few saves. Caching the
 * client on `globalThis` survives those reloads; in production the module is
 * evaluated once and the cache is irrelevant.
 *
 * `max: 1` is deliberate for serverless deploys, where each function instance
 * holds its own connection and a larger pool per instance multiplies out fast.
 * Raise it when running as a long-lived server.
 */
const globalForDb = globalThis as unknown as {
  client?: ReturnType<typeof postgres>;
};

const client = globalForDb.client ?? postgres(env.databaseUrl, { max: 1 });

if (!env.isProduction) globalForDb.client = client;

/**
 * `casing` must match drizzle.config.ts, or the runtime will query
 * `shortDescription` while the migration created `short_description`.
 */
export const db = drizzle(client, { schema, casing: "snake_case" });
export { client };
