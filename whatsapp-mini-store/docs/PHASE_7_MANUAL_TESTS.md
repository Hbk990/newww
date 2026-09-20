# Phase 7 staging checklist

Use a migrated, disposable staging database and HTTPS. Complete the automated PHP suites before this checklist.

## Merchant authorization and validation

- Sign out and request `/merchant/seo`; confirm login is required.
- Sign in as a super-admin and request `/merchant/seo`; confirm merchant access is rejected.
- As Merchant A, save a 70-character title and 160-character description; confirm both persist.
- Submit 71 and 161 characters by editing the request, not only the form; confirm server validation rejects them.
- Attempt to add `store_id` for Merchant B to the POST body; confirm only Merchant A’s current membership-derived store changes.
- Submit without a CSRF token and with an invalid token; confirm HTTP 419.
- Confirm `store.seo_updated` is written to `audit_logs` without storing secret or full sensitive request data.

## Metadata and indexing

- On an active, indexable store home, inspect source and confirm one title, description, canonical, robots `index,follow`, Open Graph set, and Twitter set.
- Confirm Open Graph/Twitter images are absolute URLs when a logo or banner exists.
- Open search, category, and paginated catalog URLs; confirm their robots value is `noindex,follow` and canonical points to the store home.
- Disable indexing. Confirm the store home and product pages emit `noindex,nofollow`.
- Confirm the disabled store is absent from `/sitemap.xml` and its `/{slug}/sitemap.xml` returns 404.
- Re-enable indexing and confirm it returns to the sitemap index and its sitemap lists only the active store home and active products in active categories.
- Confirm draft and suspended stores never appear in sitemaps. Confirm a suspended public page emits `noindex,nofollow`.
- Validate `/robots.txt`, `/sitemap.xml`, and one store sitemap with a crawler or XML validator.

## Product structured data

- Validate a product page with Google Rich Results Test or Schema.org validator.
- Confirm name, description, canonical URL, price, currency, availability, SKU when present, and absolute images match authoritative product data.
- Test a base product, a product with available variants, and a product whose variants are unavailable/out of stock.
- Confirm no rating, review count, or review markup is emitted.

## Sharing and branding

- Test native share on a supported mobile browser and copy-link fallback on desktop.
- Open WhatsApp and Facebook sharing actions and confirm the canonical product/store URL is encoded correctly.
- Use “Instagram” / “Copy for Instagram”; confirm the canonical URL is copied and a clear status message appears.
- On a FREE subscription, confirm a tasteful clickable “Powered by MiniStore” link is visible.
- On a test plan with `remove_platform_branding: true`, confirm the branding is absent without frontend manipulation.
- Change only the browser DOM or request parameters; confirm this cannot alter server-derived branding eligibility.

## Regression and responsive checks

- Re-run registration, login/logout, store publish/unpublish, category/product CRUD, images, cart, checkout, order creation, WhatsApp continuation, order status, design/QR, analytics, customers, reorder, and imports.
- Check the SEO workspace and product share row at 360, 390, 412, 430, 768, 1024, and 1440 px.
- Confirm no accidental horizontal scrolling, clipped URLs, or inaccessible controls.
- Check current Chrome, Edge, Firefox, and Safari; verify keyboard focus and reduced-motion behavior.
