/**
 * The order lifecycle, and which step may follow which.
 *
 * Deliberately not in `order-actions.ts`: that file is `"use server"`, and
 * such a module may only export async functions. Exporting a const from there
 * fails the build with "Failed to collect configuration", naming the importing
 * page rather than the offending export.
 *
 * A map rather than a linear list because delivery can fail: an order out for
 * delivery either arrives or comes back. Anything absent here is not a legal
 * move, which is what stops an order being marked delivered before anyone has
 * confirmed it by phone.
 */
export const NEXT_STATUS: Record<string, readonly string[]> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "returned"],
  delivered: [],
  cancelled: [],
  returned: [],
};

/** Written for the person reading the screen, not after the enum. */
export const STATUS_LABELS: Record<string, string> = {
  new: "Awaiting call",
  confirmed: "Confirmed",
  preparing: "Being packed",
  ready: "Ready to go",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Came back",
};

/** The order the filter chips appear in — the lifecycle, not the enum's order. */
export const STATUS_ORDER = [
  "new",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "returned",
  "cancelled",
] as const;

export const EVENT_LABELS: Record<string, string> = {
  placed: "Order placed",
  confirmed: "Confirmed by phone",
  call_no_answer: "Called — no answer",
  status_preparing: "Started packing",
  status_ready: "Ready to go",
  status_out_for_delivery: "Out for delivery",
  status_delivered: "Delivered and paid",
  status_cancelled: "Cancelled",
  status_returned: "Came back undelivered",
};
