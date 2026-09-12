"use client";

import { useCallback, useState } from "react";

import { imageSrc, IMAGE_PLACEHOLDER } from "@/lib/shop/image-url";
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
  // Which sources failed, so a retry is not attempted on every render.
  const [broken, setBroken] = useState<Record<string, true>>({});

  const fail = useCallback((url: string) => {
    setBroken((prev) => (prev[url] ? prev : { ...prev, [url]: true }));
  }, []);

  const shown: ShopImage[] =
    images.length > 0
      ? images
      : [{ url: IMAGE_PLACEHOLDER, alt: null, width: null, height: null }];
  const current = shown[Math.min(active, shown.length - 1)] ?? shown[0];
  const mainSrc = current ? imageSrc(current.url) : IMAGE_PLACEHOLDER;

  return (
    <div className="md:sticky md:top-6">
      <div className="mx-auto max-w-md overflow-hidden rounded-xl border border-line bg-raised">
        <Photo
          src={mainSrc}
          alt={current?.alt ?? title}
          broken={broken}
          onFail={fail}
          className="aspect-square w-full object-contain"
        />
      </div>

      {shown.length > 1 ? (
        <ul className="mx-auto mt-3 flex max-w-md gap-2 overflow-x-auto pb-1">
          {shown.map((image, index) => {
            const thumb = imageSrc(image.url);
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
                    src={thumb}
                    alt=""
                    broken={broken}
                    onFail={fail}
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

/**
 * One <img> that falls back to the placeholder when its file is missing.
 *
 * `onError` alone is not enough and the first screenshots proved it: the markup
 * is server-rendered, so the browser starts fetching before React hydrates. A
 * 404 that arrives in that window fires an error event with no listener
 * attached, it is never replayed, and the broken-image icon stays for good —
 * which is what the whole catalog looks like today, since it was imported
 * without its photos.
 *
 * The ref callback closes that window: on mount, an image that has finished
 * loading with no intrinsic width has already failed.
 */
function Photo({
  src,
  alt,
  broken,
  onFail,
  className,
}: {
  src: string;
  alt: string;
  broken: Record<string, true>;
  onFail: (src: string) => void;
  className: string;
}) {
  const check = useCallback(
    (node: HTMLImageElement | null) => {
      if (node && node.complete && node.naturalWidth === 0) onFail(src);
    },
    [onFail, src],
  );

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={check}
      src={broken[src] ? IMAGE_PLACEHOLDER : src}
      alt={alt}
      onError={() => onFail(src)}
      className={className}
    />
  );
}
