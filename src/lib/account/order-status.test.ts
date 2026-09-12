import { describe, expect, it } from "vitest";

import {
  amountDueCents,
  canStillChange,
  describeOrder,
  type OrderStatus,
  type PaymentStatus,
} from "./order-status";

const STATUSES: OrderStatus[] = [
  "new",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "returned",
];

const PAYMENTS: PaymentStatus[] = [
  "unpaid",
  "paid",
  "partially_refunded",
  "refunded",
];

describe("describeOrder", () => {
  it("has a label and a sentence for every combination", () => {
    for (const status of STATUSES) {
      for (const payment of PAYMENTS) {
        const summary = describeOrder(status, payment);
        expect(summary.label.length, `${status}/${payment}`).toBeGreaterThan(0);
        expect(summary.detail.length, `${status}/${payment}`).toBeGreaterThan(0);
        // No database vocabulary reaches a customer.
        expect(summary.label).not.toContain("_");
      }
    }
  });

  it("tells a new order's owner to expect a phone call", () => {
    // The confirmation call gates dispatch, so this is the one state where
    // something is expected of the customer.
    expect(describeOrder("new", "unpaid").detail).toMatch(/we call/i);
  });

  it("does not ask a delivered-but-unremitted order for money", () => {
    /*
     * Delivered and unpaid is normal in cash on delivery: the courier has the
     * cash and has not handed it over yet. That is the shop's bookkeeping, not
     * the customer's debt, and it must not read like a demand.
     */
    const summary = describeOrder("delivered", "unpaid");
    expect(summary.detail).not.toMatch(/pay|owe|due/i);
    expect(summary.tone).toBe("done");
  });

  it("says plainly that a cancelled order cost nothing", () => {
    expect(describeOrder("cancelled", "unpaid").detail).toMatch(
      /nothing was charged/i,
    );
    expect(describeOrder("cancelled", "refunded").detail).toMatch(/returned/i);
  });

  it("distinguishes a full refund from a partial one on a return", () => {
    expect(describeOrder("returned", "refunded").detail).toMatch(/in full/i);
    expect(describeOrder("returned", "partially_refunded").detail).toMatch(
      /partly/i,
    );
  });
});

describe("amountDueCents", () => {
  it("owes the whole total while the order is on its way", () => {
    expect(amountDueCents("new", "unpaid", 1499)).toBe(1499);
    expect(amountDueCents("out_for_delivery", "unpaid", 1499)).toBe(1499);
  });

  it("owes nothing once it is paid", () => {
    expect(amountDueCents("out_for_delivery", "paid", 1499)).toBeNull();
  });

  it("owes nothing on a cancelled or returned order", () => {
    expect(amountDueCents("cancelled", "unpaid", 1499)).toBeNull();
    expect(amountDueCents("returned", "unpaid", 1499)).toBeNull();
  });

  it("owes nothing once delivered, even before the courier remits", () => {
    expect(amountDueCents("delivered", "unpaid", 1499)).toBeNull();
  });
});

describe("canStillChange", () => {
  it("is true while the shop still has the parcel", () => {
    expect(canStillChange("new")).toBe(true);
    expect(canStillChange("confirmed")).toBe(true);
    expect(canStillChange("preparing")).toBe(true);
  });

  it("is false once a driver has it", () => {
    // Inviting a phone call that cannot stop the parcel is worse than saying
    // so.
    expect(canStillChange("ready")).toBe(false);
    expect(canStillChange("out_for_delivery")).toBe(false);
    expect(canStillChange("delivered")).toBe(false);
    expect(canStillChange("cancelled")).toBe(false);
  });
});
