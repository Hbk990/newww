import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

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

/**
 * Where each role's pre-signed browser state is written.
 *
 * Specs that are not about signing in load one of these instead of driving the
 * login form. That is not only faster: the login throttle counts every attempt,
 * successful or not, and allows eight per identifier per fifteen minutes. With
 * every spec signing in as admin, the suite locked itself out partway through —
 * which is how this file came to exist.
 */
// process.cwd(), not import.meta.dirname: Playwright loads this file as
// CommonJS, where import.meta is a syntax error. It always runs from the
// project root, where playwright.config.ts lives.
export const AUTH_DIR = path.join(process.cwd(), "e2e", ".auth");

export const storageStateFor = (role: keyof typeof ACCOUNTS) =>
  path.join(AUTH_DIR, `${role}.json`);

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

    /*
     * A session per role, written straight to the database and saved as
     * Playwright storage state.
     *
     * Minted exactly as the app does — 32 random bytes, base64url in the
     * cookie, SHA-256 hex in the table — so these are ordinary sessions and
     * nothing about them is a special case the app has to know about.
     */
    await mkdir(AUTH_DIR, { recursive: true });
    for (const [role, account] of Object.entries(ACCOUNTS)) {
      const token = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(token).digest("hex");

      const [user] = await sql<{ id: string }[]>`
        select id from users where email = ${account.email}
      `;
      if (!user) throw new Error(`no user row for ${account.email}`);

      // Last run's session goes, so the table does not grow by three rows per
      // run and leave someone wondering why a test database has hundreds.
      await sql`delete from sessions where user_id = ${user.id}`;

      await sql`
        insert into sessions (user_id, token_hash, expires_at)
        values (${user.id}, ${tokenHash}, now() + interval '1 day')
      `;

      await writeFile(
        storageStateFor(role as keyof typeof ACCOUNTS),
        JSON.stringify({
          cookies: [
            {
              name: "drphone_session",
              value: token,
              domain: "127.0.0.1",
              path: "/",
              expires: Math.floor(Date.now() / 1000) + 86_400,
              httpOnly: true,
              secure: false,
              sameSite: "Lax",
            },
          ],
          origins: [],
        }),
        "utf8",
      );
    }
  } finally {
    await sql.end();
  }
}
