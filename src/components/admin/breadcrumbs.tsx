"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

/**
 * Labels for path segments that would otherwise read badly.
 *
 * Anything not listed is title-cased from the segment, which covers most of the
 * admin. A uuid segment is replaced with "Edit" rather than shown — nobody
 * needs to read an id in a breadcrumb.
 */
const LABELS: Record<string, string> = {
  admin: "Admin",
  new: "New",
  "stock-counts": "Stock counts",
  adjust: "Adjustment",
  audit: "Audit log",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function label(segment: string): string {
  if (LABELS[segment]) return LABELS[segment];
  if (UUID.test(segment)) return "Edit";
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // On the dashboard itself there is no trail worth drawing.
  if (segments.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1.5">
        {segments.map((segment, index) => {
          const href = `/${segments.slice(0, index + 1).join("/")}` as Route;
          const last = index === segments.length - 1;
          return (
            <li key={href} className="flex items-center gap-1.5">
              {index > 0 ? <span aria-hidden>/</span> : null}
              {last ? (
                <span className="text-ink">{label(segment)}</span>
              ) : (
                <Link href={href} className="hover:text-ink hover:underline">
                  {label(segment)}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
