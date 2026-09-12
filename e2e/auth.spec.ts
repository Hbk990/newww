import { expect, test } from "@playwright/test";

import { ACCOUNTS, TEST_PASSWORD } from "./global-setup";

async function signIn(page: import("@playwright/test").Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(identifier);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  /*
   * Waiting here rather than in each test, because forgetting it is silent.
   *
   * The click posts to a server action that answers with a redirect. A test
   * that calls page.goto() straight afterwards races that redirect and
   * sometimes cancels it, so the session cookie is never set and the test
   * fails on the *next* assertion with a confusing "expected /admin/orders,
   * got /login". Settling here covers the successful and the refused case
   * alike, so no caller has to remember.
   */
  await page.waitForLoadState("networkidle");
}

test.describe("signing in", () => {
  test("an admin reaches the admin area", async ({ page }) => {
    await signIn(page, ACCOUNTS.admin.email, TEST_PASSWORD);
    await expect(page).toHaveURL("/");

    await page.goto("/admin");
    await expect(page).toHaveURL("/admin");
    // A heading, not body text: the streamed RSC payload is inside the page's
    // own <script> tags, so asserting on body text matches things that were
    // never rendered.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("a username works as well as an email address", async ({ page }) => {
    await signIn(page, ACCOUNTS.admin.username, TEST_PASSWORD);
    await expect(page).toHaveURL("/");
  });

  test("a wrong password is refused without saying which field was wrong", async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.admin.email, "definitely-not-it");
    // Still on the login page, and told nothing that distinguishes a real
    // account from an unknown one.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("an unknown account is refused the same way as a wrong password", async ({
    page,
  }) => {
    await signIn(page, "nobody@drphone.test", TEST_PASSWORD);
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("who may see the admin area", () => {
  test("a signed-out visitor is sent to the login page", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a customer is redirected away, not shown a 403", async ({ page }) => {
    /*
     * The guard redirects rather than rendering a 403 on purpose: a 403 would
     * confirm to a signed-in customer that the path exists. This test pins
     * that behaviour, so replacing it with a 403 page is a deliberate choice
     * rather than an accident.
     */
    await signIn(page, ACCOUNTS.customer.email, TEST_PASSWORD);
    await expect(page).toHaveURL("/");

    await page.goto("/admin/orders");
    await expect(page).toHaveURL("/");
  });

  test("staff reach the orders screen", async ({ page }) => {
    await signIn(page, ACCOUNTS.staff.email, TEST_PASSWORD);
    await expect(page).toHaveURL("/");

    await page.goto("/admin/orders");
    await expect(page).toHaveURL("/admin/orders");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test.describe("the sign-in screen itself", () => {
  test("says why it is asking when the basket sent them", async ({ page }) => {
    await page.goto("/login?next=%2Fcheckout");
    await expect(
      page.getByText("One step before your order. Your basket is waiting."),
    ).toBeVisible();

    // Arriving on its own, it says what to type instead.
    await page.goto("/login");
    await expect(
      page.getByText("Use your email address or your username."),
    ).toBeVisible();
  });

  test("carries the brand and a way back to the shop", async ({ page }) => {
    await page.goto("/login");

    /*
     * These pages had no brand scope at all: they rendered in the admin's
     * blue-grey with the system font, which is a different-looking website
     * appearing in the middle of a purchase. `data-shop` is what carries the
     * palette and the display face.
     */
    await expect(page.locator("[data-shop]").first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to the shop" }),
    ).toBeVisible();
    // And the case for having an account, which is the whole reason a shopper
    // is being asked for one.
    await expect(page.getByText("Cash on delivery")).toBeVisible();
  });

  test("the password can be read back before it is sent", async ({ page }) => {
    await page.goto("/login");
    const password = page.getByLabel("Password");

    await password.fill("a-typed-password");
    await expect(password).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Show" }).click();
    await expect(password).toHaveAttribute("type", "text");

    await page.getByRole("button", { name: "Hide" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("the code field asks the browser for six digits", async ({ page }) => {
    await page.goto("/reset");
    const code = page.getByLabel("Reset code");

    // inputMode brings up the number pad; the pattern is what stops four
    // digits ever reaching the server.
    await expect(code).toHaveAttribute("inputmode", "numeric");
    await expect(code).toHaveAttribute("pattern", "[0-9]{6}");
    await expect(code).toHaveAttribute("autocomplete", "one-time-code");

    await code.fill("1234");
    expect(await code.evaluate((el) => (el as HTMLInputElement).checkValidity())).toBe(
      false,
    );
    await code.fill("123456");
    expect(await code.evaluate((el) => (el as HTMLInputElement).checkValidity())).toBe(
      true,
    );
  });
});

