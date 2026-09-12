import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { storageStateFor } from "./global-setup";

/**
 * Stock comes back when an order will not be delivered.
 *
 * `return_stock` had no callers at all before this, so every cancellation
 * leaked units permanently: claim_stock took them at checkout and nothing put
 * them back. The leak was invisible — the order looked correctly cancelled and
 * only a stock count months later would disagree with the shelf. These tests
 * assert the shelf, not the screen.
 */
const sql = postgres(
  process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  { max: 1 },
);

test.use({ storageState: storageStateFor("admin") });

const stamp = Date.now();

type Fixture = {
  orderId: string;
  trackedId: string;
  untrackedId: string;
};

/**
 * An order past the confirmation call, holding one counted line and one
 * uncounted one, with its stock already claimed exactly as checkout would.
 */
async function anOrder(status: string, suffix: string): Promise<Fixture> {
  const [product] = await sql<{ id: string }[]>`
    insert into products (slug, title, status)
    values (${`ret-${stamp}-${suffix}`}, 'Return Test', 'active')
    returning id
  `;
  const [tracked] = await sql<{ id: string }[]>`
    insert into variants (product_id, title, sku, price_cents)
    values (${product!.id}, 'Counted', ${`RET-T-${stamp}-${suffix}`}, 1000)
    returning id
  `;
  const [untracked] = await sql<{ id: string }[]>`
    insert into variants (product_id, title, sku, price_cents)
    values (${product!.id}, 'Uncounted', ${`RET-U-${stamp}-${suffix}`}, 1000)
    returning id
  `;
  await sql`
    update inventory set track = true, on_hand = 10, policy = 'deny'
    where variant_id = ${tracked!.id}
  `;

  const [orderNumber] = await sql<{ next_order_number: string }[]>`
    select next_order_number()
  `;
  const [order] = await sql<{ id: string }[]>`
    insert into orders (
      order_number, email, phone, shipping_address, subtotal_cents,
      shipping_cents, tax_cents, discount_cents, total_cents, source, status
    ) values (
      ${orderNumber!.next_order_number}, 'ret@drphone.test', '+961 70 000 000',
      ${sql.json({ line1: "Hamra", city: "Beirut", region: "Beirut", country: "LB" })},
      3000, 200, 0, 0, 3200, 'web', ${status}::order_status
    ) returning id
  `;

  for (const variantId of [tracked!.id, untracked!.id]) {
    await sql`
      insert into order_items (
        order_id, variant_id, product_id, product_title, variant_title,
        unit_price_cents, quantity, total_cents
      ) values (
        ${order!.id}, ${variantId}, ${product!.id}, 'Return Test', 'x',
        1000, 2, 2000
      )
    `;
    // Claimed the way checkout claims it, so the return has something to undo.
    await sql`select claim_stock(${variantId}, 2, ${order!.id})`;
  }

  return {
    orderId: order!.id,
    trackedId: tracked!.id,
    untrackedId: untracked!.id,
  };
}

const onHand = async (variantId: string) => {
  const [row] = await sql<{ on_hand: number }[]>`
    select on_hand from inventory where variant_id = ${variantId}
  `;
  return row!.on_hand;
};

const ledger = async (variantId: string) => {
  const rows = await sql<{ delta: number; reason: string }[]>`
    select delta, reason from inventory_ledger
    where variant_id = ${variantId} order by created_at
  `;
  return rows;
};

test.afterAll(async () => {
  await sql.end();
});

test("cancelling puts counted stock back and records why", async ({ page }) => {
  const f = await anOrder("confirmed", "cancel");

  // Claimed at checkout: 10 less 2.
  expect(await onHand(f.trackedId)).toBe(8);

  await page.goto(`/admin/orders/${f.orderId}`);
  await page.getByRole("button", { name: "Cancel order" }).click();
  await page.getByRole("button", { name: "Yes, cancel" }).click();
  await expect(page.getByText(/Now cancelled/i)).toBeVisible();

  expect(await onHand(f.trackedId)).toBe(10);

  const entries = await ledger(f.trackedId);
  expect(entries.map((e) => [e.delta, e.reason])).toEqual([
    [-2, "sale"],
    [2, "cancellation"],
  ]);

  /*
   * The uncounted line moves nothing and writes nothing. claim_stock skipped
   * it, so a return would have invented stock — and a ledger showing a return
   * with no matching sale is a history that disagrees with itself.
   */
  expect(await onHand(f.untrackedId)).toBe(0);
  expect(await ledger(f.untrackedId)).toEqual([]);
});

test("a refused delivery puts stock back under its own reason", async ({
  page,
}) => {
  const f = await anOrder("out_for_delivery", "refuse");
  expect(await onHand(f.trackedId)).toBe(8);

  await page.goto(`/admin/orders/${f.orderId}`);
  await page
    .getByRole("button", { name: /Came back — refused or nobody home/ })
    .click();
  await expect(page.getByText(/Now came back/i)).toBeVisible();

  expect(await onHand(f.trackedId)).toBe(10);

  // Its own reason, so the ledger can tell a refusal from a cancellation — one
  // is a delivery that failed, the other an order that never left.
  const entries = await ledger(f.trackedId);
  expect(entries.map((e) => [e.delta, e.reason])).toEqual([
    [-2, "sale"],
    [2, "refused_delivery"],
  ]);
});

test("no money is marked collected on an order that came back", async ({
  page,
}) => {
  const f = await anOrder("out_for_delivery", "unpaid");

  await page.goto(`/admin/orders/${f.orderId}`);
  await page
    .getByRole("button", { name: /Came back — refused or nobody home/ })
    .click();
  await expect(page.getByText(/Now came back/i)).toBeVisible();

  /*
   * With cash on delivery the money arrives at the door, so an order that came
   * back was never paid. Only `delivered` sets paid — this pins that a refusal
   * does not.
   */
  const [order] = await sql<{ status: string; payment_status: string }[]>`
    select status, payment_status from orders where id = ${f.orderId}
  `;
  expect(order).toMatchObject({ status: "returned", payment_status: "unpaid" });
});

test("a cancelled order offers no further moves, so stock cannot be returned twice", async ({
  page,
}) => {
  const f = await anOrder("confirmed", "twice");

  await page.goto(`/admin/orders/${f.orderId}`);
  await page.getByRole("button", { name: "Cancel order" }).click();
  await page.getByRole("button", { name: "Yes, cancel" }).click();
  await expect(page.getByText(/Now cancelled/i)).toBeVisible();

  expect(await onHand(f.trackedId)).toBe(10);

  // NEXT_STATUS gives `cancelled` no onward moves, which is what makes a
  // double-return impossible without a guard of its own.
  await page.reload();
  await expect(page.getByRole("button", { name: "Cancel order" })).toBeHidden();
  await expect(
    page.getByRole("button", { name: /^Mark |^Delivered|^Came back/ }),
  ).toHaveCount(0);

  expect(await onHand(f.trackedId)).toBe(10);
});
