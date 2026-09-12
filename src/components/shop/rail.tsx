"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A horizontal rail with circular arrows.
 *
 * The scrolling, the snapping and the momentum are all the browser's — the CSS
 * in globals.css does that part, which is why it feels native under a thumb and
 * under a trackpad. This component adds only what CSS cannot: arrows that know
 * whether there is anything left to scroll to.
 *
 * The arrows are hidden from assistive technology. A screen reader or a
 * keyboard already moves through the links inside the rail, and scrolling the
 * container is not a separate thing worth announcing twice.
 */
export function Rail({ children }: { children: React.ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ start: boolean; end: boolean }>({
    start: true,
    end: false,
  });

  useEffect(() => {
    const node = track.current;
    if (!node) return;

    function measure() {
      const el = track.current;
      if (!el) return;
      // A 2px tolerance: fractional scroll positions on a zoomed or
      // high-density display never land exactly on the boundary, and an arrow
      // that stays half-lit at the end of a rail looks broken.
      setAt({
        start: el.scrollLeft <= 2,
        end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
      });
    }

    measure();
    node.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);

  function nudge(direction: 1 | -1) {
    const node = track.current;
    if (!node) return;
    // Just under a full pane, so the card at the edge stays partly visible and
    // the eye keeps its place.
    node.scrollBy({ left: direction * node.clientWidth * 0.85, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div
        ref={track}
        className="rail -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"
      >
        {children}
      </div>

      <div aria-hidden="true" className="mt-4 hidden justify-end gap-2 sm:flex">
        <Arrow onClick={() => nudge(-1)} disabled={at.start} facing="left" />
        <Arrow onClick={() => nudge(1)} disabled={at.end} facing="right" />
      </div>
    </div>
  );
}

function Arrow({
  onClick,
  disabled,
  facing,
}: {
  onClick: () => void;
  disabled: boolean;
  facing: "left" | "right";
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onClick}
      disabled={disabled}
      className="grid size-10 place-items-center rounded-full border border-line transition-colors hover:border-accent hover:text-accent disabled:opacity-30 disabled:hover:border-line disabled:hover:text-ink"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={facing === "left" ? { transform: "scaleX(-1)" } : undefined}
      >
        <path d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
