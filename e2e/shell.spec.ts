import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { storageStateFor } from "./global-setup";

const sql = postgres(
  process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  { max: 1 },
);

const stamp = Date.now();
const groupSlug = `e2e-group-${stamp}`;
const catSlug = `e2e-cat-${stamp}`;
const emptySlug = `e2e-empty-${stamp}`;
const productSlug = `e2e-shell-${stamp}`;

let groupId = "";
let catId = "";
let emptyId = "";
let productId = "";

test.beforeAll(async () => {
  const [group] = await sql<{ id: string }[]>`
    insert into categories (slug, name, position)
    values (${groupSlug}, 'E2E Gadgets', 900)
    returning id
  `;
  groupId = group!.id;

  const [category] = await sql<{ id: string }[]>`
    insert into categories (slug, name, parent_id, position)
    values (${catSlug}, 'E2E Cables', ${groupId}, 0)
    returning id
  `;
  catId = category!.id;

  // A category with nothing in it, to prove the menu leaves it out.
  const [empty] = await sql<{ id: string }[]>`
    insert into categories (slug, name, parent_id, position)
    values (${emptySlug}, 'E2E Nothing', ${groupId}, 1)
    returning id
  `;
  emptyId = empty!.id;

  const [product] = await sql<{ id: string }[]>`
    insert into products (slug, title, status, published_at)
    values (${productSlug}, 'E2E Braided Cable', 'active', now())
    returning id
  `;
  productId = product!.id;

  await sql`
    insert into variants (product_id, title, sku, price_cents, position)
    values (${productId}, 'Default', ${productSlug}, 1499, 0)
  `;
  await sql`
    insert into product_categories (product_id, category_id, is_primary)
    values (${productId}, ${catId}, true)
  `;
});

test.afterAll(async () => {
  await sql`delete from product_categories where product_id = ${productId}`;
  await sql`delete from variants where product_id = ${productId}`;
  await sql`delete from products where id = ${productId}`;
  await sql`delete from categories where id in (${catId}, ${emptyId})`;
  await sql`delete from categories where id = ${groupId}`;
  await sql.end();
});

test("the menu opens on the group and lists only categories with stock", async ({
  page,
}) => {
  await page.goto("/");

  /*
   * Scoped to the header throughout. The homepage now names these same
   * categories in its aisle tiles and its hero deck, so an unscoped locator
   * finds three "E2E Cables" links and cannot tell which is the menu's.
   */
  const header = page.getByRole("banner");

  /*
   * The bar shows one-word labels for the five real groups and the category
   * name for anything else, so this seeded group appears under its own name.
   */
  const trigger = header.getByRole("button", { name: "E2E Gadgets" });
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await trigger.hover();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");

  const panel = header.getByRole("link", { name: "Shop all E2E Gadgets" });
  await expect(panel).toBeVisible();
  await expect(header.getByRole("link", { name: /E2E Cables/ })).toBeVisible();

  // The empty one is left out rather than leading to a dead page.
  await expect(header.getByRole("link", { name: /E2E Nothing/ })).toHaveCount(0);

  await header.getByRole("link", { name: /E2E Cables/ }).click();
  await expect(page).toHaveURL(new RegExp(`/c/${catSlug}$`));
  await expect(
    page.getByRole("heading", { name: "E2E Cables", level: 1 }),
  ).toBeVisible();

  // And the panel does not follow the navigation.
  await expect(panel).toBeHidden();
});

