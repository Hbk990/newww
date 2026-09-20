# Phase 5 completion report

## Existing architecture inspected

Phase 4 already provided tenant-derived authorization, secure catalog uploads, three initial theme identifiers, clean public store/product routes, persistent carts, transactional checkout, order snapshots, and native sharing. Phase 5 extends those components instead of creating a separate site builder or storefront. The controlled catalog now contains 15 templates without permitting arbitrary merchant CSS or markup.

## Database changes

Migration `004_phase5_store_customization.sql` adds controlled fields to `stores` for logo, banner, accent, approved font, description, contact email, address, and social links. It also adds `store_slug_redirects`, with a globally unique historical slug and store foreign key. The migration is additive and preserves existing merchant data.

## Implemented

- Owner-authorized Store Design workspace with Modern, Luxury, Playful, Minimal, Boutique, Bold, Editorial, Natural, Tech, Streetwear, Beauty, Artisan, Classic, Vibrant, and Monochrome templates
- Approved font selection, validated accent color, store name/description, contact details, and social links
- Content-inspected logo/banner uploads, safe random filenames, tenant directories, replacement cleanup, and removal controls
- Responsive live mobile preview for theme, accent, font, copy, logo, and banner changes
- Exact public store URL, copy action, locally generated 2048×2048 PNG QR, and scalable SVG QR
- Atomic slug updates and historical permanent redirects for store, product, cart, checkout, and saved-order GET routes
- Central slug checks that reserve current and historical addresses
- Public logo, banner, theme, font, accent, description, contact, address, and social rendering
- Canonical, Open Graph, and Twitter metadata for stores and products
- Native product sharing plus explicit WhatsApp, Facebook, and copy-link actions
- Updated setup progress based on first product, logo, and published state
- Local QR encoder and its third-party license notice; production requires no Node process or external QR API

## Security and integrity review

- Store identity always comes from `TenantContext`; no client-supplied `store_id` is accepted.
- Template/font choices are allowlisted; colors are strict six-digit hex values and get calculated readable foreground text.
- Email, length limits, slugs, reserved routes, and social URL schemes are validated server-side.
- Store upload validation checks error state, size, MIME using file contents, extension agreement, decoded dimensions, safe paths, and randomized names.
- New files are removed if a database update fails; old files are deleted only after a successful update.
- Slug changes lock the store row and record the old address in the same transaction.
- Public metadata and customization values are escaped; failed-form preview classes and inline colors are re-sanitized.
- QR generation occurs entirely in the browser and sends no store URL to a third party.
- Sensitive cart, checkout, and order-continuation pages are marked `noindex,nofollow`.

## Verification status

**TESTED:** storefront, merchant, and bundled QR JavaScript syntax; QR matrix generation; balanced CSS; all 15 catalog entries mapped to selector previews and all 12 additions mapped to distinct public rules; centralized layout allowlisting; PHP delimiter scan across 89 files; source assertions for tenant authorization, migration constraints, upload inspection, redirects, metadata, local QR behavior, and external-service absence; archive integrity and secret-pattern review.

**CODE-REVIEWED:** upload rollback/cleanup, slug collision and redirect behavior, reserved routes, stored CSS safety, output escaping, social URL handling, canonical URL construction, draft/suspended visibility, responsive breakpoints, and Phase 1–4 regression paths.

**NOT TESTED IN THIS WORKSPACE:** PHP execution, MySQL migration/runtime behavior, camera scanning of downloaded QR assets, email, WhatsApp/Facebook handoff, and interactive browser screenshots. PHP/MySQL and browser runtimes are unavailable here. Run the automated tests and `docs/PHASE_5_MANUAL_TESTS.md` in staging before production.

## Known limitations

- Custom domains are not implemented; URL generation remains centralized so they can be added later.
- Templates are intentionally controlled rather than a free-form drag-and-drop builder.
- QR poster/story composition templates are future extensions; this phase provides reusable high-resolution PNG and SVG assets.
- Full SEO controls, indexing opt-out, XML sitemaps, and structured Product data remain Phase 7.
- Social links support Instagram, Facebook, and TikTok in this phase.
- Phase 6 analytics, CRM, and import have not started.

## Files changed for the 15-template enhancement

- `config/app.php` — centralized template catalog, allowlist, and onboarding subset
- `resources/views/merchant/design.php` — data-driven 15-template selector
- `resources/views/onboarding/create.php` — focused three-template starter choice with full-catalog guidance
- `resources/views/layouts/storefront.php` — centralized public theme validation
- `public/assets/css/app.css` — selector swatches and live-preview treatments
- `public/assets/css/storefront.css` — 12 distinct responsive storefront treatments
- `public/assets/js/app.js` — dynamic preview-class cleanup
- `tests/run.php` — catalog, CSS mapping, and dynamic-preview regression assertions
- `README.md`, `PHASE_5_REPORT.md`, and `docs/PHASE_5_MANUAL_TESTS.md` — updated documentation and staging coverage
