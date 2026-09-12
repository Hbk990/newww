import { describe, expect, it } from "vitest";

import { imageSrc, IMAGE_PLACEHOLDER } from "./image-url";

describe("imageSrc", () => {
  it("adds the leading slash the imported catalog rows lack", () => {
    expect(imageSrc("uploads/p-494.webp")).toBe("/uploads/p-494.webp");
  });

  it("leaves a rooted path alone", () => {
    expect(imageSrc("/uploads/p-494.webp")).toBe("/uploads/p-494.webp");
  });

  it("passes absolute and protocol-relative URLs through", () => {
    expect(imageSrc("https://cdn.example.com/a.webp")).toBe(
      "https://cdn.example.com/a.webp",
    );
    expect(imageSrc("//cdn.example.com/a.webp")).toBe("//cdn.example.com/a.webp");
  });

  it("passes a data: preview through", () => {
    expect(imageSrc("data:image/webp;base64,AAAA")).toBe(
      "data:image/webp;base64,AAAA",
    );
  });

  it("falls back to the placeholder for nothing at all", () => {
    expect(imageSrc(null)).toBe(IMAGE_PLACEHOLDER);
    expect(imageSrc(undefined)).toBe(IMAGE_PLACEHOLDER);
    expect(imageSrc("   ")).toBe(IMAGE_PLACEHOLDER);
  });
})
