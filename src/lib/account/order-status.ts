/**
 * What an order's state is called when a customer reads it.
 *
 * The database keeps eight statuses because the shop needs eight: `preparing`
 * and `ready` are different jobs for whoever packs, and `out_for_delivery`
 * gates the courier's worklist. A customer needs none of that granularity —
 * they need to know whether anything is expected of them and roughly when a
 * parcel arrives — and "out_for_delivery" is not English anyone says out loud.
 *
 * Pure, so the wording is tested rather than eyeballed, and so a new enum
 * value cannot quietly render as a raw database string: `describeOrder` is
 * exhaustive over the union and the compiler refuses an unhandled case.
 */

export type OrderStatus =
  | "new"
  | "confirmed"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "returned";

export type PaymentStatus =
  | "unpaid"
  | "paid"
  | "partially_refunded"
  | "refunded";

/** How prominently to draw the state. */
export type Tone = "waiting" | "moving" | "done" | "stopped";

export type OrderSummary = {
  /** Two or three words, in a badge. */
  label: string;
  /** One sentence saying what is happening or what to expect. */
  detail: string;
  tone: Tone;
};

export function describeOrder(
  status: OrderStatus,
  paymentStatus: PaymentStatus,
): OrderSummary {
  switch (status) {
    case "new":
      return {
        label: "Waiting for our call",
        // The confirmation call gates everything, so this is the one state
        // where the customer should expect their phone to ring.
        detail:
          "We call to confirm the order and the address before anything is packed.",
        tone: "waiting",
      };

    case "confirmed":
      return {
        label: "Confirmed",
        detail: "Confirmed with you. It goes to be packed next.",
        tone: "moving",
      };

    case "preparing":
      return {
        label: "Being packed",
        detail: "Someone is putting your order together.",
        tone: "moving",
      };

    case "ready":
      return {
        label: "Ready to go",
        detail: "Packed and waiting for a driver.",
        tone: "moving",
      };

    case "out_for_delivery":
      return {
        label: "On the way",
        detail:
          "A driver has it. Have the cash ready — they call when they are close.",
        tone: "moving",
      };

    case "delivered":
      return {
        label: "Delivered",
        detail:
          paymentStatus === "paid"
            ? "Delivered and paid. Thank you."
            : // Delivered but unpaid is a real state in cash on delivery: the
              // courier has not remitted yet. It is not the customer's problem
              // and must not read like a demand.
              "Delivered. Thank you.",
        tone: "done",
      };

    case "cancelled":
      return {
        label: "Cancelled",
        detail:
          paymentStatus === "refunded" || paymentStatus === "partially_refunded"
            ? "Cancelled, and the money has been returned."
            : "Cancelled. Nothing was charged.",
        tone: "stopped",
      };

    case "returned":
      return {
        label: "Returned",
        detail:
          paymentStatus === "refunded"
            ? "Returned to us and refunded in full."
            : paymentStatus === "partially_refunded"
              ? "Returned to us and partly refunded."
              : "Returned to us. Call if you are expecting money back.",
        tone: "stopped",
      };
  }
}

/**
 * What is still to be paid at the door, in cents, or null when nothing is.
 *
 * Cash on delivery means the total is owed until the courier collects it, so
 * "to pay: $14.99" is the single most useful line on the page — and it must
 * disappear the moment it stops being true, which includes an order that was
 * cancelled before anyone paid anything.
 */
export function amountDueCents(
  status: OrderStatus,
  paymentStatus: PaymentStatus,
  totalCents: number,
): number | null {
  if (paymentStatus !== "unpaid") return null;
  if (status === "cancelled" || status === "returned") return null;
  // Delivered and unpaid means the courier has the cash and has not remitted.
  // Nothing is owed by the customer.
  if (status === "delivered") return null;
  return totalCents;
}

/**
 * Whether the order can still be changed by calling.
 *
 * Once it is with a driver, a phone call to the shop cannot stop it — being
 * honest about that is better than inviting a call that achieves nothing.
 */
export function canStillChange(status: OrderStatus): boolean {
  return status === "new" || status === "confirmed" || status === "preparing";
}
