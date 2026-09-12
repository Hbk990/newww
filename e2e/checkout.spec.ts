import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { ACCOUNTS, storageStateFor } from "./global-setup";

/**
 * Checkout, end to end, with the database checked afterwards.
 *
 * The browser half proves the pages are wired together. The database half is
 * the point: an order that renders a thank-you page while leaving stock
 * unclaimed, or a cart still active, or a hold still held, looks completely
 * correct to the shopper and is wrong in the ways that cost money.
 *
 * Signed in throughout, because ordering now requires an account. The guest
 * side of that rule is covered in e2e/account-required.spec.ts.
 */
const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

const sql = postgres(url, { max: 1 });

// Distinct per run, so a previous run's leftovers cannot satisfy an assertion.
const stamp = Date.now();
const SLUG = `e2e-checkout-${stamp}`;
const SKU = `E2E-CO-${stamp}`;
const CART_TOKEN = `e2e-cart-${stamp}`;

let variantId = "";
let cartId = "";
let customerId = "";

test.use({ storageState: storageStateFor("customer") });

test.beforeAll(async () => {
  const [user] = await sql<{ id: string }[]>`
    select id from users where email = ${ACCOUNTS.customer.email}
  `;
  customerId = user!.id;
  // The checkout keeps the address it was given; start from nothing so the
  // form is not prefilled by a previous run.
  await sql`delete from addresses where user_id = ${customerId}`;

  const [product] = await sql<{ id: string }[]>`
    insert into products (slug, title, status)
    values (${SLUG}, 'E2E Checkout Widget', 'active')
    returning id
  `;
  const [variant] = await sql<{ id: string }[]>`
    insert into variants (product_id, title, sku, price_cents)
    values (${product!.id}, 'Standard', ${SKU}, 2500)
    returning id
  `;
  variantId = variant!.id;

  // Tracked with 5 on the shelf, so the claim is observable as a decrement.
  // The inventory row itself already exists — migration 0021's trigger made it.
  await sql`
    update inventory set track = true, on_hand = 5, reserved = 0, policy = 'deny'
    where variant_id = ${variantId}
  `;

  const [cart] = await sql<{ id: string }[]>`
    insert into carts (token) values (${CART_TOKEN}) returning id
  `;
  cartId = cart!.id;

  await sql`
    insert into cart_items (cart_id, variant_id, quantity, unit_price_cents)
    values (${cartId}, ${variantId}, 2, 2500)
  `;
  // Through the real function, so the hold is exactly what a shopper's would be.
  await sql`select reserve_stock(${variantId}, 2, ${cartId})`;
});

test.afterAll(async () => {
  await sql`delete from addresses where user_id = ${customerId}`;
  await sql`delete from cart_items where cart_id = ${cartId}`;
  await sql`select release_cart_reservations(${cartId})`;
  await sql`delete from carts where id = ${cartId}`;
  await sql.end();
});

