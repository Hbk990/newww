import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { ACCOUNTS, storageStateFor } from "./global-setup";

const sql = postgres(
  process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  { max: 1 },
);

const stamp = Date.now();
const slug = `pdp-${stamp}`;
let productId = "";
let customerId = "";
const variantIds: string[] = [];

test.beforeAll(async () => {
  const [user] = await sql<{ id: string }[]>`
    select id from users where email = ${ACCOUNTS.customer.email}
  `;
  customerId = user!.id;

  const [product] = await sql<{ id: string }[]>`
    insert into products (slug, title, status, short_description)
    values (${slug}, 'Testable Case', 'active', 'A case for testing.')
    returning id
  `;
  productId = product!.id;

  /*
   * Two variants and no option types, which is the shape the imported catalog
   * actually has: 700 multi-variant products and not one option type. The
   * picker's variant-list branch is the one most of this shop will use, so it
   * is the one under test here.
   *
   * The inventory row comes from the trigger added in migration 0021 —
   * untracked and available, so both variants are buyable.
   */
  for (const [index, [title, cents]] of (
    [
      ["Black", 1200],
      ["Clear", 1850],
    ] as const
  ).entries()) {
    const [variant] = await sql<{ id: string }[]>`
      insert into variants (product_id, title, sku, price_cents, position)
      values (${productId}, ${title}, ${`${slug}-${index}`}, ${cents}, ${index})
      returning id
    `;
    variantIds.push(variant!.id);
  }

  await sql`delete from wishlist_items where user_id = ${customerId}`;
  await sql`delete from recently_viewed where user_id = ${customerId}`;
});

test.afterAll(async () => {
  await sql`delete from wishlist_items where user_id = ${customerId}`;
  await sql`delete from recently_viewed where user_id = ${customerId}`;
  await sql`delete from cart_items where variant_id = any(${variantIds})`;
  await sql`delete from variants where product_id = ${productId}`;
  await sql`delete from products where id = ${productId}`;
  await sql.end();
});

test.describe("the product page, as a guest", () => {
  test("shows the product and prices each variant", async ({ page }) => {
    await page.goto(`/products/${slug}`);

    await expect(
      page.getByRole("heading", { name: "Testable Case", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("A case for testing.")).toBeVisible();

    // The cheaper variant opens, because the first purchasable one does.
    await expect(page.getByText("$12.00")).toBeVisible();

    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByText("$18.50")).toBeVisible();
    await expect(page.getByText("$12.00")).toBeHidden();

    // aria-pressed is what a screen reader reads as the current choice, so it
    // is what the test checks rather than a colour class.
    await expect(page.getByRole("button", { name: "Clear" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("adds the chosen variant to the basket", async ({ page }) => {
    await page.goto(`/products/${slug}`);
    await page.getByRole("button", { name: "Clear" }).click();
    await page.getByRole("button", { name: "Add to basket" }).click();

    await expect(page.getByRole("status")).toContainText("in your basket");

    await page.getByRole("link", { name: "Go to basket" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole("link", { name: "Testable Case" })).toBeVisible();
    // Scoped to the line: the same figure is also the basket subtotal, and an
    // unscoped locator matches both.
    await expect(
      page.getByRole("listitem").filter({ hasText: "Testable Case" }),
    ).toContainText("$18.50");

    // The line carries the variant that was picked, not the one that opened.
    const rows = await sql<{ variant_id: string; quantity: number }[]>`
      select variant_id, quantity from cart_items
      where variant_id = any(${variantIds})
    `;
    expect(rows).toEqual([{ variant_id: variantIds[1], quantity: 1 }]);

    // And the basket links back to the page, which is what the route existing
    // finally allows.
    await page.getByRole("link", { name: "Testable Case" }).click();
    await expect(page).toHaveURL(new RegExp(`/products/${slug}$`));

    await sql`delete from cart_items where variant_id = any(${variantIds})`;
  });

  test("asks a guest to sign in before saving", async ({ page }) => {
    await page.goto(`/products/${slug}`);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toContainText("Sign in to save");
  });

  test("404s on an unknown slug and on an archived product", async ({
    page,
  }) => {
    const missing = await page.goto("/products/not-a-real-product");
    expect(missing?.status()).toBe(404);

    /*
     * An archived product must not be reachable by URL. Its price and stock are
     * no longer maintained, so the page would be quietly wrong rather than
     * absent — which is worse.
     */
    await sql`update products set status = 'archived' where id = ${productId}`;
    const archived = await page.goto(`/products/${slug}`);
    expect(archived?.status()).toBe(404);
    await sql`update products set status = 'active' where id = ${productId}`;
  });

  test("offers WhatsApp only when a number is configured", async ({ page }) => {
    const ask = page.getByRole("link", { name: /WhatsApp/ });

    await sql`update store_settings set whatsapp_number = null`;
    await page.goto(`/products/${slug}`);
    await expect(ask).toHaveCount(0);

    await sql`update store_settings set whatsapp_number = '+961 71 000 000'`;
    await page.goto(`/products/${slug}`);
    // Punctuation and spaces are stripped, because wa.me takes digits only.
    await expect(ask).toHaveAttribute("href", /^https:\/\/wa\.me\/96171000000\?/);
    // The message names the product, so whoever answers knows what it is about.
    await expect(ask).toHaveAttribute("href", /Testable(\+|%20)Case/);

    await sql`update store_settings set whatsapp_number = null`;
  });
});

test.describe("the product page, signed in", () => {
  test.use({ storageState: storageStateFor("customer") });

  test("saves the product and records the view", async ({ page }) => {
    await page.goto(`/products/${slug}`);

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();

    await page.goto("/account/wishlist");
    await expect(page.getByRole("link", { name: "Testable Case" })).toBeVisible();

    /*
     * The view is recorded as a side effect of rendering, which is exactly the
     * kind of thing that silently stops working. `recordView` swallows its own
     * failures by design, so the table is the only place the truth shows.
     */
    const views = await sql<{ n: number }[]>`
      select count(*)::int as n from recently_viewed
      where user_id = ${customerId} and product_id = ${productId}
    `;
    expect(views[0]!.n).toBe(1);
  });

  test("says nothing about fitment for a product with none recorded", async ({
    page,
  }) => {
    /*
     * A product with no fitment rows is universal — a power bank fits everyone —
     * so the verdict is null and the page must stay quiet. Telling a customer a
     * case "does not fit your phone" because nobody recorded fitment would lose
     * a sale for no reason.
     */
    await page.goto(`/products/${slug}`);
    await expect(page.getByText(/does not fit any of the devices/)).toHaveCount(
      0,
    );
    await expect(page.getByText(/^Fits your /)).toHaveCount(0);
  });
});
