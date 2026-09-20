# Phase 4 staging checklist

Use a disposable database migrated through `003_phase4_orders.sql`. Test with two merchants, each owning a different active store, and with products that include both unlimited and finite-stock variants.

## Customer checkout

- Add a base product and a variant product, change quantities, open checkout, and verify the summary.
- Submit valid name, E.164 phone, address, and optional notes. Confirm the order exists before the WhatsApp continuation page loads.
- Confirm the WhatsApp message contains the reference, customer, snapshot items, variants, quantities, total, delivery address, and notes.
- Confirm the browser cart clears only after the saved-order continuation page is reached.
- Submit empty, malformed, overlong, and invalid-phone fields and verify safe inline-page errors without an order.
- Change product prices in local storage/devtools. Confirm the database and WhatsApp message use current database prices.
- Submit an unavailable product, another store's product/variant ID, a missing variant selection, excessive quantity, and insufficient stock. Each must fail without a partial order.
- Double-click submit, resend the POST, and retry after a simulated network interruption. Confirm one order/reference only.
- Confirm draft and suspended stores cannot load checkout or create orders.
- Trigger more than 10 checkout attempts in one hour for the same store/IP and confirm rate limiting.

## Inventory and status

- Create an order for a finite-stock variant and verify its stock decreases once.
- Progress NEW → CONFIRMED → PREPARING → READY → COMPLETED and verify history timestamps.
- Attempt to skip states, reverse a state, modify COMPLETED, or provide an unknown status. Each must fail.
- Cancel an in-progress order and verify finite variant stock restores exactly once. Confirm CANCELLED is terminal.
- Verify unlimited (`NULL`) stock is never converted to a number.

## Tenant and role isolation

- As Merchant A, directly request Merchant B's order reference in list/detail/status endpoints. Reads must return 404 and updates must not occur.
- Alter a status form action to Merchant B's reference. Confirm the order and history remain unchanged.
- Attempt merchant order routes while logged out and as super-admin. Confirm the merchant authorization boundary blocks access.
- Verify only the merchant's own orders contribute to dashboard counts, value, and recent orders.

## WhatsApp semantics

- Confirm opening the continuation page records `whatsapp_opened_at` once.
- Return to the continuation URL and confirm no duplicate order is created.
- Confirm the UI never claims sent, delivered, read, or WhatsApp-confirmed status.
- Block popups/deep links and confirm the fallback “Open WhatsApp” link remains usable.

## Responsive and browser checks

- Check cart, checkout, saved-order, order list, and order detail at 360, 390, 412, 430, 768, 1024, and 1440 px.
- Confirm no unintended horizontal page scrolling; the order table may scroll within its own container.
- Test current Chrome, Edge, Firefox, and Safari, keyboard-only navigation, visible focus, form labels, errors, and reduced-motion settings.

## Regression

- Run `php tests/run.php` and `php tests/tenant_isolation.php`.
- Recheck registration, login/logout, password reset, onboarding, store publish/unpublish, category/product CRUD, image validation, storefront search, product variants, and cart persistence.
