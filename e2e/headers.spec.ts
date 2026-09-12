import { expect, test } from "@playwright/test";

import { storageStateFor } from "./global-setup";

const REQUIRED = [
  "content-security-policy",
  "strict-transport-security",
  "x-content-type-options",
  "referrer-policy",
  "x-frame-options",
  "permissions-policy",
  "cross-origin-opener-policy",
] as const;

test("every security header is present on a page response", async ({ page }) => {
  const response = await page.goto("/login");
  expect(response, "no response for /login").not.toBeNull();
  const headers = response!.headers();
  for (const name of REQUIRED) {
    expect(headers[name], `${name} is missing`).toBeTruthy();
  }
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  // same-origin would sever Google's OAuth popup.
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin-allow-popups");
});

test("the policy forbids framing, plugins and a rewritten base URL", async ({ page }) => {
  const response = await page.goto("/login");
  const csp = response!.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'none'");
  expect(csp).toContain("form-action 'self'");
});

/*
 * The policy is only worth having if it does not break the app.
 *
 * A CSP that blocks a script fails silently in production — the page renders,
 * one thing quietly stops working, and nobody finds out until a customer says
 * the button does nothing. These tests read the browser's own violation
 * reports, so tightening the policy above cannot ship a broken page.
 */
function watchForViolations(page: import("@playwright/test").Page): string[] {
  const violations: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (/content security policy|refused to (load|execute|apply|connect)/i.test(text)) {
      violations.push(text);
    }
  });
  page.on("pageerror", (error) => {
    if (/content security policy/i.test(error.message)) violations.push(error.message);
  });
  return violations;
}

test("the policy does not block anything on the sign-in page", async ({ page }) => {
  const violations = watchForViolations(page);
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(violations, violations.join("\n")).toEqual([]);
});

test.describe("in the admin area", () => {
  // A pre-signed session, so this spec does not spend the login throttle's
  // per-identifier budget on a test about response headers.
  test.use({ storageState: storageStateFor("admin") });

  test("the policy does not block anything in the admin area", async ({ page }) => {
    const violations = watchForViolations(page);

    for (const path of [
      "/admin",
      "/admin/products",
      "/admin/orders",
      "/admin/stock",
      "/admin/shipping",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
    await page.waitForLoadState("networkidle");

    expect(violations, violations.join("\n")).toEqual([]);
  });
});
