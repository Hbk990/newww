/**
 * Pure helpers shared by the grid and the pages that load it.
 *
 * Deliberately not in `variant-grid.tsx`: that file is `"use client"`, and a
 * server component calling an export from it fails at runtime with "Attempted
 * to call comboKey() from the server" rather than at build time. The edit page
 * needs the same key the grid derives, so the logic lives somewhere both can
 * import.
 */

export type AxisValueLike = { value: string };
export type AxisLike = { values: AxisValueLike[] };

/**
 * The stable identity of a combination.
 *
 * Values rather than indexes: indexes shift when a value is removed from the
 * middle of an axis, which would silently re-point every row's typed price at
 * a different variant.
 */
export function comboKey(axes: AxisLike[], combo: number[]): string {
  return combo.map((v, i) => axes[i]?.values[v]?.value ?? "").join(" / ");
}

/** Every combination of the axes, in axis order. */
export function expand(axes: AxisLike[]): number[][] {
  return axes.reduce<number[][]>(
    (acc, axis) =>
      acc.flatMap((prefix) => axis.values.map((_, i) => [...prefix, i])),
    [[]],
  );
}
