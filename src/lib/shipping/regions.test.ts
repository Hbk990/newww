import { describe, expect, it } from "vitest";

import { isRegion, LEBANON_REGIONS, priceAfterFreeDelivery } from "./regions";

describe("LEBANON_REGIONS", () => {
  it("is the eight governorates the zones are written against", () => {
    // Migration 0023 seeds three zones whose arrays must between them cover
    // exactly this list, or a shopper picks a region no zone matches and is
    // told the shop does not deliver to them.
    expect(LEBANON_REGIONS).toHaveLength(8);
    expect([...LEBANON_REGIONS].sort()).toEqual([
      "Akkar",
      "Baalbek-Hermel",
      "Beirut",
      "Beqaa",
      "Mount Lebanon",
      "Nabatieh",
      "North",
      "South",
    ]);
  });

  it("recognises a governorate and rejects a near miss", () => {
    expect(isRegion("Mount Lebanon")).toBe(true);
    // The spellings a free-text field would have produced.
    expect(isRegion("mount lebanon")).toBe(false);
    expect(isRegion("Mt Lebanon")).toBe(false);
    expect(isRegion("Jabal Loubnan")).toBe(false);
    expect(isRegion("")).toBe(false);
  });
});

describe("priceAfterFreeDelivery", () => {
  it("charges the rate when neither threshold is set", () => {
    expect(priceAfterFreeDelivery(300, 9_999_99, null, null)).toEqual({
      priceCents: 300,
      free: false,
    });
  });

  it("charges the rate below both thresholds", () => {
    expect(priceAfterFreeDelivery(300, 4000, 5000, 8000)).toEqual({
      priceCents: 300,
      free: false,
    });
  });

  it("is free once the zone's own offer is cleared", () => {
    expect(priceAfterFreeDelivery(300, 5000, 5000, null)).toEqual({
      priceCents: 0,
      free: true,
    });
  });

  it("is free once the shop-wide threshold is cleared", () => {
    expect(priceAfterFreeDelivery(500, 8000, null, 8000)).toEqual({
      priceCents: 0,
      free: true,
    });
  });

  it("either threshold alone is enough — the lower one wins in practice", () => {
    /*
     * The rule worth pinning. A zone offering free delivery over $50 and a shop
     * offering it over $100 must not require both: a $60 basket in that zone is
     * free, and requiring both thresholds would silently withdraw an offer the
     * shop is advertising.
     */
    expect(priceAfterFreeDelivery(300, 6000, 5000, 10_000).free).toBe(true);
    expect(priceAfterFreeDelivery(300, 6000, 10_000, 5000).free).toBe(true);
    expect(priceAfterFreeDelivery(300, 4000, 5000, 10_000).free).toBe(false);
  });

  it("treats the threshold as inclusive", () => {
    // "Free over $50" on a $50 basket reads as free to a shopper; charging
    // them is the kind of detail that produces a phone call.
    expect(priceAfterFreeDelivery(300, 5000, 5000, null).free).toBe(true);
    expect(priceAfterFreeDelivery(300, 4999, 5000, null).free).toBe(false);
  });

  it("a zero threshold means always free, not never", () => {
    // Someone typing 0 into "free delivery over" means it, and `0` must not be
    // mistaken for "unset" the way a falsy check would.
    expect(priceAfterFreeDelivery(300, 0, 0, null).free).toBe(true);
    expect(priceAfterFreeDelivery(300, 0, null, 0).free).toBe(true);
  });
});
