"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Toast = {
  text: string;
  tone: "ok" | "error";
  undo?: () => Promise<void>;
};

type ShowToast = (toast: Omit<Toast, "tone"> & { tone?: Toast["tone"] }) => void;

const ToastContext = createContext<ShowToast | null>(null);

/**
 * One toast host for the whole admin, rather than a copy per table.
 *
 * `products-table.tsx` grew its own `useState` toast, and every screen after it
 * would have grown another — each with slightly different dismiss timing and
 * its own bottom offset fighting the mobile nav. This centralises the markup
 * and the timer; callers only say what happened.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  // Holds the dismiss timer so a second toast cancels the first one's timeout
  // instead of clearing the new message early.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback<ShowToast>((next) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ tone: "ok", ...next });
    // An error stays up longer, and one offering Undo longer still: dismissing
    // an undo before it can be read makes the offer worthless.
    const ms = next.undo ? 9000 : next.tone === "error" ? 7000 : 4000;
    timer.current = setTimeout(() => setToast(null), ms);
  }, []);

  // Without this the context value is a new object each render, which would
  // re-render every consumer on any state change here.
  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <div
          // "assertive" for errors so a screen reader interrupts; a success
          // confirmation is not worth cutting someone off mid-sentence.
          role={toast.tone === "error" ? "alert" : "status"}
          aria-live={toast.tone === "error" ? "assertive" : "polite"}
          className={`fixed bottom-24 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-md border px-4 py-2.5 text-sm shadow-lg md:bottom-6 ${
            toast.tone === "error"
              ? "border-warn bg-raised"
              : "border-line bg-raised"
          }`}
        >
          <span>{toast.text}</span>
          {toast.undo ? (
            <button
              type="button"
              onClick={() => {
                const undo = toast.undo;
                setToast(null);
                void undo?.();
              }}
              className="shrink-0 font-medium text-accent underline"
            >
              Undo
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="shrink-0 text-muted"
          >
            ✕
          </button>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

/**
 * Throws when used outside the provider.
 *
 * A no-op fallback would be worse: the screen would silently stop reporting
 * failures, and the first anyone would know is a customer asking why their
 * change did not save.
 */
export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside <ToastProvider>");
  return show;
}
