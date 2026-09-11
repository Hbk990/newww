import { env } from "@/env";

export type Mail = {
  to: string;
  subject: string;
  text: string;
};

/**
 * Sending is behind this one function so the provider is a single-file change.
 *
 * The `console` transport is not a stub for tests — it is how the app runs
 * before an email provider exists. Registration, verification and password
 * reset all work end to end; the code appears in the server log instead of an
 * inbox. That is deliberately obvious in the output so nobody ships it by
 * accident.
 */
export async function sendMail(mail: Mail): Promise<void> {
  switch (env.mailTransport) {
    case "console":
      if (env.isProduction) {
        throw new Error(
          "MAIL_TRANSPORT=console in production would silently drop every " +
            "verification email. Configure a real transport.",
        );
      }
      console.log(
        [
          "",
          "──── email (not sent — MAIL_TRANSPORT=console) ────",
          `To:      ${mail.to}`,
          `Subject: ${mail.subject}`,
          "",
          mail.text,
          "───────────────────────────────────────────────────",
          "",
        ].join("\n"),
      );
      return;

    default:
      throw new Error(
        `Unknown MAIL_TRANSPORT "${env.mailTransport}". ` +
          `Supported: console. Add a provider in src/lib/mail/.`,
      );
  }
}

export function verificationEmail(
  code: string,
  storeName = "DRPHONE",
): Omit<Mail, "to"> {
  return {
    subject: `${code} is your ${storeName} verification code`,
    text: [
      `Your verification code is ${code}`,
      "",
      "It expires in 10 minutes. If you didn't create an account, ignore this",
      "email — nothing has been changed.",
    ].join("\n"),
  };
}
