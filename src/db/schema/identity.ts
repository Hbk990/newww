import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { accountStatus, userRole } from "./enums";

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull().unique(),
    /**
     * Null until the address is confirmed by a code. Email registration cannot
     * complete without it.
     *
     * Google sign-in sets this immediately from the ID token's `email_verified`
     * claim: Google has already proved the address, and emailing a code to
     * confirm what Google confirmed only costs sign-ups.
     */
    emailVerifiedAt: timestamp({ withTimezone: true }),
    /**
     * Nullable in the database, mandatory in the application.
     *
     * Google hands us an email and a display name, never a username, so a
     * Google account exists for the moment between the ID token being verified
     * and the person choosing one. The alternatives are worse: holding a
     * half-authenticated identity in a cookie until they pick, or generating a
     * placeholder that leaks into URLs and then has to be changed.
     *
     * So the row is created without one and the app gates every authenticated
     * route until it is set. Anything reading `username` must handle null.
     */
    username: text(),
    // Null when the account is Google-only and has no password at all.
    passwordHash: text(),
    name: text(),
    // From Google's `picture` claim. Cached rather than hot-linked, since the
    // Google URL expires.
    avatarUrl: text(),
    role: userRole().notNull().default("customer"),
    status: accountStatus().notNull().default("active"),
    /**
     * Set when an account is created with a temporary password, or after a
     * suspected leak. Every authenticated route sends the person to change it
     * before anything else.
     */
    mustChangePassword: boolean().notNull().default(false),
    /**
     * Last successful sign-in. Denormalized from the session rows rather than
     * derived, because sessions get pruned and this is exactly the field you
     * want when asking "is anyone still using this account".
     */
    lastLoginAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * Case-insensitive uniqueness, enforced by the database rather than by
     * remembering to lowercase before every insert.
     *
     * Without these, `Ali` and `ali` are two accounts and `Ali@x.com` and
     * `ali@x.com` are two more — which is both a support problem and an account
     * takeover vector, since a victim's address can be re-registered in
     * different case.
     */
    uniqueIndex("users_username_lower_key").on(sql`lower(${t.username})`),
    uniqueIndex("users_email_lower_key").on(sql`lower(${t.email})`),
    // Letters, digits and underscore, 3-20 characters. Checked here as well as
    // in the form, because a username ends up in URLs.
    check(
      "users_username_format",
      sql`${t.username} is null or ${t.username} ~ '^[A-Za-z0-9_]{3,20}$'`,
    ),
  ],
);

/**
 * The customer's saved address book. Orders do not reference this — they
 * snapshot the address into jsonb, because a customer editing or deleting an
 * address must not rewrite where a past parcel went.
 *
 * Shaped for Lebanon: `region` is the governorate and drives the shipping zone,
 * `phone` is required because couriers call ahead, and `postalCode` is nullable
 * because coverage is not reliable. `directions` exists because that is how
 * deliveries are actually found.
 */
export const addresses = pgTable(
  "addresses",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    line1: text().notNull(),
    line2: text(),
    building: text(),
    floor: text(),
    city: text().notNull(),
    region: text().notNull(),
    postalCode: text(),
    // ISO 3166-1 alpha-2
    country: char({ length: 2 }).notNull(),
    phone: text().notNull(),
    directions: text(),
    // Optional map pin. Stored as plain numerics rather than PostGIS: we only
    // ever hand these to a map, never compute distances with them.
    latitude: numeric({ precision: 10, scale: 7 }),
    longitude: numeric({ precision: 10, scale: 7 }),
    isDefault: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("addresses_user_idx").on(t.userId)],
);
