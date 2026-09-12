"use client";

import { useState } from "react";

import { imageSrc, IMAGE_PLACEHOLDER } from "@/lib/shop/image-url";
import type { ShopImage } from "@/lib/shop/product";

/**
 * The photos, with a thumbnail strip under the big one.
 *
 * A plain <img> rather than next/image, deliberately: the imported rows carry
 * no width or height, and next/image needs either both or a `fill` parent with
 * a known aspect ratio. More to the point, none of the files exist yet — the
 * catalog was imported without its photos — and a 404 through the image
 * optimiser is a 500-ish error page for the whole route, where a broken <img>
 * is one onError away from a placeholder. This becomes next/image when real
 * photos land with dimensions.
 */
export function ProductGallery({
  images,
  title,
}: {
  images: ShopImage[];
  title: string;
}) {
  const [active, setActive] = useState(0);
  // Which sources failed, so a retry is not attempted on every render.
  const [broken, setBroken] = useState<Record<string, true>>({});

  const shown = images.length > 0 ? images : [{ url: IMAGE_PLACEHOLDER, alt: null, width: null, height: null }];
  const current = shown[Math.min(active, shown.length - 1)] ?? shown[0];
  const src = current ? imageSrc(current.url) : IMAGE_PLACEHOLDER;

  const resolve = (url: string) => (broken[url] ? IMAGE_PLACEHOLDER : url);
  const fail = (url: string) =>
    setBroken((prev) => (prev[url] ? prev : { ...prev, [url]: true }));

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolve(src)}
          alt={current?.alt ?? title}
          onError={() => fail(src)}
          className="aspect-square w-full object-contain"
        />
      </div>

      {shown.length > 1 ? (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {shown.map((image, index) => {
            const thumb = imageSrc(image.url);
            return (
              <li key={`${image.url}-${index}`}>
                <button
                  type="button"
                  onClick={() => setActive(index)}
                  aria-current={index === active}
                  aria-label={`Photo ${index + 1} of ${shown.length}`}
                  className={`block h-16 w-16 shrink-0 overflow-hidden rounded-md border ${
                    index === active ? "border-accent" : "border-line"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolve(thumb)}
                    alt=""
                    onError={() => fail(thumb)}
                    className="h-full w-full object-contain"
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
