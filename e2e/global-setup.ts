import { hash } from "@node-rs/argon2";
import postgres from "postgres";

/**
 * The three accounts every spec signs in as, and a cleared login throttle.
 *
 * Written straight to the database rather than through the registration flow
 * because registration requires a verification code that the `console` mail
 * transport prints to the server log — unreachable from a browser test. The
 * accounts are upserted, so the suite is repeatable and does not depend on
 * whatever a previous run left behind.
 *
 * Clearing `auth_attempts` matters more than it looks: the throttle allows 8
 * password attempts per identifier per 15 minutes, and a suite that signs in a
 * few times per run locks itself out on the second or third run otherwise.
 */
export const ACCOUNTS = {
  admin: { email: "admin@drphone.test", username: "admin", role: "admin" },
  staff: { email: "staff@drphone.test", username: "staffy", role: "staff" },
  customer: { email: "cust@drphone.test", username: "custy", role: "customer" },
} as const;

export const TEST_PASSWORD = "Testpass123!";

export default async function globalSetup(): Promise<void> {
  const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Set E2E_DATABASE_URL (or DATABASE_URL) to a scratch database migrated to head.",
    );
  }

  const sql = postgres(url, { max: 1 });
  try {
    const migrations = await sql<{ n: number }[]>`
      select count(*)::int as n from drizzle.__drizzle_migrations
    `;
    const applied = migrations[0]?.n ?? 0;
    if (applied === 0) {
      throw new Error(
        `${url} has no migrations applied. Run: DATABASE_URL=${url} npm run db:migrate`,
      );
    }

    // Same parameters as src/lib/auth/password.ts. Hashed once and reused for
    // all three accounts, because Argon2id at 19 MiB is deliberately slow.
    const passwordHash = await hash(TEST_PASSWORD, {
      algorithm: 2,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    for (const account of Object.values(ACCOUNTS)) {
      await sql`
        insert into users (email, username, role, password_hash, email_verified_at, status)
        values (${account.email}, ${account.username}, ${account.role}::user_role,
                ${passwordHash}, now(), 'active')
        on conflict (email) do update
          set password_hash = excluded.password_hash,
              role = excluded.role,
              username = excluded.username,
              email_verified_at = excluded.email_verified_at,
              status = 'active',
              must_change_password = false
      `;
    }

    await sql`delete from auth_attempts`;
  } finally {
    await sql.end();
  }
}
