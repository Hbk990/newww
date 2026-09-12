import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";
import postgres from "postgres";

/**
 * Forgotten password, start to finish.
 *
 * The pages were built and styled without this: nothing proved a customer
 * could actually get back into their account. The parts worth proving are the
 * ones a shopper cannot see — that the code is single-use, that the old
 * password stops working, and that every other session is destroyed, which is
 * the entire point of a reset when the reason for it is a stolen password.
 *
 * The code never leaves the database in readable form (only a SHA-256 of it is
 * stored) and the email is not really sent in this environment, so the test
 * requests a code through the UI and then writes a known hash over the row it
 * created. That keeps every other step honest: the request, the form, the
 * refusals and the sign-in afterwards all go through the real screens.
 */
const sql = postgres(
  process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  { max: 1 },
);

const stamp = Date.now();
const EMAIL = `reset-${stamp}@drphone.test`;
const OLD_PASSWORD = "OldPassword123!";
const NEW_PASSWORD = "BrandNewPassword456!";

let userId = "";

/** The same hash the app stores, so a chosen code can be planted. */
const hashCode = (code: string) =>
  createHash("sha256").update(code).digest("hex");

/** Overwrites the outstanding reset code with one the test knows. */
async function plantCode(code: string) {
  const updated = await sql<{ id: string }[]>`
    update verification_codes
    set code_hash = ${hashCode(code)}, attempts = 0
    where user_id = ${userId}
      and purpose = 'password_reset'
      and consumed_at is null
    returning id
  `;
  expect(updated, "no outstanding reset code was created").toHaveLength(1);
}

test.beforeAll(async () => {
  /*
   * A throwaway account of its own rather than the shared test customer: this
   * spec changes a password and revokes every session, which would pull the
   * storage state out from under every other spec that signs in as them.
   */
  const [user] = await sql<{ id: string }[]>`
    insert into users (email, username, password_hash, email_verified_at, role, status)
    values (${EMAIL}, ${`reset${stamp}`}, '', now(), 'customer', 'active')
    returning id
  `;
  userId = user!.id;

  // The password has to be set by the app so it is hashed the app's way. The
  // reset flow itself is the only route that writes one, so it sets the first.
  await sql`
    insert into verification_codes (user_id, purpose, code_hash, sent_to, expires_at)
    values (${userId}, 'password_reset', ${hashCode("111111")}, ${EMAIL},
            now() + interval '10 minutes')
  `;
});

test.afterAll(async () => {
  await sql`delete from verification_codes where user_id = ${userId}`;
  await sql`delete from sessions where user_id = ${userId}`;
  await sql`delete from auth_attempts where identifier = ${EMAIL}`;
  await sql`delete from users where id = ${userId}`;
  await sql.end();
});

test("a forgotten password can be reset, and the old one stops working", async ({
  page,
  context,
}) => {
  // ---- set the starting password through the reset form itself
  await page.goto("/reset");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Reset code").fill("111111");
  await page.getByLabel("New password").fill(OLD_PASSWORD);
  await page.getByRole("button", { name: "Set password" }).click();
  // A completed reset signs them in, which is the behaviour: they have just
  // proved control of the address.
  await expect(page).toHaveURL("/");

  // ---- a second device, signed in with that password
  const other = await context.browser()!.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("/login");
  await otherPage.getByLabel("Email or username").fill(EMAIL);
  await otherPage.getByLabel("Password").fill(OLD_PASSWORD);
  await otherPage.getByRole("button", { name: "Sign in" }).click();
  await expect(otherPage).toHaveURL("/");
  await otherPage.goto("/account");
  // level 1: the footer's account column is a heading by that name too.
  await expect(
    otherPage.getByRole("heading", { name: "Your account", level: 1 }),
  ).toBeVisible();

  const before = await sql<{ n: number }[]>`
    select count(*)::int as n from sessions
    where user_id = ${userId} and revoked_at is null
  `;
  expect(before[0]!.n, "two devices should hold live sessions").toBe(2);

  // ---- forget it, and ask for a code
  await page.goto("/forgot");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByRole("button", { name: "Send the code" }).click();

  /*
   * The answer is the same whether or not the address has an account. Telling
   * someone "no account with that email" turns this form into a way to find
   * out who shops here.
   */
  await expect(page.getByRole("status")).toContainText(
    `If ${EMAIL} has an account, a reset code is on its way.`,
  );

  await plantCode("222222");

  // ---- a wrong code is refused, without saying which part was wrong
  await page.goto("/reset");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Reset code").fill("999999");
  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Set password" }).click();
  /*
   * Scoped to the card. Next's own route announcer carries role="alert" too,
   * so an unscoped alert locator matches two elements — one of them empty.
   */
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "That code is not right, or it has expired.",
  );

  /*
   * The email survived the failed submit. React 19 resets an uncontrolled form
   * when its action returns, error included, so without the restore in
   * ActionForm a wrong code also wipes the address and the password — and this
   * test failed on exactly that before it was fixed.
   */
  await expect(page.getByLabel("Email")).toHaveValue(EMAIL);

  // ---- the real code sets the new password
  await page.getByLabel("Reset code").fill("222222");
  // The password is deliberately not restored: retyping it is expected, and
  // holding it in memory to refill it would be a risk with no benefit.
  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page).toHaveURL("/");

  // ---- the code is single-use
  const consumed = await sql<{ n: number }[]>`
    select count(*)::int as n from verification_codes
    where user_id = ${userId} and purpose = 'password_reset'
      and consumed_at is null
  `;
  expect(consumed[0]!.n, "the used code should be consumed").toBe(0);

  /*
   * Every other session is gone. This is the whole point of a reset: the
   * reason someone resets a password is often that somebody else has it, and a
   * reset that leaves the thief signed in achieves nothing.
   */
  await otherPage.goto("/account");
  await expect(otherPage).toHaveURL(/\/login/);
  await other.close();

  // ---- the old password no longer works, the new one does
  const fresh = await context.browser()!.newContext();
  const freshPage = await fresh.newPage();
  await freshPage.goto("/login");
  await freshPage.getByLabel("Email or username").fill(EMAIL);
  await freshPage.getByLabel("Password").fill(OLD_PASSWORD);
  await freshPage.getByRole("button", { name: "Sign in" }).click();
  await expect(
    freshPage.getByRole("main").getByRole("alert"),
  ).toBeVisible();
  await expect(freshPage).toHaveURL(/\/login/);

  await freshPage.getByLabel("Password").fill(NEW_PASSWORD);
  await freshPage.getByRole("button", { name: "Sign in" }).click();
  await expect(freshPage).toHaveURL("/");
  await fresh.close();
});

test("an address with no account is answered exactly the same way", async ({
  page,
}) => {
  const stranger = `nobody-${stamp}@drphone.test`;
  await page.goto("/forgot");
  await page.getByLabel("Email").fill(stranger);
  await page.getByRole("button", { name: "Send the code" }).click();

  await expect(page.getByRole("status")).toContainText(
    `If ${stranger} has an account, a reset code is on its way.`,
  );

  const codes = await sql<{ n: number }[]>`
    select count(*)::int as n from verification_codes
    where sent_to = ${stranger}
  `;
  expect(codes[0]!.n, "no code should exist for an unknown address").toBe(0);

  await sql`delete from auth_attempts where identifier = ${stranger}`;
});
