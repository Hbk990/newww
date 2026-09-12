import type { Route } from "next";
import { redirect } from "next/navigation";

import { ActionForm, CodeField, Submit } from "@/components/auth-form";
import { ResendCode } from "@/components/resend-code";
import { signOut, verifyEmail } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/guards";
import { safeShopReturn } from "@/lib/auth/return-to";

export const metadata = { title: "Confirm your email · DRPHONE" };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  // Where registration was heading before the code got in the way.
  const next = safeShopReturn((await searchParams).next);
  if (user.emailVerified) redirect(next as Route);

  return (
    <>
      <h1 className="display text-2xl">Check your email</h1>
      <p className="mt-2 text-sm text-muted">
        A 6-digit code is on its way to{" "}
        <strong className="font-medium text-ink">{user.email}</strong>. It
        expires in ten minutes.
      </p>

      <div className="mt-6">
        <ActionForm action={verifyEmail}>
          <input type="hidden" name="next" value={next} />
          <CodeField label="The code" hint="Six digits, from the email." />
          <Submit label="Confirm" />
        </ActionForm>
      </div>

      <ResendCode />

      {/*
        Wrong address typed a minute ago, and no way out of this screen without
        it: the account exists and holds that email, so the only fix is to sign
        out and register again. Saying so is better than leaving someone stuck
        on a code that will never arrive.
      */}
      <form action={signOut} className="mt-6 border-t border-line pt-5">
        <p className="text-sm text-muted">
          Typed the wrong address?{" "}
          <button
            type="submit"
            className="text-ink underline underline-offset-4"
          >
            Sign out and start again
          </button>
        </p>
      </form>
    </>
  );
}
