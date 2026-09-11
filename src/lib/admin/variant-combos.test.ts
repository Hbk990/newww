import { describe, expect, it } from "vitest";

import { comboKey, expand, type AxisLike } from "./variant-combos";

const axis = (...values: string[]): AxisLike => ({
  values: values.map((value) => ({ value })),
});

describe("expand", () => {
  it("gives one empty combination when there are no axes", () => {
    // The single default variant every product starts with.
    expect(expand([])).toEqual([[]]);
  });

  it("walks the axes in order, last axis varying fastest", () => {
    expect(expand([axis("iPhone 15", "iPhone 16"), axis("Black", "Red")])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
  });

  it("produces the product of the axis lengths", () => {
    const combos = expand([axis("a", "b", "c"), axis("x", "y"), axis("1", "2", "3", "4")]);
    expect(combos).toHaveLength(24);
    expect(new Set(combos.map((c) => c.join(","))).size).toBe(24);
  });

  it("produces nothing when an axis has no values", () => {
    // An axis added but not yet filled in must not silently yield a variant.
    expect(expand([axis("Black"), axis()])).toEqual([]);
  });
});

describe("comboKey", () => {
  it("names a combination by its values, not its positions", () => {
    const axes = [axis("iPhone 15", "iPhone 16"), axis("Black", "Red")];
    expect(comboKey(axes, [1, 0])).toBe("iPhone 16 / Black");
  });

  it("keeps a row's identity when a value is removed from above it", () => {
    /*
     * The reason keys are values rather than indexes. "iPhone 16" sits at
     * index 1 of three and index 0 of two after "iPhone 15" is deleted; an
     * index-based key would re-point the price typed against it at whatever
     * moved into slot 1.
     */
    const before = [axis("iPhone 15", "iPhone 16", "iPhone 17")];
    const after = [axis("iPhone 16", "iPhone 17")];
    expect(comboKey(before, [1])).toBe(comboKey(after, [0]));
    expect(comboKey(before, [1])).toBe("iPhone 16");
  });

  it("returns an empty segment rather than throwing on a stale index", () => {
    // A grid rendered against axes that have since shrunk.
    expect(comboKey([axis("Black")], [7])).toBe("");
  });
});
