import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { storageStateFor } from "./global-setup";

const sql = postgres(
  process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  { max: 1 },
);

test.afterAll(async () => {
  // Whatever a test left on, put back. These are shop-wide switches and a
  // leaked `maintenance_mode = true` would fail every later storefront test
  // with a confusing holding page.
  await sql`
    update store_settings
    set maintenance_mode = false, is_private = true,
        free_delivery_threshold_cents = null, order_number_prefix = 'DR'
  `;
  await sql.end();
});

test.describe("the settings screen", () => {
  test.use({ storageState: storageStateFor("admin") });

  test("shows the seeded row, with currency and tax fixed", async ({ page }) => {
    await page.goto("/admin/settings");

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByLabel("Store name")).toHaveValue("DRPHONE");
    await expect(page.getByLabel("Order number prefix")).toHaveValue("DR");

    /*
     * Currency and tax are displayed, not editable. Tax is zero and prices are
     * entered inclusive of it, so an editable rate would be an invitation to
     * add it twice.
     */
    await expect(page.getByText("None — prices include it")).toBeVisible();
    await expect(page.getByText("USD", { exact: true })).toBeVisible();
  });

  test("saving the free-delivery threshold reaches the database", async ({
    page,
  }) => {
    await page.goto("/admin/settings");

    await page.getByLabel("Free delivery over").fill("40");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();

    const [row] = await sql<{ cents: number | null }[]>`
      select free_delivery_threshold_cents as cents from store_settings
    `;
    expect(row!.cents).toBe(4000);
  });

  test("only what changed is written to the audit log", async ({ page }) => {
    await page.goto("/admin/settings");

    const before = await sql<{ n: number }[]>`
      select count(*)::int as n from audit_log where entity_type = 'store_settings'
    `;

    await page.getByLabel("Order number prefix").fill("DRX");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();

    const [entry] = await sql<{ new_value: Record<string, unknown> }[]>`
      select new_value from audit_log
      where entity_type = 'store_settings'
      order by created_at desc limit 1
    `;
    expect(await sql<{ n: number }[]>`
      select count(*)::int as n from audit_log where entity_type = 'store_settings'
    `.then((r) => r[0]!.n)).toBe(before[0]!.n + 1);

    // The one field touched, not the whole row — "who turned maintenance mode
    // on" is the question this log exists to answer.
    expect(Object.keys(entry!.new_value)).toEqual(["orderNumberPrefix"]);
  });
});

test.describe("staff may read settings but not save them", () => {
  test.use({ storageState: storageStateFor("staff") });

  test("the save button is absent", async ({ page }) => {
    await page.goto("/admin/settings");
    // settings.view is granted to staff; settings.edit is not.
    await expect(page.getByLabel("Store name")).toHaveValue("DRPHONE");
    await expect(
      page.getByRole("button", { name: "Save settings" }),
    ).toBeHidden();
    await expect(
      page.getByText("You can read these but not change them."),
    ).toBeVisible();
  });
});

test.describe("maintenance mode", () => {
  test("a shopper sees the holding page and staff do not", async ({
    page,
    browser,
  }) => {
    await sql`
      update store_settings
      set maintenance_mode = true,
          maintenance_message = 'Back in an hour — call us.',
          phone = '+961 1 000 000'
    `;

    // A shopper: no session at all.
    await page.goto("/cart");
    await expect(page.getByText("Back in an hour — call us.")).toBeVisible();
    await expect(page.getByText("+961 1 000 000")).toBeVisible();
    // The basket itself must not render behind the holding page.
    await expect(page.getByRole("heading", { name: "Your basket" })).toBeHidden();

    /*
     * Staff pass through. The point of maintenance mode is to work on the shop
     * while shoppers cannot see it, so locking staff out of the storefront
     * would defeat it.
     */
    const staffContext = await browser.newContext({
      storageState: storageStateFor("staff"),
    });
    const staffPage = await staffContext.newPage();
    await staffPage.goto("/cart");
    await expect(
      staffPage.getByRole("heading", { name: "Your basket" }),
    ).toBeVisible();
    await staffContext.close();
  });

  test("the admin area stays reachable while it is on", async ({ browser }) => {
    await sql`update store_settings set maintenance_mode = true`;

    const context = await browser.newContext({
      storageState: storageStateFor("admin"),
    });
    const page = await context.newPage();
    await page.goto("/admin/settings");
    // The gate lives in the (shop) route group, so it cannot reach admin — the
    // one way maintenance mode could lock someone out of turning it off again.
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await context.close();
  });
});

test.describe("isPrivate", () => {
  test("sends noindex while private, and stops once public", async ({ page }) => {
    /*
     * A meta tag, not an X-Robots-Tag header — Next's `robots` metadata emits
     * the tag. Both are honoured by crawlers; asserting the header passed
     * vacuously against an empty string, which is why this reads the DOM.
     */
    const robots = page.locator('meta[name="robots"]');

    await sql`update store_settings set is_private = true, maintenance_mode = false`;
    await page.goto("/");
    await expect(robots).toHaveAttribute("content", /noindex/i);

    await sql`update store_settings set is_private = false`;
    await page.goto("/");
    // Absent entirely once public, rather than present saying "index".
    await expect(robots).toHaveCount(0);
  });
});
