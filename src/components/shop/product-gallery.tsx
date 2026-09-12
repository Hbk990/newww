"use client";

import { useState } from "react";

import { Photo } from "@/components/shop/photo";
import { IMAGE_PLACEHOLDER } from "@/lib/shop/image-url";
import type { ShopImage } from "@/lib/shop/product";

/**
 * The photos, with a thumbnail strip under the big one.
 *
 * A plain <img> rather than next/image, deliberately: the imported rows carry
 * no width or height, and next/image needs either both or a `fill` parent with
 * a known aspect ratio. More to the point, none of the files exist yet — the
 * catalog was imported without its photos — and a 404 through the image
 * optimiser breaks the route, where a broken <img> is one placeholder away.
 * This becomes next/image when real photos land with dimensions.
 */
export function ProductGallery({
  images,
  title,
}: {
  images: ShopImage[];
  title: string;
}) {
  const [active, setActive] = useState(0);
  const shown: ShopImage[] =
    images.length > 0
      ? images
      : [{ url: IMAGE_PLACEHOLDER, alt: null, width: null, height: null }];
  const current = shown[Math.min(active, shown.length - 1)] ?? shown[0];
  // Photo resolves the stored path and owns the missing-file fallback.
  const mainUrl = current?.url ?? IMAGE_PLACEHOLDER;

  return (
    <div className="md:sticky md:top-6">
      <div className="mx-auto max-w-md overflow-hidden rounded-xl border border-line bg-raised">
        <Photo
          url={mainUrl}
          alt={current?.alt ?? title}
          eager
          className="aspect-square w-full object-contain"
        />
      </div>

      {shown.length > 1 ? (
        <ul className="mx-auto mt-3 flex max-w-md gap-2 overflow-x-auto pb-1">
          {shown.map((image, index) => {
            return (
              <li key={`${image.url}-${index}`}>
                <button
                  type="button"
                  onClick={() => setActive(index)}
                  aria-current={index === active}
                  aria-label={`Photo ${index + 1} of ${shown.length}`}
                  className={`block size-16 shrink-0 overflow-hidden rounded-lg border bg-raised ${
                    index === active ? "border-accent" : "border-line"
                  }`}
                >
                  <Photo
                    url={image.url}
                    alt=""
                    className="size-full object-contain"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
