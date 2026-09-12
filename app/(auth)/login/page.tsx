import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ActionForm,
  Divider,
  Field,
  PasswordField,
  Submit,
} from "@/components/auth-form";
import { GoogleSignIn } from "@/components/google-sign-in";
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
      <h1 className="display text-2xl">Sign in</h1>
      {/*
        Says what this is for when they were sent here from the basket, rather
        than leaving them to wonder why a shop wants an account.
      */}
      <p className="mt-2 text-sm text-muted">
        {next === "/checkout"
          ? "One step before your order. Your basket is waiting."
          : "Use your email address or your username."}
      </p>

      <div className="mt-6">
        <GoogleSignIn
          label="Continue with Google"
          clientId={env.googleClientId}
          next={next}
        />
      </div>

      {env.googleClientId ? <Divider label="or" /> : <div className="h-6" />}

      <ActionForm action={signIn}>
        <input type="hidden" name="next" value={next} />
        <Field
          label="Email or username"
          name="identifier"
          autoComplete="username"
          required
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          required
        />
        <Submit label="Sign in" />
      </ActionForm>

      <div className="mt-6 space-y-2 text-sm text-muted">
        <p>
          <Link
            href="/forgot"
            className="text-ink underline underline-offset-4"
          >
            Forgot your password?
          </Link>
        </p>
        <p>
          No account yet?{" "}
          <Link
            href={`/register${carry}` as Route}
            className="text-ink underline underline-offset-4"
          >
            Create one
          </Link>
        </p>
      </div>
    </>
  );
}
