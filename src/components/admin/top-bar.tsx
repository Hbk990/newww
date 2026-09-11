"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";

import { ThemeToggle } from "./theme-toggle";

type CreateItem = { label: string; href: Route };

/** Closes a popover on outside click and on Escape. */
function useDismiss<T extends HTMLElement>(
  open: boolean,
  close: () => void,
): React.RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) close();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function SearchBox() {
  const input = useRef<HTMLInputElement>(null);

  /**
   * A shortcut that focuses the search box — not the command palette that was
   * declined. Slash is the convention for "jump to search" and does not collide
   * with a browser shortcut, unlike Ctrl+K.
   */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const active = document.activeElement;
      // Not while someone is typing in a field — they meant a slash.
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      input.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative min-w-0 flex-1 md:max-w-sm">
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <circle cx="11" cy="11" r="6" />
        <path d="M20 20l-4.5-4.5" />
      </svg>
      <input
        ref={input}
        id="admin-search"
        type="search"
        placeholder="Search products, orders, customers"
        aria-label="Search the admin"
        className="w-full rounded-md border border-line bg-sunken py-1.5 pl-8 pr-8 text-sm placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 py-0.5 text-[10px] text-muted md:block">
        /
      </kbd>
    </div>
  );
}

function CreateMenu({ items }: { items: CreateItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  if (items.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-surface"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span className="hidden sm:inline">Create</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 w-52 overflow-hidden rounded-md border border-line bg-raised py-1 shadow-lg"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm hover:bg-sunken"
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Notifications({ unread }: { unread: number }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
        className="relative rounded-md p-2 text-muted hover:bg-sunken hover:text-ink"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-2 8-2 8h16s-2-1-2-8M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 ? (
          <span className="absolute right-1 top-1 min-w-4 rounded-full bg-bad px-1 text-[10px] font-semibold leading-4 text-surface tabular">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1.5 w-80 rounded-md border border-line bg-raised shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-sm font-medium">Notifications</span>
          </div>
          <p className="px-3 py-6 text-center text-sm text-muted">
            Nothing yet. New orders, low stock, failed emails and new reviews
            will appear here.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function AccountMenu({
  name,
  role,
  signOut,
}: {
  name: string;
  role: string;
  signOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sunken"
      >
        <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-xs font-semibold uppercase">
          {name.slice(0, 2)}
        </span>
        <span className="hidden max-w-28 truncate md:inline">{name}</span>
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1.5 w-52 overflow-hidden rounded-md border border-line bg-raised py-1 shadow-lg">
          <div className="border-b border-line px-3 pb-2 pt-1">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="text-xs text-muted">{role}</p>
          </div>
          <Link
            href="/account/password"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm hover:bg-sunken"
          >
            Change password
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-sunken"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function TopBar({
  createItems,
  unread,
  name,
  role,
  signOut,
}: {
  createItems: CreateItem[];
  unread: number;
  name: string;
  role: string;
  signOut: () => Promise<void>;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface px-3 md:px-5">
      <span className="font-semibold tracking-tight md:hidden">DRPHONE</span>
      <SearchBox />
      <div className="ml-auto flex items-center gap-1">
        <CreateMenu items={createItems} />
        <Notifications unread={unread} />
        <ThemeToggle />
        <AccountMenu name={name} role={role} signOut={signOut} />
      </div>
    </header>
  );
}
