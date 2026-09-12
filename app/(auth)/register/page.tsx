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
import { register } from "@/lib/auth/actions";
import { PASSWORD_MIN } from "@/lib/auth/password";
import { safeShopReturn } from "@/lib/auth/return-to";
import { currentUser } from "@/lib/auth/session";
import { USERNAME_MAX, USERNAME_MIN } from "@/lib/auth/username";
import { env } from "@/env";

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
      {/* Guest checkout is gone, so this says why rather than stating a rule. */}
      <p className="mt-2 text-sm text-muted">
        {next === "/checkout"
          ? "One step before your order, and your basket comes with you."
          : "It takes a minute, and the next order takes two taps."}
      </p>

      <div className="mt-6">
        <GoogleSignIn
          label="Sign up with Google"
          clientId={env.googleClientId}
          next={next}
        />
      </div>

      {env.googleClientId ? <Divider label="or" /> : <div className="h-6" />}

      <ActionForm action={register}>
        <input type="hidden" name="next" value={next} />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          hint="We send a 6-digit code to confirm it."
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
        <PasswordField
          label="Password"
          name="password"
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
