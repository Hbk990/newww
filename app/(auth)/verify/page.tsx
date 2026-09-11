import { redirect } from "next/navigation";

import { ActionForm, Field, Submit } from "@/components/auth-form";
import { ResendCode } from "@/components/resend-code";
import { verifyEmail } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/guards";

export const metadata = { title: "Confirm your email · DRPHONE" };

export default async function VerifyPage() {
  const user = await requireUser();
  if (user.emailVerified) redirect("/");

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Confirm your email
      </h1>
      <p className="mt-2 mb-7 text-sm text-muted">
        We sent a 6-digit code to <strong className="text-ink">{user.email}</strong>.
        It expires in 10 minutes.
      </p>

      <ActionForm action={verifyEmail}>
        <Field
          label="Verification code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          placeholder="000000"
        />
        <Submit label="Confirm" />
      </ActionForm>

      <ResendCode />
    </>
  );
}
