import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { GoogleSignIn } from "@/components/google-sign-in";
import { ActionForm, Field, Submit } from "@/components/auth-form";
import { register } from "@/lib/auth/actions";
import { safeShopReturn } from "@/lib/auth/return-to";
import { currentUser } from "@/lib/auth/session";
import { env } from "@/env";
import { PASSWORD_MIN } from "@/lib/auth/password";
import { USERNAME_MAX, USERNAME_MIN } from "@/lib/auth/username";

export const metadata = { title: "Create an account · DRPHONE" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeShopReturn((await searchParams).next);
  if (await currentUser()) redirect(next as Route);
  const carry = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;

  return (
    <>
      <h1 className="display text-2xl">Create an account</h1>
      {/* Guest checkout is gone: an order needs an account, so the details and
          the order history have somewhere to live. Saying why beats a bare
          requirement. */}
      <p className="mt-2 mb-7 text-sm text-muted">
        An account is needed to order — it keeps your delivery details and your
        past orders, so the next one takes two taps.
      </p>

      <GoogleSignIn
        label="Sign up with Google"
        clientId={env.googleClientId}
        next={next}
      />

      <ActionForm action={register}>
        <input type="hidden" name="next" value={next} />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          hint="We'll send a 6-digit code to confirm it."
        />
        <Field
          label="Username"
          name="username"
          autoComplete="username"
          required
          minLength={USERNAME_MIN}
          maxLength={USERNAME_MAX}
          pattern="[A-Za-z0-9_]+"
          hint="Letters, numbers and underscores."
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN}
          hint={`At least ${PASSWORD_MIN} characters. Length matters more than symbols.`}
        />
        <Submit label="Create account" />
      </ActionForm>

      <p className="mt-6 text-sm text-muted">
        Already have an account?{" "}
        <Link
          href={`/login${carry}` as Route}
          className="text-ink underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
