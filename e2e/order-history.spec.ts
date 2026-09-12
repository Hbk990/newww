import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { ACCOUNTS, storageStateFor } from "./global-setup";

/**
 * A customer's own orders.
 *
 * The account page apologised for not having this from the day it was written,
 * which was awkward once an account became the requirement to order at all.
 *
 * Two things here are worth more than the rendering: an order number is
 * sequential and therefore guessable, so the number must not be what
 * authorises access to it; and the lines are a snapshot, so renaming or
 * repricing a product must not change what a past order says was bought.
 */
const sql = postgres(
  process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  { max: 1 },
);

const stamp = Date.now();
const SLUG = `hist-${stamp}`;
const MINE = `DR-HIST-${stamp}-A`;
const THEIRS = `DR-HIST-${stamp}-B`;

let customerId = "";
let staffId = "";
let productId = "";
let variantId = "";

async function placeOrder(
  orderNumber: string,
  userId: string,
  status: string,
  paymentStatus: string,
) {
  const [order] = await sql<{ id: string }[]>`
    insert into orders (
      order_number, user_id, email, phone, status, payment_status,
      subtotal_cents, shipping_cents, total_cents, shipping_address,
      payment_method, source, placed_at
    ) values (
      ${orderNumber}, ${userId}, 'hist@drphone.test', '+961 70 000 000',
      ${sql.unsafe(`'${status}'::order_status`)},
      ${sql.unsafe(`'${paymentStatus}'::payment_status`)},
      2400, 200, 2600,
      ${sql.json({
        line1: "Hamra Street 12",
        building: "Najjar",
        floor: "3",
        city: "Hamra",
        region: "Beirut",
        country: "LB",
        directions: "Blue gate next to the pharmacy",
      })},
      'cod', 'web', now()
    ) returning id
  `;

  await sql`
    insert into order_items (
      order_id, variant_id, product_id, product_title, variant_title, sku,
      unit_price_cents, quantity, total_cents
    ) values (
      ${order!.id}, ${variantId}, ${productId},
      'History Cable', 'Two metre', ${SLUG}, 1200, 2, 2400
    )
  `;

  return order!.id;
}

test.beforeAll(async () => {
  const [customer] = await sql<{ id: string }[]>`
    select id from users where email = ${ACCOUNTS.customer.email}
  `;
  customerId = customer!.id;
  const [staff] = await sql<{ id: string }[]>`
    select id from users where email = ${ACCOUNTS.staff.email}
  `;
  staffId = staff!.id;

  const [product] = await sql<{ id: string }[]>`
    insert into products (slug, title, status, published_at, in_stock)
    values (${SLUG}, 'History Cable', 'active', now(), true)
    returning id
  `;
  productId = product!.id;

  const [variant] = await sql<{ id: string }[]>`
    insert into variants (product_id, title, sku, price_cents)
    values (${productId}, 'Two metre', ${SLUG}, 1200)
    returning id
  `;
  variantId = variant!.id;

  await placeOrder(MINE, customerId, "out_for_delivery", "unpaid");
  // Somebody else's, to prove a guessed number is not a way in.
  await placeOrder(THEIRS, staffId, "new", "unpaid");
});

test.afterAll(async () => {
  await sql`delete from order_items where product_id = ${productId}`;
  await sql`delete from orders where order_number in (${MINE}, ${THEIRS})`;
  await sql`delete from cart_items where variant_id = ${variantId}`;
  await sql`delete from inventory_reservations where variant_id = ${variantId}`;
  await sql`delete from variants where id = ${variantId}`;
  await sql`delete from products where id = ${productId}`;
  await sql.end();
});

test.use({ storageState: storageStateFor("customer") });

test("the list shows an order, what it cost and what is still owed", async ({
  page,
}) => {
  await page.goto("/account/orders");

  const list = page.getByRole("list", { name: "Your orders" });
  const row = list.getByRole("listitem").filter({ hasText: MINE });
  await expect(row).toBeVisible();

  // Words a person says out loud, not the database's own vocabulary.
  await expect(row).toContainText("On the way");
  await expect(row).not.toContainText("out_for_delivery");
  await expect(row).toContainText("$26.00");
  await expect(row).toContainText("to pay at the door");

  /*
   * Units and the lead title, both from correlated subqueries. This assertion
   * exists because they were silently returning nothing: Drizzle renders a
   * column unqualified inside a select-list template, so the correlation read
   * `oi.order_id = "id"` and matched no rows — no error, every order empty.
   * The first version of this spec passed anyway, because it never checked.
   */
  await expect(row).toContainText("2 items");
  await expect(row).toContainText("History Cable");

  // Someone else's order is not in this list.
  await expect(list.getByText(THEIRS)).toHaveCount(0);
});

