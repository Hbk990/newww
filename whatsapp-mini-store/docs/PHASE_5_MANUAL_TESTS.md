# Phase 5 staging checklist

Back up the database and uploaded assets, then migrate a disposable Phase 4 database through `004_phase5_store_customization.sql`.

## Customization and live preview

- Open Store Design as a verified merchant owner. Confirm all 15 template choices appear and their live previews are visually distinct: Modern, Luxury, Playful, Minimal, Boutique, Bold, Editorial, Natural, Tech, Streetwear, Beauty, Artisan, Classic, Vibrant, and Monochrome.
- Save each of the 12 additional templates in turn and confirm the public storefront receives exactly one matching `store-theme-*` class after reload.
- Change the accent and each approved font. Confirm the mobile preview updates immediately and remains readable with very light and dark accents.
- Edit store name and description. Confirm preview text updates without saving.
- Upload valid JPEG, PNG, and WebP logo/banner files. Confirm the preview and public store preserve useful aspect ratios.
- Try fake extensions, PHP/script files, corrupt images, files over 5 MB, dimensions outside 300–6000 px, and banners narrower than 800 px. Every upload must fail safely.
- Replace and remove logo/banner files. Confirm superseded files are deleted only after the database update succeeds.
- Submit invalid email, overlong description/address, malformed social URLs, invalid colors, and unapproved template/font values. Confirm nothing is partially saved.
- Verify an error redisplays safe values without injecting classes, CSS, HTML, or scripts.

## Tenant isolation and authorization

- As Merchant A, alter requests, hidden values, filenames, or paths in an attempt to update Merchant B’s store. Merchant B must remain unchanged.
- Attempt Store Design logged out, as super-admin, and with a non-owner future role. Confirm the current owner-only boundary blocks access.
- Verify branding files are stored only under the authenticated store’s upload directory.
- Submit the design form without a CSRF token and with another session’s token. Confirm rejection.

## Slug changes and redirects

- Change an active store from one valid slug to another. Confirm the new URL works and old home/product/cart URLs return a permanent redirect.
- Confirm old slugs cannot be claimed by registration or another merchant.
- Try reserved routes, malformed slugs, duplicate current slugs, and previously used slugs. Confirm rejection.
- Confirm checkout POST requests sent to an old slug are not replayed automatically. Customers should reload through the current URL.
- Repeat multiple slug changes and verify every historical URL reaches the current slug without a redirect chain.

## QR and sharing

- Download the 2048×2048 PNG and SVG QR files. Scan both with iOS and Android camera apps and confirm the exact public store URL.
- Print the SVG or PNG at counter-card and poster sizes and confirm the quiet zone remains intact.
- Confirm QR generation makes no external network request.
- Test native product sharing, WhatsApp, Facebook, and Copy link. Confirm every link targets the canonical product URL.
- Block clipboard permission and confirm the UI reports failure safely.

## Public storefront and metadata

- Confirm logo, banner, description, accent, font, address, contact email, and social links render correctly.
- Inspect home and product HTML for escaped title/description, canonical URL, Open Graph fields, Twitter card fields, and absolute social image URLs.
- Confirm cart, checkout, and saved-order pages use `noindex,nofollow`.
- Verify draft stores remain private and suspended stores retain their neutral unavailable page.

## Responsive and regression testing

- Check Store Design and public templates at 360, 390, 412, 430, 768, 1024, and 1440 px with no unintended page overflow.
- Test current Chrome, Edge, Firefox, and Safari; keyboard navigation; focus visibility; file inputs; and reduced-motion settings.
- Run `php tests/run.php` and `php tests/tenant_isolation.php`.
- Recheck registration, onboarding, login/logout, catalog CRUD, publishing, cart persistence, server-authoritative checkout, idempotent order creation, WhatsApp handoff, and merchant order status transitions.
