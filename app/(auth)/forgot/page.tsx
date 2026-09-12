import Link from "next/link";

import { ActionForm, Field, Submit } from "@/components/auth-form";
import { requestPasswordReset } from "@/lib/auth/actions";

export const metadata = { title: "Forgot password · DRPHONE" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="display text-2xl">Forgot password</h1>
      <p className="mt-2 text-sm text-muted">
        Give us the email on your account and we will send a 6-digit code to set
        a new password.
      </p>

      <div className="mt-6">
        <ActionForm action={requestPasswordReset}>
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          <Submit label="Send the code" />
        </ActionForm>
      </div>

      <div className="mt-6 space-y-2 text-sm text-muted">
        <p>
          Already have a code?{" "}
          <Link href="/reset" className="text-ink underline underline-offset-4">
            Set your new password
          </Link>
        </p>
        <p>
          <Link href="/login" className="text-ink underline underline-offset-4">
            Back to signing in
          </Link>
        </p>
      </div>
    </>
  );
}
