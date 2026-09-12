import Link from "next/link";

import {
  ActionForm,
  CodeField,
  Field,
  PasswordField,
  Submit,
} from "@/components/auth-form";
import { resetPassword } from "@/lib/auth/actions";
import { PASSWORD_MIN } from "@/lib/auth/password";

export const metadata = { title: "Set a new password · DRPHONE" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="display text-2xl">Set a new password</h1>
      <p className="mt-2 text-sm text-muted">
        The code from the email, and the password you want instead.
      </p>

      <div className="mt-6">
        <ActionForm action={resetPassword}>
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          <CodeField label="Reset code" />
          <PasswordField
            label="New password"
            name="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN}
            hint={`At least ${PASSWORD_MIN} characters.`}
          />
          <Submit label="Set password" />
        </ActionForm>
      </div>

      <p className="mt-6 text-sm text-muted">
        Code expired?{" "}
        <Link href="/forgot" className="text-ink underline underline-offset-4">
          Ask for another
        </Link>
      </p>
    </>
  );
}
