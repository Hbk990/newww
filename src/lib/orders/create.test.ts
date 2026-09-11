import { describe, expect, it } from "vitest";

// `import type` is erased at compile time, so naming create.ts here does not
// load it — and so does not open a database connection.
import type { CreateOrderRequest } from "./create";
import { effectivePrice, hashRequest } from "./pricing";

const base = (over: Partial<CreateOrderRequest> = {}): CreateOrderRequest => ({
  email: "Customer@Example.com",
  phone: "+961 70 000 000",
  shippingAddress: { line1: "Hamra", city: "Beirut", country: "LB" },
  lines: [{ variantId: "a", quantity: 1 }],
  shippingCents: 300,
  source: "web",
  ...over,
});

describe("effectivePrice", () => {
  const noSale = { priceCents: 1999, salePriceCents: null, saleStartsAt: null, saleEndsAt: null };
  const window = (from: string, to: string) => ({
    priceCents: 1999,
    salePriceCents: 1499,
    saleStartsAt: new Date(from),
    saleEndsAt: new Date(to),
  });
  const now = new Date("2026-06-15T12:00:00Z");

  it("charges the shelf price when there is no sale", () => {
    expect(effectivePrice(noSale, now)).toBe(1999);
  });

  it("charges the sale price inside the window", () => {
    expect(effectivePrice(window("2026-06-01", "2026-06-30"), now)).toBe(1499);
  });

  it("charges the shelf price before the sale opens and after it closes", () => {
    expect(effectivePrice(window("2026-07-01", "2026-07-31"), now)).toBe(1999);
    expect(effectivePrice(window("2026-01-01", "2026-01-31"), now)).toBe(1999);
  });

  it("includes both ends of the window", () => {
    const w = window("2026-06-15T12:00:00Z", "2026-06-20T00:00:00Z");
    expect(effectivePrice(w, new Date("2026-06-15T12:00:00Z"))).toBe(1499);
    const closing = window("2026-06-01T00:00:00Z", "2026-06-15T12:00:00Z");
    expect(effectivePrice(closing, new Date("2026-06-15T12:00:00Z"))).toBe(1499);
    expect(effectivePrice(closing, new Date("2026-06-15T12:00:01Z"))).toBe(1999);
  });
});

describe("hashRequest", () => {
  it("is the same for the same basket in a different order", () => {
    /*
     * The property idempotency rests on. Without the sort, a client that
     * shuffles its cart between the first request and its retry would produce
     * a different hash, be treated as a different order, and the customer
     * would get two deliveries.
     */
    const forward = hashRequest(
      base({ lines: [{ variantId: "a", quantity: 2 }, { variantId: "b", quantity: 1 }] }),
    );
    const reversed = hashRequest(
      base({ lines: [{ variantId: "b", quantity: 1 }, { variantId: "a", quantity: 2 }] }),
    );
    expect(forward).toBe(reversed);
  });

  it("differs when a quantity changes", () => {
    expect(hashRequest(base({ lines: [{ variantId: "a", quantity: 1 }] }))).not.toBe(
      hashRequest(base({ lines: [{ variantId: "a", quantity: 2 }] })),
    );
  });

  it("differs when the delivery fee changes", () => {
    expect(hashRequest(base({ shippingCents: 300 }))).not.toBe(
      hashRequest(base({ shippingCents: 500 })),
    );
  });

  it("ignores the casing of the email and the spacing of the phone", () => {
    // The same person typing their details again slightly differently is the
    // same order, not a new one.
    expect(hashRequest(base({ email: "customer@example.com", phone: "+96170000000" }))).toBe(
      hashRequest(base({ email: "Customer@Example.COM", phone: "+961 70 000 000" })),
    );
  });

  it("does not collapse two different baskets onto one hash", () => {
    const single = hashRequest(base({ lines: [{ variantId: "ab", quantity: 1 }] }));
    const pair = hashRequest(
      base({ lines: [{ variantId: "a", quantity: 1 }, { variantId: "b", quantity: 1 }] }),
    );
    expect(single).not.toBe(pair);
  });
});
