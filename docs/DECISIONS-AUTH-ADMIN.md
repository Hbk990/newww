# Auth and Admin Shell Decisions

Answers to all 50 questions, taken 2026-09-11. **37 in, 13 out.**

## Out

Two-factor authentication (asked twice, declined twice), account lockout
beyond throttling, recovery codes, trusted devices, session limits per user,
per-role nav filtering, the Ctrl+K palette, recently-opened, pinned pages,
per-role dashboards, saved views, feature flags, and customer impersonation.

## The answer that mattered most

Q01: **keep three roles, but route every check through one permission
function.**

That is the answer that dissolves the retrofit problem the source document
warns about. Nothing anywhere asks `user.role === "admin"`. Everything asks
`can(user, "products.change_price")`. `src/lib/auth/permissions.ts` holds 31
named permissions and the role → permission mapping; switching to granular
per-role permissions later means rewriting that one file and adding a table,
not auditing every route to work out what it meant to protect.

`staff` deliberately lacks `products.view_cost`, `reports.view_profit` and
anything under `users` or `backups`. That is a sensible default, not a claim
about the current team — the source document asked for cost and profit to be
separable, and this is where that lives.

## Built in this step

| Answer | What was built |
|---|---|
| Q01 | The permission function, 31 permissions, role mapping |
| Q05 | Password reset by email — request, code, new password |
| Q06 | Change password while signed in |
| Q07 | Forced password change, gating every route |
| Q08 | Idle timeout — 8 hours, staff and admin only |
| Q14 | `active` / `suspended` / `disabled`, enforced per request |
| Q16 | `lastLoginAt`, written on every sign-in |
| Q17 | `sessions.reauthenticatedAt` and the operations list |
| Q23 | Append-only audit log, enforced by the database |
| Q43 | The `idempotency_keys` table |
| Q46, Q47 | Settings columns, including maintenance mode |

### Details worth knowing

**Suspension takes effect on the next request**, not at the next sign-in. The
check is in `currentUser`, and it revokes the session on the way past. A
suspended account signing in gets the *same generic message* as a wrong
password — saying "this account is suspended" to someone who just guessed the
password correctly confirms both that the account exists and that they guessed
right.

**A password change revokes every other session and re-issues this one.** A
change that leaves old sessions alive protects nothing; signing out the person
who just proved who they are is pointless friction.

**Password reset always reports success**, whether or not the address has an
account, and a wrong code, an expired code and an unknown address all return
one message. Anything more specific turns the form into a way to discover who
is registered. Completing a reset also verifies the email, since it proves
control of the address.

**Idle timeout is staff-only.** Signing a customer out mid-purchase costs a
sale and protects nothing: a customer session reaches that customer's own
orders and nothing else. `TOUCH_AFTER_MINUTES` (60) must stay well below
`STAFF_IDLE_HOURS` (8), or a session in active use could be declared idle
because its `lastSeenAt` had not been written yet.

**Re-authentication is per session, not per user.** Freshness is a property of
this device right now, which is the point — a borrowed unlocked laptop should
not be able to export the customer list.

## The append-only audit log, and the two bugs it caused

Q23 asked for it enforced by the database, which is right: "enforced in the
application" means anyone with a connection string is exempt, and the people
most worth auditing are the ones with database access. `audit_log`,
`inventory_ledger` and `price_history` all refuse UPDATE and DELETE, for
everyone including the table owner.

The first attempt broke two ordinary operations, both caught in testing:

**Deleting a variant failed.** The trigger was statement-level, and a
statement-level trigger fires even when the statement matches no rows — so a
cascading delete from a variant with no stock history raised anyway. That would
have broken the bulk variant generator outright. Now row-level, so it fires
only for rows actually being changed.

**Deleting a user failed.** `audit_log.actor_id ON DELETE SET NULL` is an
UPDATE against an append-only table. Nulling the actor is also the opposite of
what an audit log is for.

Both fixed by decoupling the history tables: `inventoryLedger.variantId`,
`priceHistory.variantId` and `auditLog.actorId` are now loose references with
no foreign key — the same reasoning already documented for `auditLog.entityId`.
History has to outlive the row it describes, and a cascade into an append-only
table can never succeed. Verified: a variant with stock history can be deleted
and its ledger survives; a user can be deleted and the audit row keeps their id.

## Still to build

Everything in the shell is UI work and none of it is started: sidebar
navigation, mobile layouts, breadcrumbs, global search, the notification
centre, the Create button, the shared table component with column selection and
export, confirmation dialogs, undo, error reference codes, connection
detection, the settings screen, staff account management, the active sessions
page, the activity feed, writing to the audit log from application code, and
bulk actions.

The schema and the security layer they all sit on are done. `revokeAllSessions`
and `markReauthenticated` exist and are called by nothing yet — they need
buttons.

## One small deviation

Q26 chose **show everything to all staff**, so no per-role nav filtering was
built. A handful of destinations are admin-only regardless — staff accounts and
backups — and those stay hidden from non-admins rather than rendering a link
that redirects away. Showing a dead link is worse than not showing it.