test("the detail page shows the snapshot, the address and what to pay", async ({
  page,
}) => {
  await page.goto(`/account/orders/${MINE}`);

  await expect(
    page.getByRole("heading", { name: `Order ${MINE}`, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("On the way")).toBeVisible();
  await expect(page.getByText(/to pay the driver, in cash/)).toBeVisible();

  const items = page.getByRole("list", { name: "Items in this order" });
  await expect(items).toContainText("History Cable");
  await expect(items).toContainText("Two metre");
  await expect(items).toContainText("2 × $12.00");

  // The address the order was placed with, including the line that actually
  // gets a parcel delivered in Lebanon.
  await expect(page.getByText(/Hamra Street 12/)).toBeVisible();
  await expect(page.getByText("Blue gate next to the pharmacy")).toBeVisible();

  /*
   * Renaming and repricing the product must not rewrite the order. The lines
   * are a snapshot of what was bought, which is the difference between an
   * order history and a product listing.
   */
  await sql`
    update products set title = 'Renamed Entirely' where id = ${productId}
  `;
  await sql`update variants set price_cents = 9999 where id = ${variantId}`;

  await page.reload();
  await expect(items).toContainText("History Cable");
  await expect(items).toContainText("2 × $12.00");
  await expect(page.getByText("Renamed Entirely")).toHaveCount(0);

  await sql`update products set title = 'History Cable' where id = ${productId}`;
  await sql`update variants set price_cents = 1200 where id = ${variantId}`;
});

test("another customer's order number is not a way in", async ({ page }) => {
  /*
   * Order numbers are sequential, so this one is guessable by anyone holding
   * their own. The owner check lives in the query, and the answer for "exists
   * but not yours" is identical to "does not exist" — a different answer would
   * confirm the number is real.
   */
  const response = await page.goto(`/account/orders/${THEIRS}`);
  expect(response?.status()).toBe(404);

  const invented = await page.goto("/account/orders/DR-NOT-A-REAL-ORDER");
  expect(invented?.status()).toBe(404);
});

test("a past order can be put back in the basket", async ({ page }) => {
  await page.goto(`/account/orders/${MINE}`);
  await page.getByRole("button", { name: "Order this again" }).click();

  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "1 item added",
  );

  // Through the ordinary cart path, so the quantity and the price are today's.
  const lines = await sql<{ quantity: number }[]>`
    select ci.quantity
    from cart_items ci
    join carts c on c.id = ci.cart_id
    where ci.variant_id = ${variantId} and c.user_id = ${customerId}
  `;
  expect(lines).toEqual([{ quantity: 2 }]);

  await page.getByRole("link", { name: "Go to basket" }).click();
  await expect(page).toHaveURL(/\/cart$/);
  // A link, specifically: the quantity field's screen-reader label repeats the
  // title, so a text locator matches twice.
  await expect(
    page.getByRole("link", { name: "History Cable" }),
  ).toBeVisible();

  await sql`
    delete from cart_items
    where variant_id = ${variantId}
      and cart_id in (select id from carts where user_id = ${customerId})
  `;
});

test("an archived product is named rather than silently dropped", async ({
  page,
}) => {
  await sql`update products set status = 'archived' where id = ${productId}`;

  await page.goto(`/account/orders/${MINE}`);
  await page.getByRole("button", { name: "Order this again" }).click();

  /*
   * Nothing was addable, so this is a refusal rather than a partial success. A
   * basket that quietly contains less than was asked for is a problem the
   * customer discovers at the door.
   */
  // Scoped to main: Next's route announcer also carries role="alert".
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Nothing from that order is available right now.",
  );

  const lines = await sql<{ n: number }[]>`
    select count(*)::int as n from cart_items where variant_id = ${variantId}
  `;
  expect(lines[0]!.n).toBe(0);

  await sql`update products set status = 'active' where id = ${productId}`;
});