test("a basket becomes an order, and the stock moves with it", async ({
  page,
  context,
}) => {
  // The hold is in place before checkout — this is the state that makes
  // claim_stock refuse unless createOrder releases it first.
  const [before] = await sql<{ on_hand: number; reserved: number }[]>`
    select on_hand, reserved from inventory where variant_id = ${variantId}
  `;
  expect(before).toMatchObject({ on_hand: 5, reserved: 2 });

  await context.addCookies([
    {
      name: "drphone_cart",
      value: CART_TOKEN,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.goto("/cart");
  // exact: true — the screen-reader label on the quantity field ("Quantity for
  // E2E Checkout Widget Standard") also contains the title, and a loose
  // locator matches both.
  await expect(
    page.getByText("E2E Checkout Widget", { exact: true }),
  ).toBeVisible();

  /*
   * exact: true — the basket now links each product title to its page, and this
   * product is called "E2E Checkout Widget". Role-name matching is a substring
   * match by default, so the loose locator finds the product link as well as
   * the checkout button.
   */
  await page.getByRole("link", { name: "Checkout", exact: true }).click();
  await expect(page).toHaveURL("/checkout");

  await page.getByLabel("Name").fill("E2E Customer");
  await page.getByLabel("Phone").fill("+961 70 123 456");
  await page.getByLabel("Email").fill("e2e-checkout@drphone.test");
  await page.getByLabel("Street address").fill("Hamra Street 12");
  await page.getByLabel("City or town").fill("Hamra");
  // Beirut's zone rate is $2.00, seeded by migration 0023 — not the flat $3
  // the provisional constant charged everywhere.
  await page.getByLabel("Governorate").selectOption("Beirut");

  await page.getByRole("button", { name: "Place order" }).click();

  await expect(page).toHaveURL(/\/checkout\/thanks\?order=/);
  // A heading, not body text: the streamed RSC payload sits inside the page's
  // own script tags, so body text matches things that were never rendered.
  await expect(
    page.getByRole("heading", { name: /your order is in/i }),
  ).toBeVisible();

  const orderNumber = new URL(page.url()).searchParams.get("order");
  expect(orderNumber, "no order number in the URL").toBeTruthy();

  /*
   * The details are kept for next time — the reason an account is required at
   * all. One row, marked default, holding what was typed above.
   */
  const saved = await sql<
    { name: string; phone: string; line1: string; city: string; region: string; is_default: boolean }[]
  >`
    select name, phone, line1, city, region, is_default
    from addresses where user_id = ${customerId}
  `;
  expect(saved).toEqual([
    {
      name: "E2E Customer",
      phone: "+961 70 123 456",
      line1: "Hamra Street 12",
      city: "Hamra",
      region: "Beirut",
      is_default: true,
    },
  ]);

  const [order] = await sql<
    {
      id: string;
      status: string;
      payment_status: string;
      subtotal_cents: number;
      shipping_cents: number;
      total_cents: number;
      source: string;
      email: string;
    }[]
  >`
    select id, status, payment_status, subtotal_cents, shipping_cents,
           total_cents, source, email
    from orders where order_number = ${orderNumber!}
  `;
  expect(order, `no order row for ${orderNumber}`).toBeTruthy();
  expect(order).toMatchObject({
    // Awaiting the confirmation call, exactly as a phone order does — with cash
    // on delivery that call is what replaces payment.
    status: "new",
    payment_status: "unpaid",
    source: "web",
    email: "e2e-checkout@drphone.test",
    subtotal_cents: 5000,
    shipping_cents: 200,
    total_cents: 5200,
  });

  const [item] = await sql<{ quantity: number; unit_price_cents: number }[]>`
    select quantity, unit_price_cents from order_items where order_id = ${order!.id}
  `;
  expect(item).toMatchObject({ quantity: 2, unit_price_cents: 2500 });

  /*
   * The three database facts worth more than the thank-you page.
   *
   * on_hand fell by two, the hold is gone rather than still held alongside the
   * sale, and the cart is retired so it cannot reappear as a basket the shopper
   * has already paid for — or be chased by an abandoned-cart email.
   */
  const [after] = await sql<{ on_hand: number; reserved: number }[]>`
    select on_hand, reserved from inventory where variant_id = ${variantId}
  `;
  expect(after).toMatchObject({ on_hand: 3, reserved: 0 });

  const [holds] = await sql<{ n: number }[]>`
    select count(*)::int as n from inventory_reservations where cart_id = ${cartId}
  `;
  expect(holds!.n).toBe(0);

  const [cart] = await sql<{ status: string }[]>`
    select status from carts where id = ${cartId}
  `;
  expect(cart!.status).toBe("converted");

  // The sale is in the ledger, which is what makes a discrepancy investigable.
  const [ledger] = await sql<{ delta: number; reason: string }[]>`
    select delta, reason from inventory_ledger
    where variant_id = ${variantId} and reference_id = ${order!.id}
  `;
  expect(ledger).toMatchObject({ delta: -2, reason: "sale" });
});

test("the emptied cart sends a returning shopper back to the basket", async ({
  page,
  context,
}) => {
  // The cart from the first test is converted now, so its cookie resolves to
  // nothing — checkout must not offer a form for an order that cannot exist.
  await context.addCookies([
    {
      name: "drphone_cart",
      value: CART_TOKEN,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.goto("/checkout");
  await expect(page).toHaveURL("/cart");
  await expect(page.getByText("There is nothing in it yet.")).toBeVisible();
});
