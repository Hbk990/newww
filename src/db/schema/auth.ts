import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { authProvider, verificationPurpose } from "./enums";
import { users } from "./identity";

/**
 * A third-party login linked to an account.
 *
 * Separate from `users` rather than a `google_id` column, so one account can
 * carry several logins — someone who registered by email and later clicks
 * "Sign in with Google" should land in the same account, not a duplicate. That
 * linking is matched on verified email.
 *
 * `providerUserId` is Google's `sub` claim, which is stable and never reused.
 * Never match on email alone for identity: people change their email address,
 * and `sub` is the only durable handle.
 */
export const userIdentities = pgTable(
  "user_identities",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: authProvider().notNull(),
    providerUserId: text().notNull(),
    // The address the provider reported when this was linked, for support
    // questions. Not authoritative — `users.email` is.
    providerEmail: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    // One Google account cannot be attached to two of our accounts.
    unique("user_identities_provider_key").on(t.provider, t.providerUserId),
    // And one of our accounts links at most one Google account.
    unique("user_identities_user_provider_key").on(t.userId, t.provider),
    index("user_identities_user_idx").on(t.userId),
  ],
);

/**
 * Server-side sessions.
 *
 * Server-side rather than a self-contained signed cookie, because a stateless
 * token cannot be revoked: "sign out on all devices" and locking out a
 * compromised staff account both need a row to delete. That was the point of
 * choosing this over a JWT.
 *
 * `tokenHash` holds SHA-256 of the opaque cookie value, never the value
 * itself. A leaked database backup then contains no usable sessions. SHA-256
 * rather than Argon2 because the token is 256 bits of random — there is nothing
 * to brute-force, and every request would otherwise pay for a slow hash.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text().notNull().unique(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    // Shown on a "your sessions" screen so someone can recognize a login that
    // is not theirs.
    ipAddress: text(),
    userAgent: text(),
  },
  (t) => [
    // "Sign out everywhere", and listing a user's active sessions.
    index("sessions_user_idx").on(t.userId),
    // The cleanup sweep, and the live-session lookup.
    index("sessions_live_idx")
      .on(t.expiresAt)
      .where(sql`${t.revokedAt} is null`),
  ],
);

/**
 * Short-lived codes emailed to a person: verifying an address at registration,
 * and resetting a password.
 *
 * A six-digit code is only a million possibilities, so the hash is not what
 * protects it — an attacker holding the database can exhaust SHA-256 over
 * 10^6 inputs instantly. What protects it is `attempts`, a short `expiresAt`,
 * and rate limiting on the endpoint. The hash is there so a code never appears
 * in a backup or a log dump in usable form. Do not mistake it for the control.
 *
 * `consumedAt` rather than deleting the row: a used code must stay unusable,
 * and a deleted row cannot tell a replay attempt apart from a typo.
 */
export const verificationCodes = pgTable(
  "verification_codes",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: verificationPurpose().notNull(),
    codeHash: text().notNull(),
    // The address the code went to, so changing email mid-flow invalidates it.
    sentTo: text().notNull(),
    attempts: integer().notNull().default(0),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    consumedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The lookup on submit: this user's outstanding code for this purpose.
    index("verification_codes_open_idx")
      .on(t.userId, t.purpose, t.createdAt.desc())
      .where(sql`${t.consumedAt} is null`),
    index("verification_codes_expiry_idx").on(t.expiresAt),
  ],
);

/**
 * Login and code-entry attempts, for throttling.
 *
 * Recorded per identifier *and* per IP because the two attacks differ: many
 * passwords against one account, versus one common password against many
 * accounts. Throttling only by account misses the second entirely.
 *
 * A log rather than a counter, so a lockout can be explained after the fact —
 * "why can't I sign in" is answerable. It needs periodic pruning; rows older
 * than the longest throttle window carry no information.
 */
export const authAttempts = pgTable(
  "auth_attempts",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Email, username, or phone — whatever was typed. Not a foreign key: most
    // failed attempts name an account that does not exist.
    identifier: text().notNull(),
    // 'password' | 'code' | 'resend' | 'register'
    kind: text().notNull(),
    ipAddress: text(),
    succeeded: boolean().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("auth_attempts_identifier_idx").on(t.identifier, t.createdAt.desc()),
    index("auth_attempts_ip_idx").on(t.ipAddress, t.createdAt.desc()),
  ],
);
