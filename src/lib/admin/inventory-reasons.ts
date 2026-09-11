/**
 * Why a quantity moved, as a closed list.
 *
 * Deliberately not in `inventory-actions.ts`: that file is `"use server"`, and
 * such a module may only export async functions. Exporting this array from
 * there fails the build with "Failed to collect configuration", which names
 * the importing page rather than the offending export.
 *
 * A closed list rather than free text because the ledger is the only record of
 * why stock changed, and "adj" or "fix" written six months ago answers
 * nothing. The note field carries the detail.
 */
export const ADJUST_REASONS = [
  { value: "received", label: "Received from supplier" },
  { value: "count", label: "Stock count correction" },
  { value: "damaged", label: "Damaged or faulty" },
  { value: "lost", label: "Lost or stolen" },
  { value: "returned_to_supplier", label: "Returned to supplier" },
  { value: "used_internally", label: "Used internally" },
] as const;

export const REASON_VALUES = ADJUST_REASONS.map((r) => r.value);

/**
 * Labels for every reason that can appear in the ledger.
 *
 * Wider than the list above: the order pipeline writes `sale` and
 * `refused_delivery`, and switching counting on writes `opening_count`. None
 * of those are offered on the adjustment form but all three show in history.
 */
export const REASON_LABELS: Record<string, string> = {
  ...Object.fromEntries(ADJUST_REASONS.map((r) => [r.value, r.label])),
  sale: "Sold",
  refused_delivery: "Delivery refused",
  opening_count: "Opening count",
  restock: "Returned to stock",
};
