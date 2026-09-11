"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/admin/toast";
import { setCategoryAttribute } from "@/lib/admin/attribute-actions";

export type CategoryNode = {
  id: string;
  name: string;
  /** Attached directly to this category. */
  attached: boolean;
  isRequired: boolean;
  /** Covered by an ancestor's assignment rather than its own. */
  inheritedFrom: string | null;
  children: CategoryNode[];
};

/**
 * Where this attribute applies.
 *
 * Ticking a parent group covers every category under it — the database resolves
 * that with `attributes_for_category()`, so this writes one row rather than one
 * per child. Children under a ticked group show as inherited and are left
 * untickable, because ticking them would write a redundant row that only makes
 * a later change to the group look like it did nothing.
 */
export function AttributeCategories({
  attributeId,
  tree,
}: {
  attributeId: string;
  tree: CategoryNode[];
}) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold">Applies to</h2>
      <p className="mt-1 text-sm text-muted">
        Tick a group to cover everything under it. Ticking{" "}
        <span className="font-medium">Mobile Accessories &amp; Power</span> puts
        this field on all nine of its categories — you do not tick them
        individually.
      </p>

      <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-raised">
        {tree.map((group) => (
          <li key={group.id} className="px-3 py-2.5">
            <Row node={group} attributeId={attributeId} />
            {group.children.length > 0 ? (
              <ul className="mt-1.5 space-y-1 border-l border-line pl-4">
                {group.children.map((child) => (
                  <li key={child.id}>
                    <Row node={child} attributeId={attributeId} />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({
  node,
  attributeId,
}: {
  node: CategoryNode;
  attributeId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  // The checkbox answers immediately; the server is still the truth, and a
  // failure puts it back rather than leaving the screen lying.
  const [attached, setAttached] = useState(node.attached);
  const [isRequired, setIsRequired] = useState(node.isRequired);

  const inherited = node.inheritedFrom !== null && !attached;

  function write(nextAttached: boolean, nextRequired: boolean) {
    const previous = { attached, isRequired };
    setAttached(nextAttached);
    setIsRequired(nextRequired);
    start(async () => {
      const result = await setCategoryAttribute(
        node.id,
        attributeId,
        nextAttached,
        nextRequired,
      );
      if (!result.ok) {
        setAttached(previous.attached);
        setIsRequired(previous.isRequired);
        toast({ text: result.error, tone: "error" });
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={attached || inherited}
          disabled={pending || inherited}
          onChange={(e) => write(e.target.checked, isRequired)}
        />
        <span className={`text-sm ${inherited ? "text-muted" : ""}`}>
          {node.name}
        </span>
      </label>

      {inherited ? (
        <span className="text-xs text-muted">
          inherited from {node.inheritedFrom}
        </span>
      ) : attached ? (
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={isRequired}
            disabled={pending}
            onChange={(e) => write(true, e.target.checked)}
          />
          required
        </label>
      ) : null}
    </div>
  );
}
