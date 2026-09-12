"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The phone tab bar.
 *
 * Five destinations, thumb-height, fixed to the bottom. Shop goes to a real
 * page listing every category rather than opening a drawer: it works with no
 * JavaScript, it can be linked to and shared, and search engines can read it.
 *
 * `pb-[env(safe-area-inset-bottom)]` keeps the row clear of the home
 * indicator on an iPhone, where the bottom 34px of the screen is not tappable.
 */
const TABS = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/categories", label: "Shop", icon: GridIcon },
  { href: "/search", label: "Search", icon: GlassIcon },
  { href: "/cart", label: "Basket", icon: BasketIcon },
  { href: "/account", label: "Account", icon: PersonIcon },
] as const;

export function BottomBar({ basketCount }: { basketCount: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((tab) => {
          const current =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${
                  current ? "text-accent" : "text-muted"
                }`}
              >
                <span className="relative">
                  <Icon />
                  {tab.href === "/cart" && basketCount > 0 ? (
                    <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-on-accent tabular">
                      {basketCount}
                    </span>
                  ) : null}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M4 11.5L12 4.5l8 7" />
      <path d="M6.5 10.5V20h11v-9.5" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" />
    </svg>
  );
}

function GlassIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

function BasketIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M4 8h16l-1.4 11.2a1.6 1.6 0 0 1-1.6 1.4H7a1.6 1.6 0 0 1-1.6-1.4z" />
      <path d="M8.5 8V6.2A3.5 3.5 0 0 1 12 2.7a3.5 3.5 0 0 1 3.5 3.5V8" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20c1.2-4 4-5.6 7.5-5.6S18.3 16 19.5 20" />
    </svg>
  );
}
