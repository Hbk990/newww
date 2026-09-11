import { ActionForm, Field, Submit } from "@/components/auth-form";
import { resetPassword } from "@/lib/auth/actions";
import { PASSWORD_MIN } from "@/lib/auth/password";

export const metadata = { title: "Set a new password · DRPHONE" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Set a new password
      </h1>
      <p className="mt-2 mb-7 text-sm text-muted">
        Enter the code we emailed you, and the password you want.
      </p>

      <ActionForm action={resetPassword}>
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <Field
          label="Reset code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          placeholder="000000"
        />
        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN}
          hint={`At least ${PASSWORD_MIN} characters.`}
        />
        <Submit label="Set password" />
      </ActionForm>
    </>
  );
}
