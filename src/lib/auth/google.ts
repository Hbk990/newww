import { createRemoteJWKSet, jwtVerify } from "jose";

import { env } from "@/env";

/**
 * Google's public signing keys. `createRemoteJWKSet` caches them and refetches
 * on an unknown key id, which is what makes Google's key rotation invisible
 * here. Created once at module scope — building it per request would fetch the
 * key set on every sign-in.
 */
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

/** Google issues tokens under both spellings; both are legitimate. */
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type GoogleIdentity = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
};

/**
 * Verifies a One Tap ID token.
 *
 * Everything here is a real check, not ceremony:
 *
 * - The signature is verified against Google's JWKS. Decoding the payload
 *   without verifying — which is all `atob` on the middle segment does — would
 *   let anyone sign in as anyone by hand-writing a token.
 * - `audience` must be our own client id. Without it, a token Google issued for
 *   *another* site would be accepted here, so any other Google app could mint
 *   logins for ours.
 * - `issuer` must be Google.
 * - Expiry is enforced by `jwtVerify`.
 * - `email_verified` must be true. Google can hold an unverified address on an
 *   account, and trusting it would let someone claim an email they do not own —
 *   which, because we link accounts by verified email, would hand them an
 *   existing account.
 *
 * Throws on any failure. Callers report a single generic message: which check
 * failed is information an attacker can use.
 */
export async function verifyGoogleIdToken(
  idToken: string,
): Promise<GoogleIdentity> {
  const clientId = env.googleClientId;
  if (!clientId) throw new Error("Google sign-in is not configured.");

  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: ISSUERS,
    audience: clientId,
  });

  const sub = typeof payload.sub === "string" ? payload.sub : null;
  const email = typeof payload.email === "string" ? payload.email : null;
  if (!sub || !email) throw new Error("Google token is missing sub or email.");

  if (payload.email_verified !== true) {
    throw new Error("Google has not verified that email address.");
  }

  return {
    sub,
    email: email.toLowerCase(),
    emailVerified: true,
    name: typeof payload.name === "string" ? payload.name : null,
    picture: typeof payload.picture === "string" ? payload.picture : null,
  };
}
