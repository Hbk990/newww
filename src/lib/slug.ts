/**
 * URL slug from a title.
 *
 * Ported from `seed/derive-from-export.py`, including its correction: `+` is
 * meaningful in device and product names and must survive. Stripping it
 * collapsed Galaxy Tab A9+ onto Tab A9, A11+ onto A11, S9 FE+ onto S9 FE and
 * Hot 50 Pro+ onto Hot 50 Pro — four real devices silently merged into their
 * non-plus siblings, and a case that fits one does not fit the other.
 *
 * Accents are folded rather than dropped, so "Écouteurs" becomes "ecouteurs"
 * instead of "couteurs".
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    // Combining marks left behind by the decomposition above.
    .replace(/[̀-ͯ]/g, "")
    .replace(/\+/g, "-plus")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .replace(/-{2,}/g, "-");
}

/**
 * An uppercase fragment for a SKU.
 *
 * Keeps what distinguishes one variant from another rather than the first few
 * characters: truncating "iPhone 15", "iPhone 15 Pro" and "iPhone 15 Pro Max"
 * to six characters gives "IPHONE" three times, and the unique index on
 * `variants.sku` rejects the second and third. Dropping a leading brand or
 * family word keeps the part that actually differs.
 */
export function skuFragment(input: string, drop: readonly string[] = []): string {
  let text = input;
  for (const word of drop) {
    text = text.replace(new RegExp(`^${word}\\s*`, "i"), "");
  }
  const cleaned = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\+/g, "PLUS")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase();
  // Falls back to the untouched input when `drop` consumed everything — a
  // value named exactly after its family, like the option "iPhone" itself.
  return cleaned || input.replace(/[^a-zA-Z0-9]+/g, "").toUpperCase();
}
