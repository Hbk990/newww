/**
 * Turning a stored image path into something a browser can fetch.
 *
 * Two shapes exist in the table and both are legitimate. The local storage
 * driver writes `/uploads/<key>`, while the rows imported from the old catalog
 * carry `uploads/<key>` with no leading slash. A relative src on
 * `/products/anything` resolves against that directory — the browser would ask
 * for `/products/uploads/p-1.webp` and get a 404 — so the slash is not cosmetic.
 *
 * Absolute URLs pass through untouched, for the day photos move to object
 * storage. Note that `next/image` would then also need the host in
 * `images.remotePatterns`.
 */
export const IMAGE_PLACEHOLDER = "/placeholder.svg";

export function imageSrc(url: string | null | undefined): string {
  const trimmed = url?.trim();
  if (!trimmed) return IMAGE_PLACEHOLDER;

  // Protocol-relative and absolute URLs are already fetchable as written.
  if (/^(https?:)?\/\//i.test(trimmed)) return trimmed;

  // A data: or blob: src belongs to a preview the admin just created.
  if (/^(data|blob):/i.test(trimmed)) return trimmed;

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
