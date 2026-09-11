"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/admin/toast";
import { deleteAttribute } from "@/lib/admin/attribute-actions";

/**
 * Two-step delete.
 *
 * Deleting an attribute cascades to every product value that used it, so the
 * server refuses once any product depends on it. This confirm step covers the
 * case where nothing depends on it yet and the click was simply a mistake.
 */
export function AttributeDelete({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md border border-line px-3 py-1.5 text-sm text-warn"
      >
        Delete
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-warn px-3 py-1.5">
      <span className="text-sm">Delete {label}?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await deleteAttribute(id);
            if (!result.ok) {
              toast({ text: result.error, tone: "error" });
              setConfirming(false);
              return;
            }
            toast({ text: `${label} deleted.` });
            router.push("/admin/attributes");
            router.refresh();
          })
        }
        className="text-sm font-medium text-warn underline disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Yes, delete"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-sm text-muted underline"
      >
        Keep
      </button>
    </div>
  );
}
