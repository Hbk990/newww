"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { NavGroup } from "@/lib/storefront/nav";

/**
 * The shop's header: announcement strip, wordmark, centred menu, actions.
 *
 * The menu opens a single full-width panel that stays mounted while the
 * pointer moves along the bar, so crossing from one group to the next
 * cross-fades the contents instead of closing and reopening. That is the
 * difference between a menu that feels considered and one that flickers.
 *
 * Every nav label is one word. The panel's own heading carries the full group
 * name, so "Phones" in the bar becomes "Phones & Power" the moment it opens —
 * six full names across a centred bar would not fit a laptop, let alone leave
 * room for search and basket.
 */
const NAV_LABEL: Record<string, string> = {
  "phones-power": "Phones",
  "audio-wearables": "Audio",
  "home-lifestyle": "Home",
  "gaming-computers": "Gaming",
  "cameras-security": "Cameras",
};

/** How long the panel waits before closing, so a diagonal mouse path survives. */
const CLOSE_DELAY_MS = 140;

export function SiteHeader({
  groups,
  basketCount,
  signedIn,
  storeName,
  announcements,
}: {
  groups: NavGroup[];
  basketCount: number;
  signedIn: boolean;
  storeName: string;
  announcements: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  /*
   * A route change must close everything: the panel overlays the page, and a
   * menu still hanging open over the page it just navigated to is a bug people
   * report as "the menu is stuck".
   *
   * Adjusted during render rather than in an effect. React's own guidance for
   * "reset state when a prop changes", and the one the lint rule enforces: an
   * effect would paint the new page with the old menu open for a frame first.
   */
  const [shownPath, setShownPath] = useState(pathname);
  if (shownPath !== pathname) {
    setShownPath(pathname);
    setOpen(null);
    setMenuOpen(false);
    setSearching(false);
  }

  useEffect(() => {
    if (searching) searchInput.current?.focus();
  }, [searching]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(null);
      setMenuOpen(false);
      setSearching(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function hold(slug: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(slug);
  }

  function release() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(null), CLOSE_DELAY_MS);
  }

  const active = groups.find((group) => group.slug === open) ?? null;

  return (
    <header className="sticky top-0 z-40 bg-surface">
      <Announcements messages={announcements} />

      <div className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:h-16 sm:px-6">
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            aria-label="Menu"
            className="-ml-1 p-2 md:hidden"
          >
            <Bars open={menuOpen} />
          </button>

          <Link
            href="/"
            className="display shrink-0 text-xl tracking-tight sm:text-2xl"
          >
            {storeName}
            <span className="text-accent">.</span>
          </Link>

          {/* The bar itself. Hidden on phones, where the tab bar and the
              drawer do this job. */}
          <nav
            aria-label="Categories"
            className="hidden flex-1 items-center justify-center gap-1 md:flex"
            onMouseLeave={release}
          >
            {groups.map((group) => (
              <button
                key={group.slug}
                type="button"
                aria-expanded={open === group.slug}
                onMouseEnter={() => hold(group.slug)}
                onFocus={() => hold(group.slug)}
                onClick={() =>
                  router.push(`/c/${group.slug}` as Route)
                }
                className="group relative px-3 py-2 text-sm"
              >
                {NAV_LABEL[group.slug] ?? group.name}
                {/* The rule grows from the centre rather than wiping in from
                    one side, so it reads as the item lighting up. */}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-3 bottom-1 h-px origin-center bg-accent transition-transform duration-300 ${
                    open === group.slug ? "scale-x-100" : "scale-x-0"
                  } group-hover:scale-x-100`}
                />
              </button>
            ))}
            <Link
              href="/phones"
              className="group relative px-3 py-2 text-sm"
              onMouseEnter={release}
            >
              Shop by phone
              <span
                aria-hidden="true"
                className="absolute inset-x-3 bottom-1 h-px origin-center scale-x-0 bg-accent transition-transform duration-300 group-hover:scale-x-100"
              />
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-1 md:ml-0">
            {/* Search opens in place rather than on its own page: one tap from
                any product to another search is the difference between
                browsing and giving up. */}
            {searching ? (
              <form
                action="/search"
                className="flex items-center gap-2"
                onSubmit={() => setSearching(false)}
              >
                <label className="sr-only" htmlFor="header-search">
                  Search products
                </label>
                <input
                  ref={searchInput}
                  id="header-search"
                  name="q"
                  type="search"
                  placeholder="Search 1,000+ products"
                  className="w-40 rounded-md border border-line bg-raised px-3 py-1.5 text-sm sm:w-64"
                  onBlur={(event) => {
                    if (!event.currentTarget.value) setSearching(false);
                  }}
                />
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setSearching(true)}
                aria-label="Search"
                className="p-2"
              >
                <Glass />
              </button>
            )}

            <Link
              href={signedIn ? "/account" : "/login"}
              aria-label={signedIn ? "Your account" : "Sign in"}
              className="hidden p-2 sm:block"
            >
              <Person />
            </Link>

            <Link href="/cart" aria-label="Basket" className="relative p-2">
              <Basket />
              {basketCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-on-accent tabular">
                  {basketCount}
                </span>
              ) : null}
            </Link>
          </div>
        </div>
      </div>

      {/*
        One panel for every group. It is always in the tree while a group is
        open, and only its contents change — that is what lets the columns
        cross-fade as the pointer travels the bar.
      */}
      <div
        className={`absolute inset-x-0 top-full hidden border-b border-line bg-sunken md:block ${
          active
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0"
        } transition-[opacity,transform] duration-300 ease-out`}
        onMouseEnter={() => active && hold(active.slug)}
        onMouseLeave={release}
        aria-hidden={active === null}
      >
        {active ? (
          <div
            key={active.slug}
            className="mx-auto grid max-w-7xl gap-8 px-6 py-10 md:grid-cols-[260px_1fr]"
          >
            <div>
              <h2 className="display text-2xl">{active.name}</h2>
              <p className="mt-2 text-sm text-muted">
                {active.categories.reduce((n, c) => n + c.productCount, 0)}{" "}
                products in {active.categories.length} categories
              </p>
              <Link
                href={`/c/${active.slug}` as Route}
                className="mt-4 inline-block border-b border-accent pb-0.5 text-sm font-medium text-accent"
              >
                Shop all {active.name}
              </Link>
            </div>

            {/* max-w-2xl: without it three columns spread across a laptop and
                the names end up further from each other than from the next
                group's. Tight columns read as one list. */}
            <ul className="grid max-w-2xl gap-x-10 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {active.categories.map((category, index) => (
                <li
                  key={category.slug}
                  className="animate-rise"
                  /* Each column starts a beat after the one before it. Capped,
                     because a customer should never wait on decoration. */
                  style={{ animationDelay: `${Math.min(index, 11) * 22}ms` }}
                >
                  <Link
                    href={`/c/${category.slug}` as Route}
                    className="inline-flex items-baseline gap-2 py-1.5 text-sm hover:text-accent"
                  >
                    <span>{category.name}</span>
                    {/* Beside the name, not pushed to the column edge: a count
                        that far from its label reads as a different column. */}
                    <span className="text-xs text-muted tabular">
                      {category.productCount}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* The phone drawer: the same categories, as a plain accordion-free list
          under each group heading. No hover, no timers — a thumb has neither. */}
      {menuOpen ? (
        <div className="max-h-[75vh] overflow-y-auto border-b border-line bg-sunken px-4 py-5 md:hidden">
          <Link href="/phones" className="block py-2 text-sm font-medium text-accent">
            Shop by phone →
          </Link>
          {groups.map((group) => (
            <div key={group.slug} className="mt-4">
              <Link
                href={`/c/${group.slug}` as Route}
                className="display block text-lg"
              >
                {group.name}
              </Link>
              <ul className="mt-1 grid grid-cols-2 gap-x-4">
                {group.categories.map((category) => (
                  <li key={category.slug}>
                    <Link
                      href={`/c/${category.slug}` as Route}
                      className="block py-1.5 text-sm text-muted"
                    >
                      {category.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </header>
  );
}

/**
 * The strip above the header, one message at a time.
 *
 * Rotating rather than stacking three lines: the messages are equally true and
 * none is urgent, so they take turns instead of eating the top of every page.
 * The arrows exist because an automatic rotation that cannot be steered is a
 * message you cannot finish reading.
 */
function Announcements({ messages }: { messages: string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (messages.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(
      () => setIndex((value) => (value + 1) % messages.length),
      6500,
    );
    return () => clearInterval(timer);
  }, [messages.length]);

  if (messages.length === 0) return null;
  const step = (by: number) =>
    setIndex((value) => (value + by + messages.length) % messages.length);

  return (
    <div className="bg-ink text-surface">
      {/* max-w-xl, not max-w-7xl: the arrows belong beside the message they
          steer, not at the far edges of a laptop screen. */}
      <div className="mx-auto flex h-9 max-w-xl items-center justify-between gap-2 px-4">
        {messages.length > 1 ? (
          <button type="button" onClick={() => step(-1)} aria-label="Previous message" className="px-1 text-xs opacity-70 hover:opacity-100">
            ←
          </button>
        ) : (
          <span />
        )}
        {/* aria-live: the text changes without anyone acting, so a screen
            reader is told politely rather than not at all. */}
        <p aria-live="polite" className="truncate text-center text-xs">
          {messages[index]}
        </p>
        {messages.length > 1 ? (
          <button type="button" onClick={() => step(1)} aria-label="Next message" className="px-1 text-xs opacity-70 hover:opacity-100">
            →
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

/* Inline SVGs rather than an icon package: five icons at 18px, and the
   dependency would outweigh them. */
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Glass() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

function Person() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20c1.2-4 4-5.6 7.5-5.6S18.3 16 19.5 20" />
    </svg>
  );
}

function Basket() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M4 8h16l-1.4 11.2a1.6 1.6 0 0 1-1.6 1.4H7a1.6 1.6 0 0 1-1.6-1.4z" />
      <path d="M8.5 8V6.2A3.5 3.5 0 0 1 12 2.7a3.5 3.5 0 0 1 3.5 3.5V8" />
    </svg>
  );
}

function Bars({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      {open ? (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </>
      ) : (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      )}
    </svg>
  );
}
