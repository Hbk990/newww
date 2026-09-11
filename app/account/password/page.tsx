import { ActionForm, Field, Submit } from "@/components/auth-form";
import { changePassword } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/guards";
import { PASSWORD_MIN } from "@/lib/auth/password";

export const metadata = { title: "Change password · DRPHONE" };

export default async function ChangePasswordPage() {
  // requireUser, not requireVerified: a forced password change is exactly the
  // state requireVerified redirects here for, so gating on it would loop.
  const user = await requireUser();

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Change password</h1>
      <p className="mt-2 mb-7 text-sm text-muted">
        {user.mustChangePassword
          ? "Your account needs a new password before you can continue."
          : "You'll be signed out on your other devices."}
      </p>

      <ActionForm action={changePassword}>
        <Field
          label="Current password"
          name="current"
          type="password"
          autoComplete="current-password"
          required
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
        <Submit label="Change password" />
      </ActionForm>
    </main>
  );
}
