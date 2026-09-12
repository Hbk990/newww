"use client";

import { useCallback, useState } from "react";

import { imageSrc, IMAGE_PLACEHOLDER } from "@/lib/shop/image-url";

/**
 * A product photo that falls back to the placeholder when the file is missing.
 *
 * `onError` alone does not work here, and the first screenshots of the catalog
 * proved it: the markup is server-rendered, so the browser starts fetching
 * before React hydrates. A 404 arriving in that window fires an error event
 * with no listener attached, it is never replayed, and Chrome's broken-image
 * icon stays for good. Every product in the shop is in that window today,
 * since the catalog was imported without its photo files.
 *
 * The ref callback closes it: on mount, an image that has finished loading
 * with no intrinsic width has already failed.
 *
 * A plain <img> rather than next/image, deliberately: the imported rows carry
 * no width or height, and a 404 through the image optimiser breaks the whole
 * route where a broken <img> is one placeholder away. This becomes next/image
 * when real photos land with dimensions.
 */
export function Photo({
  url,
  alt,
  className,
  eager = false,
}: {
  url: string | null | undefined;
  alt: string;
  className: string;
  /** True for the one photo above the fold; everything else waits. */
  eager?: boolean;
}) {
  const src = imageSrc(url);
  const [broken, setBroken] = useState(false);

  const check = useCallback((node: HTMLImageElement | null) => {
    if (node && node.complete && node.naturalWidth === 0) setBroken(true);
  }, []);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={check}
      src={broken ? IMAGE_PLACEHOLDER : src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      onError={() => setBroken(true)}
      className={className}
    />
  );
}
