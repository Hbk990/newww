"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { HomeDeviceBrand, HomeGroup } from "@/lib/storefront/home";

/**
 * The opening: a headline, a phone finder, and the catalog as a deck of cards
 * standing in real perspective.
 *
 * The deck is made of categories with their counts, not decoration — every
 * plate is a link to somewhere worth going, and the depth is what makes a page
 * with no product photography yet look deliberate rather than unfinished.
 *
 * Parallax follows the pointer on a mouse and does nothing on a touch screen:
 * a tilt that responds to a finger is a tilt that fights scrolling.
 */
export function Hero({
  groups,
  deviceBrands,
  productCount,
  myPhone,
}: {
  groups: HomeGroup[];
  deviceBrands: HomeDeviceBrand[];
  productCount: number;
  /** The phone this customer saved, if they saved one. */
  myPhone: { label: string; query: string } | null;
}) {
  const scene = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scene.current;
    if (!node) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    function onMove(event: PointerEvent) {
      // One write per frame. A transform per pointer event is the classic way
      // to make a smooth idea feel cheap.
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = node!.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width - 0.5;
        const y = (event.clientY - box.top) / box.height - 0.5;
        node!.style.setProperty("--tilt-x", `${(x * 13).toFixed(2)}deg`);
        node!.style.setProperty("--tilt-y", `${(-y * 9).toFixed(2)}deg`);
      });
    }

    function onLeave() {
      node!.style.setProperty("--tilt-x", "0deg");
      node!.style.setProperty("--tilt-y", "0deg");
    }

    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <section className="relative overflow-hidden border-b border-line">
      {/*
        The wash behind the type. Two soft radial pools in brand red at low
        opacity — enough to stop the page reading as a white sheet, not enough
        to fight the headline. Drawn with gradients rather than an image, so it
        costs nothing and scales to any screen.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          background:
            "radial-gradient(42rem 28rem at 12% 8%, var(--brand-red), transparent 60%), radial-gradient(34rem 24rem at 88% 72%, var(--brand-red), transparent 62%)",
        }}
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-20">
        <div className="lift">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            Lebanon · cash on delivery
          </p>

          {/*
            text-balance keeps the three lines from breaking into an orphan,
            and the red half is the half that names what the shop is for.
          */}
          <h1 className="display mt-4 text-[clamp(2.6rem,8vw,5rem)] text-balance">
            Everything for
            <br />
            <span className="text-accent">your phone.</span>
          </h1>

          <p className="mt-5 max-w-md text-lg text-muted">
            {productCount.toLocaleString("en-US")} things for the phone in your
            hand — cables, cases, chargers, sound. We call to confirm, you pay
            the driver.
          </p>

          {/*
            Someone who told us their phone should not have to tell us again.
            This is the whole point of saving it, and it is the difference
            between a homepage and a homepage that remembers you.
          */}
          {myPhone ? (
            <Link
              href={`/search?q=${encodeURIComponent(myPhone.query)}` as Route}
              className="mt-7 flex items-center gap-3 rounded-2xl border border-accent bg-accent-soft px-4 py-3 text-sm font-medium text-accent"
            >
              <span>Back for your {myPhone.label}? See what fits</span>
              <span aria-hidden="true">→</span>
            </Link>
          ) : null}

          <DeviceFinder deviceBrands={deviceBrands} />
        </div>

        {/*
          The deck. Three plates, not five: at five they covered each other's
          names, which is the opposite of what a card that exists to be read
          should do. Hidden below lg, where they would sit on top of the
          headline they are meant to introduce — phones get their depth from
          the scroll reveal on the tiles below instead.
        */}
        <div ref={scene} className="scene hidden lg:block">
          <div className="layer relative h-[28rem]">
            {groups.slice(0, 3).map((group, index) => (
              <Link
                key={group.slug}
                href={`/c/${group.slug}` as Route}
                className="plate sink absolute block w-72 rounded-2xl border border-line bg-raised p-5 shadow-sm hover:border-accent"
                style={
                  {
                    // Hand-placed down a diagonal, each one further back than
                    // the last. The offsets are wide enough that a plate only
                    // ever overlaps the one behind it at a corner.
                    left: `${[0, 26, 8][index]}%`,
                    top: `${[2, 33, 64][index]}%`,
                    "--z": `${[0, -80, -170][index]}px`,
                    "--spin": `${[-3.5, 2.5, -1.5][index]}deg`,
                    // Further back travels further on scroll, which is what
                    // reads as depth rather than as sliding.
                    "--sink": `${[0.6, 1.1, 1.7][index]}`,
                    zIndex: 10 - index,
                  } as React.CSSProperties
                }
              >
                <p className="text-xs uppercase tracking-[0.14em] text-muted">
                  {group.categoryCount} categories
                </p>
                <p className="display mt-1 text-xl">{group.name}</p>
                <p className="mt-2 text-sm text-muted">
                  {group.leads.join(" · ")}
                </p>
                <p className="mt-3 text-sm font-medium text-accent tabular">
                  {group.productCount} products →
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Pick your phone, get what fits it.
 *
 * This is the shop's main way in, so it sits in the hero rather than behind a
 * menu. Two taps: brand, then model. Models go to search on the model name,
 * which is how this catalog actually records fitment today — the titles say
 * "Cover - iPhone 13", and not one product has a fitment row yet.
 *
 * The brand row is rendered server-side with Apple expanded, so the component
 * is useful in its resting state and before hydration.
 */
function DeviceFinder({ deviceBrands }: { deviceBrands: HomeDeviceBrand[] }) {
  const [open, setOpen] = useState(deviceBrands[0]?.name ?? "");
  const active = deviceBrands.find((brand) => brand.name === open);

  if (deviceBrands.length === 0) return null;

  return (
    <div className="mt-8 rounded-2xl border border-line bg-raised p-4">
      <p className="text-sm font-medium">Which phone do you have?</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {deviceBrands.map((brand) => (
          <button
            key={brand.name}
            type="button"
            aria-pressed={brand.name === open}
            onClick={() => setOpen(brand.name)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              brand.name === open
                ? "border-accent bg-accent-soft font-medium text-accent"
                : "border-line hover:border-muted"
            }`}
          >
            {brand.name}
          </button>
        ))}
      </div>

      {active ? (
        <div className="mt-3 max-h-36 overflow-y-auto">
          <ul className="flex flex-wrap gap-1.5">
            {active.models.map((model) => (
              <li key={model.id}>
                <Link
                  href={`/search?q=${encodeURIComponent(model.name)}` as Route}
                  className="inline-block rounded-lg border border-line px-2.5 py-1 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  {model.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-3 text-xs text-muted">
        Not sure of the model?{" "}
        <Link href="/phones" className="text-accent underline underline-offset-2">
          See every phone we cover
        </Link>
      </p>
    </div>
  );
}
