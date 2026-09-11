"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useStored, writeStored } from "@/lib/admin/use-stored";

import type { NavItem, NavSection } from "@/lib/admin/nav";

const COLLAPSED_KEY = "drphone.sidebar.collapsed";

function Icon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

/**
 * A link is active when the path matches it exactly, or sits beneath it —
 * except for the dashboard at `/admin`, which every other admin path sits
 * beneath and which would otherwise always look active.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Item({
  item,
  collapsed,
  pathname,
}: {
  item: NavItem;
  collapsed: boolean;
  pathname: string;
}) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ${
        active
          ? "bg-accent-soft font-medium text-ink"
          : "text-muted hover:bg-sunken hover:text-ink"
      } ${collapsed ? "justify-center px-0" : ""}`}
    >
      <Icon path={item.icon} />
      {collapsed ? null : <span className="truncate">{item.label}</span>}
    </Link>
  );
}

export function Sidebar({
  sections,
  footer,
}: {
  sections: NavSection[];
  footer: NavItem[];
}) {
  const pathname = usePathname();
  /**
   * Per-device and remembered. The server cannot know it, so it renders
   * expanded and switches after hydration — read through a store rather than an
   * effect, so there is no cascading render.
   */
  const collapsed = useStored(COLLAPSED_KEY, "0") === "1";

  function toggle() {
    writeStored(COLLAPSED_KEY, collapsed ? "0" : "1");
  }

  return (
    <aside
      className={`sticky top-0 hidden h-svh shrink-0 flex-col border-r border-line bg-raised md:flex ${
        collapsed ? "w-14" : "w-56"
      }`}
    >
      <div
        className={`flex h-14 items-center border-b border-line ${
          collapsed ? "justify-center" : "px-3"
        }`}
      >
        <Link
          href="/admin"
          className="font-semibold tracking-tight"
          title="DRPHONE admin"
        >
          {collapsed ? "DR" : "DRPHONE"}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {sections.map((section) => (
          <div key={section.heading} className="mb-4">
            {collapsed ? (
              <div className="mx-2 mb-2 border-t border-line" />
            ) : (
              <h2 className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {section.heading}
              </h2>
            )}
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <Item
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  pathname={pathname}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-line px-2 py-2">
        <div className="flex flex-col gap-0.5">
          {footer.map((item) => (
            <Item
              key={item.href}
              item={item}
              collapsed={collapsed}
              pathname={pathname}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          className={`mt-1 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted hover:bg-sunken hover:text-ink ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="size-5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <path d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
          </svg>
          {collapsed ? null : <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
