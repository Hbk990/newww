"use client";

import { useStored, writeStored } from "@/lib/admin/use-stored";

const KEY = "drphone.theme";
type Theme = "system" | "light" | "dark";

/**
 * Cycles system → light → dark.
 *
 * "System" is the default and stamps no attribute, so the CSS falls back to
 * `prefers-color-scheme`. An explicit choice stamps `data-theme` on the root
 * element, which the palette in globals.css is written to respect in both
 * directions.
 *
 * The flash of the wrong theme on first paint is prevented by the inline script
 * in the root layout, not here — by the time React runs, the page has already
 * been painted.
 */
export function ThemeToggle() {
  const stored = useStored(KEY, "system");
  const theme: Theme =
    stored === "light" || stored === "dark" ? stored : "system";

  function cycle() {
    const next: Theme =
      theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
    writeStored(KEY, next === "system" ? null : next);
  }

  const label =
    theme === "system" ? "Theme: system" : `Theme: ${theme}`;

  return (
    <button
      type="button"
      onClick={cycle}
      title={label}
      aria-label={label}
      className="rounded-md p-2 text-muted hover:bg-sunken hover:text-ink"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {theme === "dark" ? (
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5" />
        ) : theme === "light" ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
          </>
        ) : (
          <>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none" />
          </>
        )}
      </svg>
    </button>
  );
}
