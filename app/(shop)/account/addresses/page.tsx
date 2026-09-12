import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AddressBook } from "@/components/shop/address-book";
import { loadAddresses } from "@/lib/account/address-actions";
import { currentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Your addresses · DRPHONE",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AddressesPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=%2Faccount%2Faddresses");

  const addresses = await loadAddresses();

  return (
    <>
      <h1 className="display text-3xl">Your addresses</h1>
      <p className="mt-2 max-w-prose text-muted">
        Where we deliver. The one marked default is filled in for you at
        checkout, and every order keeps its own copy — changing an address here
        never changes where a past order went.
      </p>

      <AddressBook addresses={addresses} />
    </>
  );
}
