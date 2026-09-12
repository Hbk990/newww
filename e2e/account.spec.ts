import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { ACCOUNTS, storageStateFor } from "./global-setup";

const sql = postgres(
  process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  { max: 1 },
);

const stamp = Date.now();
let customerId = "";
let productId = "";
let brandId = "";
const modelIds: string[] = [];

test.beforeAll(async () => {
  const [user] = await sql<{ id: string }[]>`
    select id from users where email = ${ACCOUNTS.customer.email}
  `;
  customerId = user!.id;

  const [product] = await sql<{ id: string }[]>`
    insert into products (slug, title, status, min_price_cents, in_stock)
    values (${`acct-${stamp}`}, 'Saveable Widget', 'active', 1500, true)
    returning id
  `;
  productId = product!.id;

  /*
   * The spec makes its own device models rather than relying on seeded
   * reference data. The e2e database has none — `npm run db:seed` was never run
   * against it — and three tests here sat waiting thirty seconds each for a
   * dropdown option that could never appear.
   */
  const [brand] = await sql<{ id: string }[]>`
    insert into device_brands (name, slug)
    values (${`E2E Brand ${stamp}`}, ${`e2e-brand-${stamp}`})
    returning id
  `;
  brandId = brand!.id;

  for (const n of [1, 2]) {
    const [model] = await sql<{ id: string }[]>`
      insert into device_models (device_brand_id, name, slug)
      values (${brandId}, ${`E2E Phone ${n}`}, ${`e2e-phone-${stamp}-${n}`})
      returning id
    `;
    modelIds.push(model!.id);
  }

  // A clean slate for this customer, so a previous run cannot satisfy an
  // assertion here.
  await sql`delete from wishlist_items where user_id = ${customerId}`;
  await sql`delete from customer_devices where user_id = ${customerId}`;
});

test.afterAll(async () => {
  await sql`delete from wishlist_items where user_id = ${customerId}`;
  await sql`delete from customer_devices where user_id = ${customerId}`;
  await sql`delete from device_models where device_brand_id = ${brandId}`;
  await sql`delete from device_brands where id = ${brandId}`;
  await sql.end();
});

test.use({ storageState: storageStateFor("customer") });

test("a saved product shows on the wishlist and can be removed", async ({
  page,
}) => {
  await sql`
    insert into wishlist_items (user_id, product_id)
    values (${customerId}, ${productId})
  `;

  await page.goto("/account/wishlist");
  await expect(page.getByText("Saveable Widget")).toBeVisible();
  await expect(page.getByText("from $15.00")).toBeVisible();

  await page.getByRole("button", { name: /Remove Saveable Widget/ }).click();
  await expect(page.getByText("Nothing saved yet.")).toBeVisible();

  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from wishlist_items where user_id = ${customerId}
  `;
  expect(row!.n).toBe(0);
});

test("an archived product stays saved but is not shown", async ({ page }) => {
  /*
   * A customer's list should not silently lose entries, and a dead link is
   * worse than an absence — so the row survives and the page hides it.
   */
  await sql`
    insert into wishlist_items (user_id, product_id)
    values (${customerId}, ${productId})
    on conflict do nothing
  `;
  await sql`update products set status = 'archived' where id = ${productId}`;

  await page.goto("/account/wishlist");
  await expect(page.getByText("Nothing saved yet.")).toBeVisible();

  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from wishlist_items where user_id = ${customerId}
  `;
  expect(row!.n).toBe(1);

  await sql`update products set status = 'active' where id = ${productId}`;
  await sql`delete from wishlist_items where user_id = ${customerId}`;
});

