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
  nodeEnv: process.env.NODE_ENV ?? "development",
  get isProduction(): boolean {
    return this.nodeEnv === "production";
  },
};
