import type { SessionUser } from "./session";

/**
 * Every permission in the system, named the way the feature plan names them.
 *
 * This file exists so that the choice of three roles is not a decision baked
 * into fifty pages. Nothing anywhere asks `user.role === "admin"`; everything
 * asks `can(user, "products.change_price")`. Switching to per-role granular
 * permissions later means rewriting `ROLE_PERMISSIONS` below and adding a table
 * — not auditing every route to work out what it meant to protect.
 *
 * That is the whole point: the retrofit that is normally painful becomes a
 * contained change, at the cost of one indirection today.
 */
export const PERMISSIONS = [
  "products.view",
  "products.create",
  "products.edit",
  "products.archive",
  "products.change_price",
  "products.view_cost",
  "products.export",

  "orders.view",
  "orders.create",
  "orders.edit",
  "orders.confirm",
  "orders.cancel",
  "orders.refund",

  "inventory.view",
  "inventory.adjust",
  "inventory.count",

  "customers.view",
  "customers.export",

  "reviews.moderate",
  "promotions.manage",

  "settings.view",
  "settings.edit",

  "users.view",
  "users.manage",

  "audit.view",

  "backups.view",
  "backups.create",
  "backups.download",
  "backups.restore",
  "backups.delete",

  "reports.view_profit",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

type Role = SessionUser["role"];

/**
 * What each role may do today.
 *
 * `staff` deliberately lacks `products.view_cost`, `reports.view_profit` and
 * anything under `users` or `backups`: margin and staff administration are the
 * things you would not hand to a new employee on their first day. That is a
 * default, not a claim about your current team — the feature plan asked for
 * cost and profit to be separable, and this is where that lives.
 */
const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  customer: [],

  staff: [
    "products.view",
    "products.create",
    "products.edit",
    "products.archive",
    "products.export",
    "orders.view",
    "orders.create",
    "orders.edit",
    "orders.confirm",
    "orders.cancel",
    "inventory.view",
    "inventory.adjust",
    "inventory.count",
    "customers.view",
    "reviews.moderate",
    "promotions.manage",
    "settings.view",
    "audit.view",
  ],

  admin: PERMISSIONS,
};

/**
 * The only permission check in the codebase.
 *
 * A suspended or disabled account is refused everything, whatever its role —
 * checked here rather than at sign-in alone, so suspending someone takes effect
 * on their next request instead of whenever their session expires.
 */
export function can(
  user: Pick<SessionUser, "role" | "status"> | null,
  permission: Permission,
): boolean {
  if (!user) return false;
  if (user.status !== "active") return false;
  return ROLE_PERMISSIONS[user.role].includes(permission);
}

/** For a nav item or a page that needs any one of several permissions. */
export function canAny(
  user: Pick<SessionUser, "role" | "status"> | null,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((permission) => can(user, permission));
}

/**
 * Operations that require the password to have been re-entered recently on
 * this device, not merely a valid session.
 */
export const REAUTH_REQUIRED: readonly Permission[] = [
  "customers.export",
  "settings.edit",
  "users.manage",
  "backups.download",
  "backups.restore",
  "backups.delete",
];

/** How recently. Fifteen minutes is long enough to finish a task, short
 *  enough that a walked-away-from laptop goes stale. */
export const REAUTH_WINDOW_MINUTES = 15;
