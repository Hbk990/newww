import { describe, expect, it } from "vitest";

import { skuFragment, slugify } from "./slug";

describe("slugify", () => {
  it("keeps the plus that distinguishes a device from its sibling", () => {
    /*
     * The regression this file exists for. Stripping `+` collapsed four real
     * devices onto their non-plus siblings, and a case that fits one does not
     * fit the other.
     */
    expect(slugify("Galaxy Tab A9+")).toBe("galaxy-tab-a9-plus");
    expect(slugify("Galaxy Tab A9")).toBe("galaxy-tab-a9");
    expect(slugify("Galaxy Tab A9+")).not.toBe(slugify("Galaxy Tab A9"));
  });

  it("folds accents instead of dropping the letters under them", () => {
    expect(slugify("Écouteurs")).toBe("ecouteurs");
  });

  it("collapses runs of punctuation and trims the ends", () => {
    expect(slugify("  iPhone 15 — Pro  Max !! ")).toBe("iphone-15-pro-max");
  });

  it("never emits a leading, trailing or doubled hyphen", () => {
    /*
     * Exact outputs, not just a shape assertion: `not.toMatch(/^-|-$|--/)`
     * alone is satisfied by the empty string, so a slugify that returned ""
     * for everything would pass a test written that way.
     */
    expect(slugify("+++")).toBe("plus-plus-plus");
    expect(slugify("A + B")).toBe("a-plus-b");
    expect(slugify("---x---")).toBe("x");
    expect(slugify("a  ---  b")).toBe("a-b");
    // Nothing alphanumeric survives, and an empty slug is the honest answer.
    expect(slugify("!!")).toBe("");
  });
});

describe("skuFragment", () => {
  it("keeps iPhone 15, 15 Pro and 15 Pro Max distinct", () => {
    /*
     * Truncating to six characters gave "IPHONE" three times and the unique
     * index on variants.sku rejected the second and third. Dropping the shared
     * family word keeps the part that differs.
     */
    const drop = ["iPhone"];
    const fragments = ["iPhone 15", "iPhone 15 Pro", "iPhone 15 Pro Max"].map(
      (title) => skuFragment(title, drop),
    );
    expect(fragments).toEqual(["15", "15PRO", "15PROMAX"]);
    expect(new Set(fragments).size).toBe(3);
  });

  it("falls back to the whole input when the dropped word is all there was", () => {
    // The option value named exactly after its family.
    expect(skuFragment("iPhone", ["iPhone"])).toBe("IPHONE");
  });

  it("spells the plus out rather than losing it", () => {
    expect(skuFragment("A9+", ["Galaxy Tab"])).toBe("A9PLUS");
    expect(skuFragment("Tab A9+", ["Galaxy"])).not.toBe(
      skuFragment("Tab A9", ["Galaxy"]),
    );
  });

  it("drops the family word case-insensitively", () => {
    expect(skuFragment("IPHONE 16", ["iphone"])).toBe("16");
  });
});
