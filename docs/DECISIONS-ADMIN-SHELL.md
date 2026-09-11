# Admin Shell Decisions

Answers to all 45 questions, taken 2026-09-11. Every answer matched the
recommendation, so this records what was built rather than where we differed.

## Built

**Sidebar** — grouped under Overview, Sales, Catalog, Inventory and System,
collapsible to icons with the choice remembered per device, Settings pinned to
the bottom. `href` is typed as Next's `Route`, so a link to a page that does not
exist fails the build. That is why seventeen stub pages exist: the sidebar
cannot lie about what is there.

**Top bar** — search box with `/` to focus it, Create menu, notification bell
with an unread count, theme toggle, account menu.

**Mobile** — a bottom bar of Orders, Products, Stock and Search, plus More
opening a drawer. Search is a button that focuses the top-bar box rather than a
route, because search is not a page.

**Theme** — follows the system with a manual override. An inline script in the
document head stamps the stored choice before first paint; without it the page
renders in the system theme and snaps to the chosen one on every navigation.

**The products table** — 50 rows a page, numbered pages, thumbnail, status pill,
brand, category, price range, variant count, an inline availability switch, and
last-updated. Archived hidden by default, drafts shown. Cost and margin are
opt-in columns and permission-gated.

**Table behaviour, shared by every future list** — search as you type after
250ms, filters as chips above the table, sort by clicking a header, comfortable
or compact rows, sticky header and first column, select-all scoped to the page
with archiving behind a confirmation, and an empty state that says what was
filtered.

**All table state lives in the URL.** A filtered list can be bookmarked, shared
and refreshed, and the back button works — which is the substitute for the saved
views that were declined. Nothing is remembered between visits: a remembered
filter is how people conclude their records have gone missing.

## Two things worth knowing

**The inline availability switch is optimistic, and the database is the truth.**
It answers instantly because it is the action repeated most in this admin. A
failure puts the row back and says so, rather than leaving the screen
disagreeing with the database. Every flip writes an `audit_log` row.

**Typing to confirm is reserved for bulk actions over ten rows.** Friction on
every destructive action gets ignored by habit within a week, which makes it
worse than none.

## Bugs found while testing

**The sticky header was covering the first row.** `overflow-x-auto` makes a div
a scroll container in *both* axes per spec, so `sticky top-14` inside it
offset the header 56px down from the container — landing on the first rows and
swallowing their clicks — instead of clearing the top bar. Found because
Playwright could not click the first switch. Fixed by giving the container a
bounded height so it is a real scroller, with the header at `top-0`.

**`staff` could read cost history through the audit log.** The role lacked
`products.view_cost` but had `audit.view`, and the audit log records price and
cost changes with their previous values. `audit.view` is now admin-only. A
permission set is only as tight as its leakiest member.

**Session cookies were untestable over HTTP.** `Secure` was keyed to
`NODE_ENV`, so a production build served without TLS set a cookie the browser
then refused, and sign-in failed silently with nothing in the logs. It now
follows the request's protocol, defaulting to `https` in production when no
proxy header is present so a misconfigured proxy cannot quietly downgrade a real
deployment.

**Three `set-state-in-effect` violations.** Reading `localStorage` in an effect
and calling `setState` renders twice on every mount. The sidebar and theme
toggle now read through `useSyncExternalStore`, which is built for exactly this
— server snapshot while hydrating, client snapshot after. The mobile drawer
closes from the tapped link rather than an effect watching the path, which
otherwise cost an extra render on every navigation in the admin.

## Two false alarms, recorded so they are not re-investigated

**Client interactivity appears broken under `next dev` in this sandbox.** The
HMR WebSocket cannot connect through the environment's proxy, which stops
hydration completing, so no handler attaches. The admin shell is therefore
tested against a production build. Nothing is wrong with the code.

**The login throttle locks you out during repeated testing.** Eight attempts
per identifier per fifteen minutes, counting successes. Test harnesses need to
clear `auth_attempts` first; a run that mysteriously cannot sign in has usually
just tripped it.

## Still to build

The dashboard tiles and sales graph, global search results, notification
contents, the settings screen, staff account management, the active sessions
page, the activity feed, and the seventeen stub pages themselves — starting
with the product form.
