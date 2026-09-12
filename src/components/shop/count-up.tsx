"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that counts up the first time it is seen.
 *
 * The real figure is rendered server-side and is what a browser without
 * JavaScript, or with reduced motion, shows — the animation only replaces a
 * number that is already correct. A stat that reads "0" until a script runs is
 * a stat that reads "0" to a search engine.
 *
 * Once only: a figure that re-counts every time it scrolls back into view turns
 * a piece of information into a fidget toy.
 */
export function CountUp({ to, duration = 1100 }: { to: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(to);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();

        const started = performance.now();
        let frame = requestAnimationFrame(function step(now) {
          const progress = Math.min(1, (now - started) / duration);
          // Eased out, so it decelerates into the real figure instead of
          // stopping dead on it.
          const eased = 1 - Math.pow(1 - progress, 3);
          setShown(Math.round(to * eased));
          if (progress < 1) frame = requestAnimationFrame(step);
        });

        return () => cancelAnimationFrame(frame);
      },
      { threshold: 0.4 },
    );

    observer.observe(node);
    setShown(0);
    return () => observer.disconnect();
  }, [duration, to]);

  return (
    <span ref={ref} className="tabular">
      {shown.toLocaleString("en-US")}
    </span>
  );
}
