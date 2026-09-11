-- ============================================================
-- What an image row needs besides its URL
-- ============================================================

/*
 * `storage_key` is the provider's own handle for the file.
 *
 * A URL is not enough to delete anything. Removing a row with only a URL
 * leaves the file behind for good — on a paid bucket a bill that never stops
 * growing, on a free tier the quota filling with images nobody can see.
 * Keeping the key is what makes the delete complete.
 *
 * Nullable, because a row may be created from a URL typed by hand (a supplier
 * image hosted elsewhere), where there is nothing of ours to delete.
 */
ALTER TABLE "product_images" ADD COLUMN "storage_key" text;--> statement-breakpoint

/*
 * Intrinsic dimensions, read from the file header on upload.
 *
 * Next's <Image> needs both to reserve space before the bytes arrive. Without
 * them every product page reflows as each image loads, which is the most
 * visible way a catalog feels slow — and "not slow" was the requirement this
 * backend was built around.
 */
ALTER TABLE "product_images" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "height" integer;--> statement-breakpoint

-- Byte size, so the admin can see what is making pages heavy rather than
-- guessing, and so a quota can be reported before it is hit.
ALTER TABLE "product_images" ADD COLUMN "bytes" integer;--> statement-breakpoint

-- Either both dimensions or neither: one alone cannot reserve space and is
-- worse than none, because the page would reserve the wrong shape.
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_dimensions_together" CHECK (num_nonnulls("product_images"."width", "product_images"."height") <> 1);--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_positive_size" CHECK (("product_images"."width" is null or "product_images"."width" > 0)
          and ("product_images"."height" is null or "product_images"."height" > 0)
          and ("product_images"."bytes" is null or "product_images"."bytes" > 0));
