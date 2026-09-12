import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";

import { CountUp } from "@/components/shop/count-up";
import { Hero } from "@/components/shop/hero";
import { Photo } from "@/components/shop/photo";
import { ProductCard } from "@/components/shop/product-card";
import { Rail } from "@/components/shop/rail";
import { loadMyDevices } from "@/lib/shop/my-devices";
import { loadRecentlyViewed } from "@/lib/shop/recently-viewed";
import { loadHome } from "@/lib/storefront/home";
import { storefrontSettings } from "@/lib/storefront/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await storefrontSettings();
  return {
    title: `${settings.storeName} · Phone accessories, delivered across Lebanon`,
    description:
      "Cables, cases, chargers, sound and more for your phone. Cash on delivery anywhere in Lebanon — we call to confirm before anything is packed.",
    robots: settings.isPrivate ? { index: false, follow: false } : undefined,
  };
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

/**
 * The homepage, in six moves.
 *
 * The order is the order a stranger needs them in: what is this and does it fit
 * my phone, what do you sell, what is new, what does it cost to get it, and
 * only then the shelf they left half-browsed last time.
 *
 * Sections are numbered in the markup because they are genuinely a sequence —
 * the numbering is a reading order, not a decoration.
 */
export default async function HomePage() {
  const [home, settings, viewed, myDevices] = await Promise.all([
    loadHome(),
    storefrontSettings(),
    loadRecentlyViewed({ limit: 8 }),
    loadMyDevices(),
  ]);

  /*
   * The phone they nominated as their main one, falling back to the first they
   * saved. Both loaders return nothing at all for a guest, so the personal
   * parts of this page simply do not render for a stranger.
   */
  const primary = myDevices.find((device) => device.isPrimary) ?? myDevices[0];

  return (
    <>
      <Hero
        groups={home.groups}
        deviceBrands={home.deviceBrands}
        productCount={home.totals.products}
        myPhone={
          primary
            ? {
                label: primary.label ?? `${primary.brand} ${primary.model}`,
                query: primary.model,
              }
            : null
        }
      />

      {/* 01 — What we sell. Five tiles, each one a real group with real counts,
          tilting in perspective under a pointer. */}
      <Section
        index="01"
        eyebrow="What we sell"
        title="Five aisles, forty-four shelves"
        action={{ href: "/categories", label: "See every category" }}
      >
        <div className="scene grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {home.groups.map((group, index) => (
            <Link
              key={group.slug}
              href={`/c/${group.slug}` as Route}
              className="plate reveal group flex flex-col justify-between rounded-2xl border border-line bg-raised p-6 hover:border-accent"
              style={{ ["--spin" as string]: `${index % 2 ? 0.4 : -0.4}deg` }}
            >
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted">
                  {group.categoryCount} categories
                </p>
                <h3 className="display mt-2 text-2xl">{group.name}</h3>
                <p className="mt-2 text-sm text-muted">
                  {group.leads.join(" · ")}
                </p>
              </div>
              <p className="mt-6 text-sm font-medium text-accent tabular">
                {group.productCount} products
                <span className="ml-1 inline-block transition-transform duration-300 group-hover:translate-x-1">
                  →
                </span>
              </p>
            </Link>
          ))}

          {/* The fifth row's gap, used rather than left as a hole. */}
          <Link
            href="/phones"
            className="plate reveal flex flex-col justify-between rounded-2xl border border-accent bg-accent-soft p-6"
          >
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-accent">
                Not sure what fits
              </p>
              <h3 className="display mt-2 text-2xl text-accent">
                Shop by phone
              </h3>
              <p className="mt-2 text-sm text-accent/80">
                {home.totals.deviceModels} models across{" "}
                {home.deviceBrands.map((b) => b.name).join(", ")}
              </p>
            </div>
            <p className="mt-6 text-sm font-medium text-accent">Find mine →</p>
          </Link>
        </div>
      </Section>

      {/* 02 — New arrivals. A real rail, snapping, with the circular arrows. */}
      {home.newest.length > 0 ? (
        <Section
          index="02"
          eyebrow="Just arrived"
          title="New this month"
          action={{ href: "/c/phones-power?sort=newest", label: "See all new" }}
        >
          <Rail>
            {home.newest.map((card) => (
              <div key={card.slug} className="w-40 shrink-0 sm:w-52">
                <ProductCard card={card} />
              </div>
            ))}
          </Rail>
        </Section>
      ) : null}

      {/* 03 — The cheap shelf. Threshold comes from the catalog's own price
          distribution, so the section is never empty and never a lie. */}
      {home.under.cards.length > 0 ? (
        <Section
          index="03"
          eyebrow="Small money"
          title={`Under ${money(home.under.thresholdCents)}`}
          action={{
            href: "/categories",
            label: "Browse everything",
          }}
        >
          <Rail>
            {home.under.cards.map((card) => (
              <div key={card.slug} className="w-40 shrink-0 sm:w-52">
                <ProductCard card={card} />
              </div>
            ))}
          </Rail>
        </Section>
      ) : null}

      {/* 04 — How buying here works. The anxiety-killer: no card, no account,
          a phone call before anything moves. */}
      <section className="border-b border-line bg-sunken">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <div className="flex items-baseline gap-4">
            <span className="font-mono text-xs text-accent tabular">04</span>
            <span className="h-px w-10 bg-line" />
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              How it works
            </p>
          </div>

          <h2 className="display reveal mt-4 max-w-2xl text-3xl sm:text-4xl">
            No card. No account. You pay the driver.
          </h2>

          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              {
                step: "Order",
                body: "Put it in the basket and give us a phone number and an address. Nothing else.",
              },
              {
                step: "We call",
                body: "Someone confirms the order and the address with you before a single thing is packed.",
              },
              {
                step: "Pay at the door",
                body: `Cash to the driver, anywhere in Lebanon${
                  home.totals.zones > 0 ? ` — ${home.totals.zones} delivery zones` : ""
                }.`,
              },
            ].map((item, index) => (
              <li key={item.step} className="reveal">
                <p className="display text-5xl text-line">{index + 1}</p>
                <h3 className="mt-1 font-semibold">{item.step}</h3>
                <p className="mt-1 text-sm text-muted">{item.body}</p>
              </li>
            ))}
          </ol>

          <dl className="mt-12 grid grid-cols-2 gap-6 border-t border-line pt-8 sm:grid-cols-4">
            {[
              { value: home.totals.products, label: "products in stock" },
              { value: home.totals.categories, label: "categories" },
              { value: home.totals.deviceModels, label: "phones covered" },
              { value: home.totals.zones, label: "delivery zones" },
            ].map((stat) => (
              <div key={stat.label}>
                <dd className="display text-4xl">
                  <CountUp to={stat.value} />
                </dd>
                <dt className="mt-1 text-sm text-muted">{stat.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 05 — Where you left off. Only for someone who has been here before,
          which is exactly who this section can help. */}
      {viewed.length > 0 ? (
        <Section index="05" eyebrow="Pick up where you left off" title="You were looking at">
          <Rail>
            {viewed.map((entry) => (
              <Link
                key={entry.productId}
                href={`/products/${entry.slug}` as Route}
                className="w-36 shrink-0 sm:w-44"
              >
                <div className="overflow-hidden rounded-lg border border-line bg-sunken">
                  <Photo
                    url={entry.primaryImageUrl}
                    alt=""
                    className="aspect-square w-full object-contain"
                  />
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-medium">
                  {entry.title}
                </p>
                {entry.minPriceCents !== null ? (
                  <p className="text-sm text-muted tabular">
                    {money(entry.minPriceCents)}
                  </p>
                ) : null}
              </Link>
            ))}
          </Rail>
        </Section>
      ) : null}

      {/* A drifting line of the real category names. Cheap, alive, and it
          tells a stranger the breadth of the shop in one glance — which is
          exactly what a homepage with no photography yet needs to do. */}
      <div
        aria-hidden="true"
        className="overflow-hidden border-b border-line py-5"
      >
        <div className="marquee-track flex w-max gap-8 whitespace-nowrap">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex gap-8">
              {home.groups.flatMap((group) => group.leads).map((name) => (
                <span
                  key={`${copy}-${name}`}
                  className="display text-2xl text-line"
                >
                  {name}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 06 — The last ask, with the two ways to reach a person. */}
      <section className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6">
        <h2 className="display mx-auto max-w-2xl text-3xl text-balance sm:text-4xl">
          Tell us the phone. We will tell you what fits.
        </h2>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/phones"
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-on-accent"
          >
            Shop by phone
          </Link>
          <Link
            href="/categories"
            className="rounded-lg border border-line px-5 py-2.5 text-sm font-medium"
          >
            Browse categories
          </Link>
          {settings.whatsappNumber ? (
            <a
              href={`https://wa.me/${settings.whatsappNumber.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-line px-5 py-2.5 text-sm font-medium"
              style={{ color: "var(--whatsapp)" }}
            >
              Ask on WhatsApp
            </a>
          ) : null}
        </div>
      </section>
    </>
  );
}

/**
 * A numbered section, with its rule and its "see all".
 *
 * The eyebrow row is the one piece of structure repeated down the page, so it
 * lives here once: number, rule, label. Borrowed shape, but the numbering
 * earns its place — these sections are meant to be read in order.
 */
function Section({
  index,
  eyebrow,
  title,
  action,
  children,
}: {
  index: string;
  eyebrow: string;
  title: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-4">
              <span className="font-mono text-xs text-accent tabular">
                {index}
              </span>
              <span className="h-px w-10 bg-line" />
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                {eyebrow}
              </p>
            </div>
            <h2 className="display mt-3 text-3xl sm:text-4xl">{title}</h2>
          </div>

          {action ? (
            <Link
              href={action.href as Route}
              className="rounded-lg border border-line px-4 py-2 text-xs uppercase tracking-[0.1em] transition-colors hover:border-accent hover:text-accent"
            >
              {action.label}
            </Link>
          ) : null}
        </div>

        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}
