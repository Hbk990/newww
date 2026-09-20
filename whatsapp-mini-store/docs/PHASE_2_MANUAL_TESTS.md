# Phase 2 staging checklist

Run the Phase 1 checklist first. Use two verified merchants, each with a separate store.

- [ ] Dashboard product totals match stored products; order metrics show unavailable placeholders rather than invented values.
- [ ] Create, edit, hide, reorder, and safely delete categories.
- [ ] A category containing a product cannot be deleted.
- [ ] Deleted category slug can be reused.
- [ ] Category image accepts valid JPEG/PNG/WebP and rejects mismatched or executable files.
- [ ] Create a product with price, compare price, category, availability, status, description, and featured state.
- [ ] Invalid money values, compare price below price, foreign category IDs, duplicate slugs, and duplicate SKUs fail.
- [ ] Search by name, SKU, and description; combine category/status/availability filters and each sort option.
- [ ] Pagination preserves filters and cannot request an unbounded result set.
- [ ] Duplicate creates a draft with option/variant availability, stock, and price adjustments but no conflicting SKU or shared image path.
- [ ] Archive is safe to retry. Delete frees product/variant SKUs and the public slug.
- [ ] Add up to eight valid product images; verify aspect ratio is preserved in previews.
- [ ] Reject oversized, undersized, malformed, extension-mismatched, SVG, PHP, and polyglot upload attempts.
- [ ] Deleting an image removes its database row, original file, and generated thumbnail.
- [ ] Create up to three variant groups and no more than 30 combinations; edit per-variant SKU, adjustment, optional stock, and availability.
- [ ] Changing option labels regenerates combinations; unchanged labels preserve variant fields.
- [ ] Directly request Merchant B category/product/image IDs while authenticated as Merchant A for read, update, archive, duplicate, and delete operations. Every attempt must return 404/403 and change nothing.
- [ ] STAFF or ORDER_MANAGER membership cannot use owner-only catalog mutations.
- [ ] Missing/invalid CSRF tokens fail on every mutation.
- [ ] Confirmation dialogs appear for delete/archive actions and work by keyboard.
- [ ] Test dashboard, filters, product cards, forms, image manager, variant rows, and dialogs at 360, 390, 412, 430, 768, 1024, and 1440 px without horizontal page scrolling.

