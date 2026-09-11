"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A localStorage-backed value, read without a render-then-correct flash and
 * without setting state inside an effect.
 *
 * The obvious approach — read storage in `useEffect`, call `setState` — renders
 * twice on every mount and is what React 19's `set-state-in-effect` rule warns
 * about. `useSyncExternalStore` is built for exactly this: it uses the server
 * snapshot while hydrating, then switches to the client snapshot, so the markup
 * matches and there is no cascading render.
 *
 * Every access is wrapped: a private window, blocked site data and cleared
 * storage all throw rather than returning null.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changing the value should be reflected here too.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // A preference that cannot be stored still applies for this page view.
  }
  notify();
}

/** Reads a stored string, falling back to `fallback` on the server and when unset. */
export function useStored(key: string, fallback: string): string {
  const getSnapshot = useCallback(() => readStored(key) ?? fallback, [key, fallback]);
  const getServerSnapshot = useCallback(() => fallback, [fallback]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
