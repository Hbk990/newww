# Phase 6 staging checklist

Back up the database and uploads, then migrate a disposable Phase 5 database through `005_phase6_analytics_crm_import.sql`.

## Migration and regression

- Confirm existing orders are linked to customers by store and normalized phone without changing order totals or item snapshots.
- Run `php tests/run.php` and `php tests/tenant_isolation.php`.
- Recheck registration, login, onboarding, catalog CRUD, image uploads, storefront templates, checkout, idempotency, WhatsApp continuation, and order status transitions.

## Analytics

- In a logged-out browser, open a store, product, search, add to cart, start checkout, create an order, and open WhatsApp. Confirm only supported events appear.
- Confirm order creation and WhatsApp-open attempts are recorded server-side and that WhatsApp is never labeled sent, delivered, or read.
- Repeat from a logged-in merchant session and with an obvious bot user agent; confirm traffic is excluded where intended.
- Submit forged event names, another store’s product ID, missing CSRF tokens, and excessive requests. Confirm rejection or safe throttling.
- Confirm empty analytics show zero/empty states rather than invented values.
- Compare 7, 30, and 90-day filters against direct database aggregates.

## Customers and tenant isolation

- Place two orders with the same international phone and changed customer name. Confirm one customer profile, the latest name, two orders, correct first/last dates, and summed non-cancelled value.
- Cancel an order and confirm customer historical value excludes it.
- Search by name and phone and test empty/no-result states and pagination.
- As Merchant A, request Merchant B’s customer ID and analytics URLs/data. Every attempt must fail or return only Merchant A data.

## Reorder

- Open a saved order’s reorder link and confirm current prices—not snapshot prices—are used.
- Test deleted/archived/unavailable products, removed variants, zero stock, reduced stock, and products that gained required variants. Confirm unsafe lines are skipped with explanations.
- Confirm applying a reorder replaces the current store cart and redirects to cart.
- Alter the order reference or secret token and confirm a 404 without leaking order information.

## Spreadsheet import

- Download the template and preview valid CSV and XLSX files.
- Test missing headers, duplicate SKUs, invalid money, compare price below price, invalid availability, overlong fields, more than 500 rows, files over 2 MB, renamed/non-spreadsheet files, and a compressed XLSX over the expansion limit.
- Confirm any row error blocks confirmation of the entire preview.
- Confirm preview tokens expire, are single-use, and cannot be committed by another store or user.
- Confirm a valid batch updates matching SKUs, creates missing categories, creates new products as drafts, and commits fully or rolls back fully.
- On a server without Zip/SimpleXML, confirm XLSX gives a useful error and CSV still works.

## Bulk images

- Upload `ABC123.jpg` for product SKU `ABC123`; confirm it appears on only that store’s product.
- Test unmatched names, two files for the same SKU, fake extensions, scripts, corrupt images, excessive dimensions/size, and a product already at its image limit.
- Confirm the report separates matched, unmatched, duplicate, and failed files.
- Attempt Merchant A filenames/product IDs against Merchant B. No cross-tenant image write may occur.

## Responsive and browser checks

- Check Customers, Analytics, Import, reorder, tables, charts, forms, reports, and empty states at 360, 390, 412, 430, 768, 1024, and 1440 px.
- Test current Chrome, Edge, Firefox, and Safari, keyboard navigation, focus visibility, dialog confirmation, and reduced motion.
