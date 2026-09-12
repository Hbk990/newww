import Link from "next/link";

import { ActionForm, Field, Submit } from "@/components/auth-form";
import { requestPasswordReset } from "@/lib/auth/actions";

export const metadata = { title: "Forgot password · DRPHONE" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="display text-2xl">Forgot password</h1>
      <p className="mt-2 mb-7 text-sm text-muted">
        We&rsquo;ll email you a 6-digit code to set a new one.
      </p>

      <ActionForm action={requestPasswordReset}>
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <Submit label="Send reset code" />
      </ActionForm>

      <p className="mt-6 text-sm text-muted">
        Got a code already?{" "}
        <Link href="/reset" className="text-ink underline underline-offset-4">
          Enter it here
        </Link>
      </p>
    </>
  );
}
