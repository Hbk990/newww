import { expect, test } from "@playwright/test";

import { storageStateFor } from "./global-setup";

/*
 * Pre-signed sessions rather than the login form.
 *
 * The throttle counts every attempt and allows eight per identifier per
 * fifteen minutes. Four tests here signing in as admin, on top of the auth and
 * headers specs doing the same, locked the suite out partway through — the
 * failure arrived as "Too many attempts" on a screen that had nothing to do
 * with signing in.
 */
const asAdmin = { storageState: storageStateFor("admin") };
const asStaff = { storageState: storageStateFor("staff") };

test.use(asAdmin);

test("an admin sees the seeded zones and their rates", async ({ page }) => {
  await page.goto("/admin/shipping");

  await expect(page.getByRole("heading", { name: "Delivery zones" })).toBeVisible();

  for (const zone of ["Beirut", "Mount Lebanon", "Rest of Lebanon"]) {
    await expect(page.getByRole("heading", { name: zone })).toBeVisible();
  }

  // The rate migration 0023 seeded for Beirut. Scoped to the row so the $3.00
  // and $5.00 of the other zones cannot satisfy it.
  const beirut = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Beirut" }) });
  await expect(beirut.getByText("$2.00")).toBeVisible();
});

test("every governorate is covered, so nothing is silently undeliverable", async ({
  page,
}) => {
  await page.goto("/admin/shipping");

  /*
   * The seeded zones between them must cover all eight governorates. A region
   * no zone claims is an address checkout refuses, and the only symptom is a
   * shopper who never completes an order — so the screen names them and this
   * asserts the warning is absent.
   */
  await expect(page.getByText("Not covered by any zone")).toBeHidden();
});

test.describe("as staff", () => {
  test.use(asStaff);

  test("staff may read the zones but not change them", async ({ page }) => {
    await page.goto("/admin/shipping");

    // settings.view is granted to staff, settings.edit is not.
    await expect(page).toHaveURL("/admin/shipping");
    await expect(page.getByRole("heading", { name: "Beirut" })).toBeVisible();

    await expect(page.getByRole("button", { name: "Add a zone" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  });
});

test("the last rate in a zone cannot be deleted", async ({ page }) => {
  await page.goto("/admin/shipping");

  /*
   * Deleting a zone's only rate drops its regions from the quotes altogether,
   * so they quietly become undeliverable — the same outcome as deleting the
   * zone, reached by a route that does not look like it. The action refuses and
   * says which to do instead.
   */
  const beirut = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Beirut" }) });

  await beirut.getByRole("button", { name: "Delete" }).last().click();

  await expect(
    page.getByText(/only rate in this zone/i),
  ).toBeVisible();

  // And it is still there.
  await expect(beirut.getByText("$2.00")).toBeVisible();
});
