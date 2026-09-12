import { expect, test } from "@playwright/test";
import postgres from "postgres";

const sql = postgres(
  process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  { max: 1 },
);

const stamp = Date.now();
const groupSlug = `home-group-${stamp}`;
const catSlug = `home-cat-${stamp}`;
let groupId = "";
let catId = "";
let brandId = "";
let productId = "";
const modelIds: string[] = [];

test.beforeAll(async () => {
  const [group] = await sql<{ id: string }[]>`
    insert into categories (slug, name, position)
    values (${groupSlug}, 'Home Spec Gear', 950)
    returning id
  `;
  groupId = group!.id;

  const [category] = await sql<{ id: string }[]>`
    insert into categories (slug, name, parent_id, position)
    values (${catSlug}, 'Home Spec Cables', ${groupId}, 0)
    returning id
  `;
  catId = category!.id;

  const [product] = await sql<{ id: string }[]>`
    insert into products (slug, title, status, published_at, in_stock)
    values (${`home-prod-${stamp}`}, 'Home Spec Cable', 'active', now(), true)
    returning id
  `;
  productId = product!.id;

  await sql`
    insert into variants (product_id, title, sku, price_cents, position)
    values (${productId}, 'Default', ${`home-prod-${stamp}`}, 499, 0)
  `;
  await sql`
    insert into product_categories (product_id, category_id, is_primary)
    values (${productId}, ${catId}, true)
  `;

  /*
   * The finder needs phones, and the e2e database has none of its own — the
   * reference seed was never run against it. Two models in one family, so the
   * newest-first ordering has something to order.
   */
  const [brand] = await sql<{ id: string }[]>`
    insert into device_brands (name, slug, position)
    values (${`HomeBrand${stamp}`}, ${`home-brand-${stamp}`}, 90)
    returning id
  `;
  brandId = brand!.id;

  for (const n of [11, 16]) {
    const [model] = await sql<{ id: string }[]>`
      insert into device_models (device_brand_id, name, slug)
      values (${brandId}, ${`HomePhone ${n}`}, ${`home-phone-${stamp}-${n}`})
      returning id
    `;
    modelIds.push(model!.id);
  }
});

test.afterAll(async () => {
  await sql`delete from product_categories where product_id = ${productId}`;
  await sql`delete from variants where product_id = ${productId}`;
  await sql`delete from products where id = ${productId}`;
  await sql`delete from categories where id = ${catId}`;
  await sql`delete from categories where id = ${groupId}`;
  await sql`delete from device_models where device_brand_id = ${brandId}`;
  await sql`delete from device_brands where id = ${brandId}`;
  await sql.end();
});

test("the hero states what the shop is and what it holds", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: /Everything for/ }),
  ).toBeVisible();
  // The count is the real one, rendered on the server.
  await expect(page.getByText(/things for the phone in your hand/)).toBeVisible();
  // exact: the footer's own copy contains the same sentence.
  await expect(
    page.getByText("Cash on delivery anywhere in Lebanon", { exact: true }),
  ).toBeVisible();
});

test("the phone finder leads to results for the model picked", async ({ page }) => {
  await page.goto("/");

  const finder = page.getByText("Which phone do you have?").locator("..");
  await finder.getByRole("button", { name: `HomeBrand${stamp}` }).click();

  /*
   * Newest first within a family: 16 before 11. There is no release date in
   * the table, so the order is inferred from the names — and this is the
   * assertion that keeps that inference honest.
   */
  const models = finder.getByRole("link", { name: /HomePhone/ });
  await expect(models.first()).toHaveText("HomePhone 16");

  await models.first().click();
  // encodeURIComponent, so the space is %20 rather than a plus.
  await expect(page).toHaveURL(/q=HomePhone%2016/);
});

test("every section leads somewhere, and the numbers are rendered server-side", async ({
  page,
}) => {
  // JavaScript off: the stats, the links and the copy must all still be there,
  // because this is what a crawler and a slow phone get.
  await page.context().addInitScript(() => {});
  await page.goto("/");

  await expect(
    page.getByRole("link", { name: /Home Spec Gear/ }).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Find mine →" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /No card. No account./ }),
  ).toBeVisible();
  // exact: the step above it also ends with "3 delivery zones".
  await expect(
    page.getByText("delivery zones", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("products in stock")).toBeVisible();

  await page.getByRole("link", { name: /Home Spec Gear/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/c/${groupSlug}$`));
});

test("the new-arrivals rail scrolls and its arrows know where they are", async ({
  page,
}) => {
  await page.goto("/");

  const rail = page.locator(".rail").first();
  await expect(rail).toBeVisible();
  await expect(rail.getByRole("link", { name: /Home Spec Cable/ })).toBeVisible();

  // The rail is a real scroller: overflowing content, not a clipped row.
  const room = await rail.evaluate(
    (el) => el.scrollWidth - el.clientWidth > 0,
  );
  expect(room).toBe(true);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the hero drops the card deck and keeps the finder", async ({ page }) => {
    await page.goto("/");

    // The deck would cover the headline at this width, so it is not rendered.
    await expect(page.locator(".layer")).toBeHidden();
    await expect(page.getByText("Which phone do you have?")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: /Everything for/ }),
    ).toBeVisible();
  });
});
