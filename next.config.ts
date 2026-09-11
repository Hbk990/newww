import type { NextConfig } from "next";

/**
 * Google's sign-in script and its One Tap iframe.
 *
 * Named once because the same two hosts have to appear in `script-src` and
 * `frame-src`, and a policy that allows the script but not the iframe fails in
 * a way that looks like Google being broken.
 */
const GOOGLE = ["https://accounts.google.com", "https://apis.google.com"];

/**
 * Content Security Policy.
 *
 * `script-src` still carries 'unsafe-inline': Next injects inline bootstrap
 * and streaming scripts on every page, and locking them down needs a nonce
 * threaded from middleware through the document. That is worth doing and is
 * not done yet — until it is, this policy earns its place on the other
 * directives rather than on script-src:
 *
 *   object-src 'none'      no Flash/PDF plugin embedding
 *   base-uri 'none'        an injected <base> cannot re-point every relative URL
 *   frame-ancestors 'none' the admin cannot be framed for clickjacking
 *   form-action 'self'     an injected form cannot post credentials elsewhere
 *
 * `e2e/headers.spec.ts` loads the real pages and fails on any CSP violation,
 * so tightening this cannot silently break sign-in.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${GOOGLE.join(" ")}`,
  // Tailwind and React both set inline styles; there is no nonce path for them.
  "style-src 'self' 'unsafe-inline'",
  // data: for inline placeholders, blob: for a locally previewed upload.
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${GOOGLE.join(" ")}`,
  `frame-src 'self' ${GOOGLE.join(" ")}`,
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const config: NextConfig = {
  // Product photos come from object storage; hosts get added when that is wired up.
  images: { remotePatterns: [] },
  typedRoutes: true,

  // The dev server refuses cross-origin requests for its own resources, and
  // Playwright drives it over 127.0.0.1 rather than localhost.
  allowedDevOrigins: ["127.0.0.1"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          /*
           * Two years, subdomains included. Browsers ignore this over plain
           * HTTP, so it is harmless in development and correct in production.
           * `preload` is deliberately absent: submitting to the preload list
           * is close to irreversible and is the owner's decision, not a
           * default.
           */
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Redundant with frame-ancestors above, kept for browsers that
          // honour only this one.
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          /*
           * `same-origin-allow-popups`, not `same-origin`: Google's OAuth flow
           * opens a popup and talks back to the opener, and the stricter value
           * severs that channel and hangs sign-in.
           */
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
    ];
  },
};

export default config;