test("a group's page covers its children, and sort is a real URL", async ({
  page,
}) => {
  await page.goto(`/c/${groupSlug}`);
  await expect(
    page.getByRole("link", { name: "E2E Braided Cable" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Price: low to high" }).click();
  await expect(page).toHaveURL(/sort=cheapest/);
  await expect(
    page.getByRole("link", { name: "Price: low to high" }),
  ).toHaveAttribute("aria-current", "true");

  // In-stock filtering is a link too, so it survives a reload and can be shared.
  /*
   * Filtering must not throw away the sort. It did: the links were built from
   * the page's base query alone, so each control silently dropped whatever the
   * other one had set.
   */
  await page.getByRole("link", { name: "In stock only" }).click();
  await expect(page).toHaveURL(/stock=in/);
  await expect(page).toHaveURL(/sort=cheapest/);
});

test("search finds a product by title", async ({ page }) => {
  await page.goto("/search");
  // Scoped to main: the header carries a Search button of its own on every
  // page, so an unscoped locator matches two.
  const form = page.getByRole("main");
  await form.getByLabel("Search products").fill("Braided");
  await form.getByRole("button", { name: "Search" }).click();

  await expect(page).toHaveURL(/q=Braided/);
  await expect(
    page.getByRole("link", { name: "E2E Braided Cable" }),
  ).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the tab bar and the drawer replace the hover menu", async ({ page }) => {
    await page.goto("/");

    const tabs = page.getByRole("navigation", { name: "Main" });
    await expect(tabs.getByRole("link", { name: "Shop" })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Basket" })).toBeVisible();

    // The hover bar is desktop-only; on a phone the group lives in the drawer.
    const header = page.getByRole("banner");
    await expect(header.getByRole("button", { name: "E2E Gadgets" })).toBeHidden();

    await page.getByRole("button", { name: "Menu" }).click();
    await header.getByRole("link", { name: "E2E Cables" }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${catSlug}$`));

    // Shop goes to a real page rather than opening a drawer, so it can be
    // linked to and read by a crawler.
    await tabs.getByRole("link", { name: "Shop" }).click();
    await expect(page).toHaveURL(/\/categories$/);
    await expect(page.getByRole("heading", { name: "E2E Gadgets" })).toBeVisible();
  });
});

test.describe("the footer", () => {
  test("carries the delivery prices, the aisles and the account links", async ({
    page,
  }) => {
    await page.goto("/categories");

    const footer = page.getByRole("contentinfo");
    await expect(footer).toBeVisible();

    /*
     * The delivery table is the reason this footer exists: the fee to each
     * zone, from the same rows checkout charges from, so nobody has to reach
     * the last screen to find out what it costs to reach them.
     */
    await expect(footer.getByText("Beirut", { exact: true })).toBeVisible();
    await expect(footer.getByText("$2.00")).toBeVisible();
    await expect(footer.getByText("Rest of Lebanon")).toBeVisible();
    await expect(footer.getByText(/Akkar/)).toBeVisible();

    // The aisles come from the same loader as the menu, so a new group appears
    // in both without anyone editing markup.
    await expect(
      footer.getByRole("link", { name: "E2E Gadgets" }),
    ).toBeVisible();
    await expect(
      footer.getByRole("link", { name: "Shop by phone" }),
    ).toBeVisible();

    // A guest is offered the two ways in, not the account pages.
    await expect(footer.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(
      footer.getByRole("link", { name: "Create an account" }),
    ).toBeVisible();
    // exact: role-name matching is a case-insensitive substring match, and
    // "Create an account" contains "Account".
    await expect(
      footer.getByRole("link", { name: "Account", exact: true }),
    ).toHaveCount(0);

    await expect(
      footer.getByText("Prices in US dollars · Cash on delivery only"),
    ).toBeVisible();
  });

  test("offers WhatsApp only when a number is set", async ({ page }) => {
    const link = page
      .getByRole("contentinfo")
      .getByRole("link", { name: /WhatsApp/ });

    await sql`update store_settings set whatsapp_number = null`;
    await page.goto("/categories");
    await expect(link).toHaveCount(0);

    await sql`update store_settings set whatsapp_number = '+961 70 111 222'`;
    await page.goto("/categories");
    await expect(link).toHaveAttribute("href", "https://wa.me/96170111222");

    await sql`update store_settings set whatsapp_number = null`;
  });

  test.describe("signed in", () => {
    test.use({ storageState: storageStateFor("customer") });

    test("swaps the sign-in links for the account ones", async ({ page }) => {
      await page.goto("/categories");
      const footer = page.getByRole("contentinfo");

      await expect(
        footer.getByRole("link", { name: "Account", exact: true }),
      ).toBeVisible();
      await expect(
        footer.getByRole("link", { name: "Saved items" }),
      ).toBeVisible();
      await expect(footer.getByRole("link", { name: "Sign in" })).toHaveCount(0);
    });
  });
});
