import Link from "next/link";
import { redirect } from "next/navigation";

import { GoogleSignIn } from "@/components/google-sign-in";
import { ActionForm, Field, Submit } from "@/components/auth-form";
import { register } from "@/lib/auth/actions";
import { currentUser } from "@/lib/auth/session";
import { env } from "@/env";
import { PASSWORD_MIN } from "@/lib/auth/password";
import { USERNAME_MAX, USERNAME_MIN } from "@/lib/auth/username";

export const metadata = { title: "Create an account · DRPHONE" };

export default async function RegisterPage() {
  if (await currentUser()) redirect("/");

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
      <p className="mt-2 mb-7 text-sm text-muted">
        You can also check out as a guest — an account just saves your details
        and order history.
      </p>

      <GoogleSignIn label="Sign up with Google" clientId={env.googleClientId} />

      <ActionForm action={register}>
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
        <Link href="/login" className="text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </>
  );
}
