# Phase 1 staging checklist

Use a disposable staging database. Record evidence and actual results; do not mark items passed from code review alone.

- [ ] Valid merchant registration creates one merchant user and sends/logs one verification link.
- [ ] Duplicate email is rejected without creating a second user.
- [ ] Invalid email and weak/mismatched passwords are rejected.
- [ ] Unverified merchant cannot open onboarding or dashboard directly.
- [ ] Verification token works once and fails when reused or expired.
- [ ] Valid merchant login rotates the session ID; invalid login shows a generic error.
- [ ] Sixth login attempt within the configured window is rate-limited.
- [ ] Merchant credentials cannot authenticate at `/sa/login`.
- [ ] Super-admin credentials cannot authenticate at `/login`.
- [ ] Logout requires a valid CSRF token and destroys authentication.
- [ ] Forgot-password response is identical for existing and absent accounts.
- [ ] Reset token works once; expired/reused tokens fail; new password logs in.
- [ ] Reserved, malformed, and duplicate store slugs are rejected.
- [ ] Valid onboarding creates exactly one store, owner membership, and FREE subscription.
- [ ] Double onboarding submission does not create duplicate slug stores.
- [ ] Unauthenticated `/dashboard` redirects to merchant login.
- [ ] Merchant `/sa` access returns 403; super-admin `/dashboard` returns 403.
- [ ] Merchant A cannot obtain Merchant B store through the owner lookup.
- [ ] Pages at 360, 390, 412, 430, 768, 1024, and 1440 px have no accidental horizontal overflow.
- [ ] Production mode hides stack traces, SQL errors, server paths, and credentials.

