import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { storageStateFor, TEST_PASSWORD, ACCOUNTS } from "./global-setup";

/**
 * Sensitive screens ask for the password again.
 *
 * The threat is a laptop left unlocked, not a stolen password: a borrowed
 * browser already holds a valid session, and without this it could change the
 * shop's settings or export every customer. Before this step the list existed
 * in permissions.ts and nothing read it — `requireRecentAuth` did not exist at
 * all.
 */
const sql = postgres(
  process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  { max: 1 },
);

const admin = () => sql`
  select id from users where email = ${ACCOUNTS.admin.email}
`;

/** Ages this admin's session past the window without touching anything else. */
async function goStale() {
  const [user] = await admin();
  await sql`
    update sessions set reauthenticated_at = now() - interval '16 minutes'
    where user_id = ${user!.id}
  `;
}

async function goFresh() {
  const [user] = await admin();
  await sql`
    update sessions set reauthenticated_at = now() where user_id = ${user!.id}
  `;
}

test.use({ storageState: storageStateFor("admin") });

test.afterAll(async () => {
  await goFresh();
  await sql`delete from auth_attempts`;
  await sql.end();
});

test("a stale session is told before it fills the form, not after", async ({
  page,
}) => {
  await goStale();
  await page.goto("/admin/settings");

  /*
   * The page still reads — settings.view is not gated — but editing is closed
   * and says so. Letting someone type into a form that throws them to the
   * confirm screen on Save, losing what they typed, is the failure this avoids.
   */
  await expect(
    page.getByText("Confirm your password to make changes"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save settings" })).toBeHidden();
  // Still readable.
  await expect(page.getByLabel("Store name")).toHaveValue("DRPHONE");
});

test("confirming the password reopens the screen and returns you to it", async ({
  page,
}) => {
  await goStale();
  await page.goto("/admin/settings");

  await page.getByRole("link", { name: "Confirm it is you" }).click();
  await expect(page).toHaveURL(/\/admin\/confirm\?next=/);

  await page.getByLabel("Your password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Confirm" }).click();

  // Back where it started, and now editable.
  await expect(page).toHaveURL("/admin/settings");
  await expect(page.getByRole("button", { name: "Save settings" })).toBeVisible();
  await expect(
    page.getByText("Confirm your password to make changes"),
  ).toBeHidden();
});

test("a wrong password does not unlock anything", async ({ page }) => {
  await goStale();
  await page.goto("/admin/confirm?next=/admin/settings");

  await page.getByLabel("Your password").fill("not-the-password");
  await page.getByRole("button", { name: "Confirm" }).click();

  /*
   * The text, not getByRole("alert"): Next renders its own route announcer as
   * <div role="alert" id="__next-route-announcer__"> on every page, so that
   * role is never unique in this app.
   */
  await expect(page.getByText("That password is not right.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/confirm/);

  // And the screen it guards is still closed.
  await page.goto("/admin/settings");
  await expect(page.getByRole("button", { name: "Save settings" })).toBeHidden();
});

test("next is validated, so the confirm screen is not an open redirect", async ({
  page,
}) => {
  await goStale();
  /*
   * A confirmation screen is exactly where someone would plant one: "confirm
   * your password, then continue to evil.example". Anything outside /admin
   * falls back to the dashboard.
   */
  await page.goto("/admin/confirm?next=https://evil.example/steal");

  await page.getByLabel("Your password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Confirm" }).click();

  await expect(page).toHaveURL("/admin");
});

test("the confirm screen itself is reachable while stale", async ({ page }) => {
  await goStale();
  // Gating it on a reauth-required permission would redirect it to itself,
  // forever. This is the test that would catch that regression.
  await page.goto("/admin/confirm");
  await expect(
    page.getByRole("heading", { name: "Confirm it is you" }),
  ).toBeVisible();
});
