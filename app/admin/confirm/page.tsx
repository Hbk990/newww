import { ConfirmForm } from "@/components/admin/confirm-form";
import { requireVerified } from "@/lib/auth/guards";
import { safeNext } from "@/lib/auth/reauth";
import { REAUTH_WINDOW_MINUTES } from "@/lib/auth/permissions";

export const metadata = { title: "Confirm it is you · DRPHONE" };

/**
 * Guarded by `requireVerified` alone, deliberately.
 *
 * Gating this page on a permission that itself requires recent
 * authentication would redirect it to itself, forever. Signed in and verified
 * is the right bar: the page hands out no information, it only accepts a
 * password.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  await requireVerified();
  const { next } = await searchParams;

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Confirm it is you</h1>
      <p className="mt-2 max-w-prose text-sm text-muted">
        Some screens need your password again, even though you are signed in —
        settings, staff, customer exports and backups. It guards against a
        laptop left unlocked rather than a stolen password. Confirming lasts{" "}
        {REAUTH_WINDOW_MINUTES} minutes.
      </p>

      <ConfirmForm next={safeNext(next)} />
    </>
  );
}
