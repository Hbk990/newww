import type { Mail } from "./index";

/**
 * Brevo's transactional email API, over plain fetch.
 *
 * No SDK on purpose. The whole integration is one POST with three fields, and
 * `@getbrevo/brevo` pulls in a generated client and its own HTTP stack to do
 * it. The mail module was built as a single-function seam precisely so a
 * provider could be this small.
 *
 * Free tier is 300 emails a day, which is well beyond verification codes and
 * password resets for a shop this size.
 */
const ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export type Sender = { name?: string; email: string };

/**
 * Splits `MAIL_FROM` into a name and an address.
 *
 * Accepts both `DRPHONE <no-reply@drphone.lb>` and a bare address, because both
 * are things people put in that variable. A bare address gets no name, which
 * Brevo accepts.
 *
 * Throws on something that is not an address at all rather than sending mail
 * from a malformed sender — Brevo would reject it anyway, and the error is far
 * easier to understand here, at startup, than as a 400 during a customer's
 * registration.
 */
export function parseSender(from: string): Sender {
  const angled = from.match(/^\s*(.*?)\s*<\s*([^>]+?)\s*>\s*$/);
  // `angled?.[2] ?? from` rather than indexing a matched group directly:
  // noUncheckedIndexedAccess treats every capture as possibly undefined.
  const email = (angled?.[2] ?? from).trim();
  const name = angled?.[1]?.trim();

  // Deliberately loose: something@something with no spaces. Validating email
  // addresses properly is a fool's errand, and Brevo is the real authority.
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw new Error(
      `MAIL_FROM is not a usable address: ${JSON.stringify(from)}. ` +
        `Use "Name <address@example.com>" or a bare address.`,
    );
  }

  return name ? { name, email } : { email };
}

export type BrevoPayload = {
  sender: Sender;
  to: { email: string }[];
  subject: string;
  textContent: string;
};

/** Pure, so the shape can be tested without reaching the network. */
export function brevoPayload(mail: Mail, sender: Sender): BrevoPayload {
  return {
    sender,
    to: [{ email: mail.to }],
    subject: mail.subject,
    // Text only. Every message this app sends is a code or a link, and an HTML
    // part would add a second copy to keep in step for no gain.
    textContent: mail.text,
  };
}

/**
 * Turns a failed response into something worth reading in a log.
 *
 * Brevo answers errors with `{code, message}`. Falling back to the raw body
 * matters more than it looks: a proxy or a WAF in front of the API returns
 * HTML, and "unexpected token < in JSON" would send someone hunting through
 * this file instead of at their network.
 */
export function describeFailure(status: number, body: string): string {
  let detail = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { code?: string; message?: string };
    if (parsed.message) {
      detail = parsed.code ? `${parsed.code}: ${parsed.message}` : parsed.message;
    }
  } catch {
    // Not JSON. The raw body is the best available detail.
  }
  return `Brevo refused the message (HTTP ${status}): ${detail}`;
}

export async function sendViaBrevo(
  mail: Mail,
  apiKey: string,
  from: string,
): Promise<void> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(brevoPayload(mail, parseSender(from))),
  });

  if (!response.ok) {
    throw new Error(describeFailure(response.status, await response.text()));
  }
}
