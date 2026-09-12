import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { ACCOUNTS, storageStateFor } from "./global-setup";

/**
 * The address book.
 *
 * Driven through the UI rather than seeded, then checked in SQL. The rules
 * worth proving are the ones a shopper never sees directly: exactly one
 * default at all times, and a deleted default promoting a survivor so the
 * checkout keeps prefilling.
 */
const sql = postgres(
  process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  { max: 1 },
);

const stamp = Date.now();
const SLUG = `addr-prod-${stamp}`;
let customerId = "";
let productId = "";
let variantId = "";

const book = () => sql<
  { label: string | null; city: string; is_default: boolean }[]
>`
  select label, city, is_default from addresses
  where user_id = ${customerId}
  order by is_default desc, created_at desc
`;

test.beforeAll(async () => {
  const [user] = await sql<{ id: string }[]>`
    select id from users where email = ${ACCOUNTS.customer.email}
  `;
  customerId = user!.id;
  await sql`delete from addresses where user_id = ${customerId}`;

  // Something to put in a basket, for the prefill test at the end.
  const [product] = await sql<{ id: string }[]>`
    insert into products (slug, title, status, published_at, in_stock)
    values (${SLUG}, 'Address Spec Cable', 'active', now(), true)
    returning id
  `;
  productId = product!.id;
  const [variant] = await sql<{ id: string }[]>`
    insert into variants (product_id, title, sku, price_cents)
    values (${productId}, 'Default', ${SLUG}, 900)
    returning id
  `;
  variantId = variant!.id;
});

test.afterAll(async () => {
  await sql`delete from addresses where user_id = ${customerId}`;
  await sql`delete from cart_items where variant_id = ${variantId}`;
  await sql`delete from inventory_reservations where variant_id = ${variantId}`;
  await sql`delete from variants where id = ${variantId}`;
  await sql`delete from products where id = ${productId}`;
  await sql.end();
});

test.use({ storageState: storageStateFor("customer") });

test("adding, defaulting, editing and removing keeps exactly one default", async ({
  page,
}) => {
  await sql`delete from addresses where user_id = ${customerId}`;
  await page.goto("/account/addresses");
  await expect(page.getByText("Nothing saved yet.")).toBeVisible();

  // ---- the first one, which becomes the default without being asked
  await page.getByRole("button", { name: "Add an address" }).click();
  await page.getByLabel("Name this place").fill("Home");
  await page.getByLabel("Who the driver asks for").fill("Spec Customer");
  await page.getByLabel("Phone").fill("+961 70 000 001");
  await page.getByLabel("Street address").fill("Hamra Street 12");
  await page.getByLabel("City or town").fill("Hamra");
  await page.getByLabel("Governorate").selectOption("Beirut");
  await page.getByRole("button", { name: "Add address" }).click();

  // The form closing is the observable effect; reading SQL before it does is a
  // race, and it is the race that loses.
  await expect(
    page.getByRole("button", { name: "Add an address" }),
  ).toBeVisible();
  await expect(page.getByText("default", { exact: true })).toBeVisible();
  expect(await book()).toEqual([
    { label: "Home", city: "Hamra", is_default: true },
  ]);

  // ---- a second one does not steal the default
  await page.getByRole("button", { name: "Add an address" }).click();
  await page.getByLabel("Name this place").fill("Work");
  await page.getByLabel("Who the driver asks for").fill("Spec Customer");
  await page.getByLabel("Phone").fill("+961 70 000 002");
  await page.getByLabel("Street address").fill("Jal el Dib main road");
  await page.getByLabel("City or town").fill("Jal el Dib");
  await page.getByLabel("Governorate").selectOption("Mount Lebanon");
  await page.getByRole("button", { name: "Add address" }).click();
  await expect(
    page.getByRole("button", { name: "Add an address" }),
  ).toBeVisible();

  expect(await book()).toEqual([
    { label: "Home", city: "Hamra", is_default: true },
    { label: "Work", city: "Jal el Dib", is_default: false },
  ]);

  // ---- promoting the second clears the first, in one transaction
  // Scoped to the address list: the header, footer and account nav are full
  // of list items too.
  const list = page.getByRole("list", { name: "Saved addresses" });
  const work = list.getByRole("listitem").filter({ hasText: "Work" });
  await work.getByRole("button", { name: "Use by default" }).click();
  await expect(work.getByText("default", { exact: true })).toBeVisible();

  expect(await book()).toEqual([
    { label: "Work", city: "Jal el Dib", is_default: true },
    { label: "Home", city: "Hamra", is_default: false },
  ]);

  // ---- editing changes the row rather than adding another
  await list
    .getByRole("listitem")
    .filter({ hasText: "Home" })
    .getByRole("button", { name: "Edit" })
    .click();
  await page.getByLabel("Name this place").fill("Mum");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("button", { name: "Add an address" }),
  ).toBeVisible();

  expect(await book()).toEqual([
    { label: "Work", city: "Jal el Dib", is_default: true },
    { label: "Mum", city: "Hamra", is_default: false },
  ]);

  // ---- removing asks first
  const mum = list.getByRole("listitem").filter({ hasText: "Mum" });
  await mum.getByRole("button", { name: "Remove" }).click();
  await expect(mum.getByRole("button", { name: "Keep" })).toBeVisible();
  await mum.getByRole("button", { name: "Keep" }).click();
  expect(await book()).toHaveLength(2);

  // ---- removing the default promotes the survivor, so a customer who had a
  // default still has one and the checkout keeps prefilling
  const workRow = list.getByRole("listitem").filter({ hasText: "Work" });
  await workRow.getByRole("button", { name: "Remove" }).click();
  await workRow.getByRole("button", { name: "Really remove" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);

  expect(await book()).toEqual([
    { label: "Mum", city: "Hamra", is_default: true },
  ]);
});

test("the checkout fills itself in from the default address", async ({
  page,
}) => {
  await sql`delete from addresses where user_id = ${customerId}`;
  await sql`
    insert into addresses
      (user_id, label, name, phone, line1, city, region, country, is_default)
    values
      (${customerId}, 'Home', 'Prefill Customer', '+961 70 999 888',
       'Sioufi Street 4', 'Achrafieh', 'Beirut', 'LB', true)
  `;

  await page.goto(`/products/${SLUG}`);
  await page.getByRole("button", { name: "Add to basket" }).click();
  await expect(page.getByRole("status")).toContainText("in your basket");

  await page.goto("/checkout");
  await expect(page.getByText(/Filled in from your last order/)).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("Prefill Customer");
  await expect(page.getByLabel("Phone")).toHaveValue("+961 70 999 888");
  await expect(page.getByLabel("Street address")).toHaveValue(
    "Sioufi Street 4",
  );
  await expect(page.getByLabel("City or town")).toHaveValue("Achrafieh");
  // The governorate too, which is what sets the delivery fee.
  await expect(page.getByLabel("Governorate")).toHaveValue("Beirut");

  await sql`
    delete from cart_items
    where variant_id = ${variantId}
      and cart_id in (select id from carts where user_id = ${customerId})
  `;
});

test("the account pages are inside the shop, not a separate site", async ({
  page,
}) => {
  /*
   * These pages used to sit outside the storefront route group, so tapping
   * "Account" dropped the customer out of the header, footer, tab bar and
   * brand palette mid-visit. This is the assertion that keeps them in.
   */
  await page.goto("/account/addresses");

  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
  const accountNav = page.getByRole("navigation", {
    name: "Account sections",
  });
  await expect(accountNav).toBeVisible();
  await expect(
    accountNav.getByRole("link", { name: "Saved items" }),
  ).toBeVisible();
});
