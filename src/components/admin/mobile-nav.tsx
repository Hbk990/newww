"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import type { NavItem, NavSection } from "@/lib/admin/nav";

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * A bottom bar for the few things you do standing in the shop, and a drawer for
 * everything else.
 *
 * The bar holds the four destinations chosen for one-thumb reach; the fifth
 * slot opens the drawer rather than being a fifth destination, because a
 * five-item bar has tap targets too narrow to hit reliably.
 */
export function MobileNav({
  sections,
  footer,
}: {
  sections: NavSection[];
  footer: NavItem[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // The drawer closes from the link that was tapped rather than from an effect
  // watching the path: an effect here sets state during render-commit, which
  // costs an extra render on every navigation in the whole admin.

  // A drawer over the page must not leave the page behind it scrolling.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const bar = sections.flatMap((s) => s.items).filter((i) => i.mobile);

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-line bg-raised">
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <span className="font-semibold tracking-tight">DRPHONE</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-1.5 text-muted hover:bg-sunken"
              >
                <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 px-2 py-3">
              {sections.map((section) => (
                <div key={section.heading} className="mb-4">
                  <h2 className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {section.heading}
                  </h2>
                  {section.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm ${
                        isActive(pathname, item.href)
                          ? "bg-accent-soft font-medium text-ink"
                          : "text-muted"
                      }`}
                    >
                      <Icon path={item.icon} />
                      {item.label}
                    </Link>
                  ))}
                </div>
              ))}
            </nav>
            <div className="border-t border-line px-2 py-2">
              {footer.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted"
                >
                  <Icon path={item.icon} />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-raised pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {bar.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${
              isActive(pathname, item.href) ? "text-ink" : "text-muted"
            }`}
          >
            <Icon path={item.icon} />
            {item.label}
          </Link>
        ))}
        {/* Search is a destination on the phone but not a route — it focuses
            the box in the top bar, which is where search actually lives. */}
        <button
          type="button"
          onClick={() => {
            const box = document.getElementById("admin-search");
            if (box instanceof HTMLInputElement) {
              box.scrollIntoView({ block: "nearest" });
              box.focus();
            }
          }}
          className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted"
        >
          <Icon path="M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12M20 20l-4.5-4.5" />
          Search
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted"
        >
          <Icon path="M4 6h16M4 12h16M4 18h16" />
          More
        </button>
      </nav>
    </>
  );
}
