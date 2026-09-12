import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { GoogleSignIn } from "@/components/google-sign-in";
import { ActionForm, Field, Submit } from "@/components/auth-form";
import { signIn } from "@/lib/auth/actions";
import { safeShopReturn } from "@/lib/auth/return-to";
import { currentUser } from "@/lib/auth/session";
import { env } from "@/env";

export const metadata = { title: "Sign in · DRPHONE" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /*
   * `next` is where they were going when they were asked to sign in — the
   * checkout, most often. It is carried on the form, on the Google button and
   * on the link to registration, and validated on the way back out in
   * safeShopReturn, never trusted as given.
   */
  const next = safeShopReturn((await searchParams).next);
  if (await currentUser()) redirect(next as Route);
  const carry = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 mb-7 text-sm text-muted">
        Use your email address or your username.
      </p>

      <GoogleSignIn
        label="Continue with Google"
        clientId={env.googleClientId}
        next={next}
      />

      <ActionForm action={signIn}>
        <input type="hidden" name="next" value={next} />
        <Field
          label="Email or username"
          name="identifier"
          autoComplete="username"
          required
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <Submit label="Sign in" />
      </ActionForm>

      <p className="mt-6 text-sm text-muted">
        <Link href="/forgot" className="text-ink underline underline-offset-4">
          Forgot your password?
        </Link>
      </p>
      <p className="mt-2 text-sm text-muted">
        No account yet?{" "}
        <Link
          href={`/register${carry}` as Route}
          className="text-ink underline underline-offset-4"
        >
          Create one
        </Link>
      </p>
    </>
  );
}
