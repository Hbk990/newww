import Link from "next/link";
import { redirect } from "next/navigation";

import { GoogleSignIn } from "@/components/google-sign-in";
import { ActionForm, Field, Submit } from "@/components/auth-form";
import { signIn } from "@/lib/auth/actions";
import { currentUser } from "@/lib/auth/session";
import { env } from "@/env";

export const metadata = { title: "Sign in · DRPHONE" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/");

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 mb-7 text-sm text-muted">
        Use your email address or your username.
      </p>

      <GoogleSignIn label="Continue with Google" clientId={env.googleClientId} />

      <ActionForm action={signIn}>
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
        <Link href="/register" className="text-ink underline underline-offset-4">
          Create one
        </Link>
      </p>
    </>
  );
}
