import { describe, expect, it } from "vitest";

import { lowestOf } from "./price-window";

/** Shorthand for a recorded change. */
const change = (from: number | null, to: number | null) => ({
  oldCents: from,
  newCents: to,
});

describe("lowestOf", () => {
  it("is today's price when nothing changed in the window", () => {
    expect(lowestOf(1500, [])).toBe(1500);
  });

  it("includes the price the window opened at", () => {
    /*
     * The case that makes this worth extracting. A variant that went from $5 to
     * $9 inside the window was $5 for part of it — reading only `newCents`
     * would report $9 as the floor, which is both wrong and flattering.
     */
    expect(lowestOf(900, [change(500, 900)])).toBe(500);
  });

  it("includes today's price even when it is the lowest", () => {
    // Omitting the current price would report a floor above what is charged
    // right now, which is nonsense on its face.
    expect(lowestOf(400, [change(900, 400)])).toBe(400);
  });

  it("finds the dip in the middle of a run of changes", () => {
    expect(
      lowestOf(1200, [
        change(1000, 800),
        change(800, 600),
        change(600, 1200),
      ]),
    ).toBe(600);
  });

  it("ignores nulls rather than treating them as zero", () => {
    /*
     * old_cents and new_cents are both nullable — a price set for the first
     * time has no old value. Math.min over a null would coerce it to 0 and
     * report free.
     */
    expect(lowestOf(1500, [change(null, 1500)])).toBe(1500);
    expect(lowestOf(1500, [change(2000, null)])).toBe(1500);
    expect(lowestOf(1500, [change(null, null)])).toBe(1500);
  });

  it("is never affected by the order rows arrive in beyond the first", () => {
    // Only `changes[0]` is positional — it must be the earliest, which the
    // query orders by. The rest contribute regardless of order.
    const forward = lowestOf(1200, [change(1000, 700), change(700, 1200)]);
    expect(forward).toBe(700);
  });
});
