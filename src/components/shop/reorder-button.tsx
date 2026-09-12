"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { reorderIntoBasket } from "@/lib/account/reorder";

/**
 * "Order this again."
 *
 * Reports what it could not add rather than quietly adding less. A basket that
 * silently contains four of the five things someone asked for is a basket they
 * find out about at the door.
 */
export function ReorderButton({ orderNumber }: { orderNumber: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [added, setAdded] = useState<number | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await reorderIntoBasket(orderNumber);
            if (!result.ok) {
              setAdded(null);
              setSkipped([]);
              setError(result.error);
              return;
            }
            setAdded(result.added);
            setSkipped(result.skipped);
            router.refresh();
          })
        }
        className="rounded-lg border border-line px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Adding…" : "Order this again"}
      </button>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-warn">
          {error}
        </p>
      ) : null}

      {added !== null ? (
        <div role="status" className="mt-2 text-sm">
          <p>
            {added} item{added === 1 ? "" : "s"} added.{" "}
            <Link href="/cart" className="font-medium text-accent underline">
              Go to basket
            </Link>
          </p>
          {skipped.length > 0 ? (
            <ul className="mt-1 list-inside list-disc text-muted">
              {skipped.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
