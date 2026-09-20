# Phase 3 staging checklist

Run the Phase 1 and Phase 2 checks first. Use an owner store with active, draft, archived, available, unavailable, featured, categorized, uncategorized, and variant products.

- [ ] A DRAFT store returns 404 publicly and becomes accessible only after an owner publishes it.
- [ ] Publishing fails without at least one active and purchasable product.
- [ ] An ACTIVE store renders at `/{store-slug}`; unpublishing makes it private again.
- [ ] A SUSPENDED store returns a neutral 503 page without cart/contact actions or administrative details.
- [ ] Exact system routes such as `/login`, `/dashboard`, `/merchant/orders`, and `/sa` are not captured as store slugs.
- [ ] Merchant A's storefront cannot return Merchant B products through product slugs, category slugs, search, related products, or manipulated URLs.
- [ ] Draft, archived, soft-deleted, or inactive-category products never render publicly.
- [ ] Store home displays identity, search, category chips, featured products, product grid, availability, cart, and WhatsApp access.
- [ ] Search works across product name, SKU, description, and category; empty results are clear.
- [ ] Category chips remain horizontally usable without an ugly select or page overflow.
- [ ] Product images preserve aspect ratio. Gallery swipes, arrows, dots, lazy loading, and keyboard focus work.
- [ ] Products with options require one value per option. Impossible/unavailable combinations become disabled.
- [ ] Variant price, optional stock, availability, and label update correctly after selection.
- [ ] Quick add works only for available products without variants; variant products open the product page.
- [ ] Cart persists across refresh, is isolated by store slug, and supports add/remove/increase/decrease with variant-specific lines and totals.
- [ ] Local-storage tampering with invalid paths, prices, IDs, quantities, or zero stock is discarded safely.
- [ ] Store and product sharing use native share where available and copy the link otherwise.
- [ ] Reduced-motion preference disables nonessential transitions/animations.
- [ ] With JavaScript disabled, browsing/search/product URLs remain usable; cart controls may progressively require JavaScript.
- [ ] Test home, search, categories, product cards, gallery, options, cart, empty states, header, and mobile bottom navigation at 360, 390, 412, 430, 768, 1024, and 1440 px without accidental horizontal scrolling.
- [ ] Test current Chrome, Edge, Firefox, and Safari, including touch swiping and sticky elements.

