import { count, eq } from "drizzle-orm";

import { db } from "@/db";
import { orders, products, sourceProducts } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";

export const metadata = { title: "Admin · DRPHONE" };
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const user = await requireStaff();

  const [live] = await db
    .select({ n: count() })
    .from(products)
    .where(eq(products.status, "active"));
  const [drafts] = await db
    .select({ n: count() })
    .from(products)
    .where(eq(products.status, "draft"));
  const [awaiting] = await db
    .select({ n: count() })
    .from(orders)
    .where(eq(orders.status, "new"));
  const [reference] = await db.select({ n: count() }).from(sourceProducts);

  const tiles = [
    { label: "Live products", value: live?.n ?? 0 },
    { label: "Drafts", value: drafts?.n ?? 0 },
    { label: "Orders to confirm", value: awaiting?.n ?? 0 },
    { label: "Catalog lines for reference", value: reference?.n ?? 0 },
  ];

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">
        Welcome back{user.name ? `, ${user.name.split(" ")[0]}` : ""}
      </h1>
      <p className="mt-1 text-sm text-muted">
        The product form and order screens land in the next steps.
      </p>

      <dl className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="bg-surface px-4 py-5">
            <dt className="text-sm text-muted">{tile.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {tile.value}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
