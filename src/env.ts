/**
 * Environment access, validated once at module load.
 *
 * Reading `process.env` directly across the codebase means a missing variable
 * surfaces as a confusing runtime error deep in a request. Failing here instead
 * makes it a startup error that names the variable.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

export const env = {
  get databaseUrl(): string {
    return required("DATABASE_URL");
  },
  /**
   * Google's OAuth client id. Public by design — it ships to the browser for
   * One Tap — but still read from the environment so staging and production can
   * use different Google projects.
   *
   * Optional: with it unset, Google sign-in is hidden and email registration
   * still works. That keeps the app runnable before anyone has created a
   * Google Cloud project.
   */
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? null,
  /**
   * Which mail transport to use. `console` prints the message instead of
   * sending it, so the whole registration flow works end to end before an
   * email provider is chosen.
   */
  mailTransport: process.env.MAIL_TRANSPORT ?? "console",
  mailFrom: process.env.MAIL_FROM ?? "DRPHONE <no-reply@localhost>",
  /**
   * Shared secret for the scheduled-job endpoints.
   *
   * Optional, and the endpoints refuse to run at all when it is unset rather
   * than running unauthenticated. An open endpoint that sweeps stock holds is
   * a denial-of-service tool: anyone could call it in a loop and strip the
   * holds off every live cart in the shop.
   */
  cronSecret: process.env.CRON_SECRET ?? null,
  nodeEnv: process.env.NODE_ENV ?? "development",
  get isProduction(): boolean {
    return this.nodeEnv === "production";
  },
};
