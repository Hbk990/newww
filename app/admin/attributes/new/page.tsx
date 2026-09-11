import Link from "next/link";

import { AttributeForm } from "@/components/admin/attribute-form";
import { createAttribute } from "@/lib/admin/attribute-actions";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "New attribute · DRPHONE" };

export default async function Page() {
  await requirePermission("products.edit");

  return (
    <>
      <Link href="/admin/attributes" className="text-sm text-accent underline">
        ← Attributes
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">
        New attribute
      </h1>
      <p className="mt-1 text-sm text-muted">
        Choice-list options and the categories this applies to come next, after
        it is saved.
      </p>

      <AttributeForm
        // Filterable by default: an attribute that does not filter is rarely
        // what was wanted, and it is one click to turn off.
        initial={{
          code: "",
          label: "",
          dataType: "number",
          unit: null,
          isFilterable: true,
          isComparable: false,
          isMulti: false,
          position: 0,
        }}
        submit={createAttribute}
        submitLabel="Create attribute"
        autoCode
      />
    </>
  );
}
