import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { ACCOUNTS, TEST_PASSWORD } from "./global-setup";

/**
 * Ordering requires an account. Browsing and filling a basket do not.
 *
 * That split is the whole design: asking for an account before someone has
 * chosen anything loses the sale, and asking after they have typed an address
 * wastes their time. So the requirement lands exactly at the point of
 * ordering, and the basket survives the detour.
 */
const sql = postgres(
  process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  { max: 1 },
);

const stamp = Date.now();
const SLUG = `e2e-guard-${stamp}`;
let productId = "";
let variantId = "";
let customerId = "";

test.beforeAll(async () => {
  const [product] = await sql<{ id: string }[]>`
    insert into products (slug, title, status, published_at)
    values (${SLUG}, 'E2E Guard Cable', 'active', now())
    returning id
  `;
  productId = product!.id;

  const [variant] = await sql<{ id: string }[]>`
    insert into variants (product_id, title, sku, price_cents)
    values (${productId}, 'Default', ${SLUG}, 1200)
    returning id
  `;
  variantId = variant!.id;

  const [user] = await sql<{ id: string }[]>`
    select id from users where email = ${ACCOUNTS.customer.email}
  `;
  customerId = user!.id;
});

test.afterAll(async () => {
  await sql`delete from cart_items where variant_id = ${variantId}`;
  await sql`delete from inventory_reservations where variant_id = ${variantId}`;
  await sql`delete from variants where id = ${variantId}`;
  await sql`delete from products where id = ${productId}`;
  await sql.end();
});

test("a guest can fill a basket but is asked to sign in to order", async ({
  page,
}) => {
  await page.goto(`/products/${SLUG}`);
  await page.getByRole("button", { name: "Add to basket" }).click();
  await expect(page.getByRole("status")).toContainText("in your basket");

  await page.goto("/cart");
  await expect(
    page.getByRole("link", { name: "Sign in to order" }),
  ).toBeVisible();
  // No "Checkout" button for a guest — the requirement is stated here, with
  // the basket in front of them, rather than after a filled-in form.
  await expect(
    page.getByRole("link", { name: "Checkout", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Your basket comes with you")).toBeVisible();
});

test("the checkout page turns a guest away", async ({ page }) => {
  await page.goto("/products/" + SLUG);
  await page.getByRole("button", { name: "Add to basket" }).click();
  await expect(page.getByRole("status")).toContainText("in your basket");

  await page.goto("/checkout");
  await expect(page).toHaveURL("/login?next=%2Fcheckout");
});

test("signing in returns the shopper to checkout with the basket intact", async ({
  page,
}) => {
  await page.goto(`/products/${SLUG}`);
  await page.getByRole("button", { name: "Add to basket" }).click();
  await expect(page.getByRole("status")).toContainText("in your basket");

  await page.goto("/cart");
  await page.getByRole("link", { name: "Sign in to order" }).click();
  await expect(page).toHaveURL("/login?next=%2Fcheckout");

  await page.getByLabel("Email or username").fill(ACCOUNTS.customer.email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  /*
   * Straight back to the checkout — not the home page — and the guest basket
   * came along, which is `adoptGuestCart` doing its job. Both halves matter:
   * a shopper dropped on the home page with an empty basket has been made to
   * start again for no reason.
   */
  await expect(page).toHaveURL("/checkout");
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();

  const lines = await sql<{ n: number }[]>`
    select count(*)::int as n
    from cart_items ci
    join carts c on c.id = ci.cart_id
    where ci.variant_id = ${variantId} and c.user_id = ${customerId}
  `;
  expect(lines[0]!.n).toBe(1);

  // Tidy up: this cart belongs to the shared test customer now.
  await sql`
    delete from cart_items
    where variant_id = ${variantId}
      and cart_id in (select id from carts where user_id = ${customerId})
  `;
});

test("a redirect cannot be pointed off the site", async ({ page }) => {
  /*
   * An unchecked `next` on a sign-in page is an open redirect: "sign in, then
   * continue to evil.example", with our domain in the address bar while the
   * password is typed. safeShopReturn refuses it and sends them home instead.
   */
  await page.goto("/login?next=https%3A%2F%2Fevil.example%2Fsteal");
  await page.getByLabel("Email or username").fill(ACCOUNTS.customer.email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/");
});