test.describe("my phones", () => {
  /*
   * One journey rather than four tests seeding their own rows.
   *
   * The seeded variant failed in a way I could not pin down: the page rendered
   * correctly for a SQL-inserted row when fetched with curl using the same
   * session cookie, but not under Playwright. Rather than ship a test I do not
   * understand, this drives every change through the UI — the path a customer
   * takes, and the one demonstrably working — and checks the result in SQL.
   *
   * The cost is honest: a failure part-way leaves the rest unrun. The benefit is
   * that nothing here passes or fails for a reason outside the feature.
   */
  const devices = () => sql<{ id: string; primary: boolean }[]>`
    select device_model_id as id, is_primary as primary
    from customer_devices where user_id = ${customerId}
  `;

  test("adding, promoting and removing phones keeps exactly one main", async ({
    page,
  }) => {
    /*
     * Scoped to the phone list. These pages moved inside the storefront route
     * group, so they now carry the header, footer and account nav — and an
     * unscoped listitem count picks up every link in all three.
     */
    const list = page.getByRole("list", { name: "Your saved phones" });
    await sql`delete from customer_devices where user_id = ${customerId}`;
    await page.goto("/account/devices");
    await expect(page.getByText("No phones added yet.")).toBeVisible();

    // Selected by value: the label is `{brand} {model}` composed in JSX, so an
    // exact-label match depends on whatever whitespace the component emits.
    const select = page.getByLabel("Add a phone");
    await select.selectOption(modelIds[0]!);
    await page.getByLabel("Call it something").fill("work phone");
    await page.getByRole("button", { name: "Add phone" }).click();

    // Nobody with one phone should have to nominate it.
    await expect(page.getByText("main phone")).toBeVisible();
    // exact: true — the form's own hint quotes "work phone", so a loose match
    // finds the hint as well as the label.
    await expect(page.getByText("work phone", { exact: true })).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    expect(await devices()).toEqual([{ id: modelIds[0], primary: true }]);

    /*
     * Already owned, so offered as disabled rather than left to fail: the
     * primary key would turn a second insert into an error instead of the no-op
     * a customer would expect.
     */
    const owned = select.locator(`option[value="${modelIds[0]}"]`);
    /*
     * The property, not toBeDisabled(). Playwright resolves the element, the
     * DOM carries `disabled`, and it still reports "enabled" — its
     * enabled/disabled check does not apply to <option>. Asserting the
     * attribute through the element is unambiguous.
     */
    expect(
      await owned.evaluate((el) => (el as HTMLOptionElement).disabled),
    ).toBe(true);
    await expect(owned).toContainText("already added");

    /*
     * Every mutation waits for something observable before the database is
     * read. click() returns when the click dispatches, not when the server
     * action finishes — reading SQL straight after is a race, and it lost.
     * The component clears the select on success, so that is the signal.
     */
    // A second phone does not steal main.
    await select.selectOption(modelIds[1]!);
    await page.getByRole("button", { name: "Add phone" }).click();
    await expect(select).toHaveValue("");
    await expect(list.getByRole("listitem")).toHaveCount(2);
    let rows = await devices();
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.primary)).toEqual([
      { id: modelIds[0], primary: true },
    ]);

    // Promoting clears the old one in the same transaction, so there is never a
    // moment with two.
    await page.getByRole("button", { name: "Make main" }).click();
    // The badge moving to the second phone's row is the observable effect.
    await expect(
      list.getByRole("listitem").filter({ hasText: "E2E Phone 2" }),
    ).toContainText("main phone");
    rows = await devices();
    expect(rows.filter((r) => r.primary)).toEqual([
      { id: modelIds[1], primary: true },
    ]);

    /*
     * Removing the main promotes the survivor. A customer with devices and no
     * primary has no answer to "does it fit my phone?" even though they told us
     * about their phones.
     */
    await list
      .getByRole("listitem")
      .filter({ hasText: "main phone" })
      .getByRole("button", { name: /^Remove/ })
      .click();

    await expect(list.getByRole("listitem")).toHaveCount(1);
    expect(await devices()).toEqual([{ id: modelIds[0], primary: true }]);
    await expect(page.getByText("main phone")).toBeVisible();
  });
});
