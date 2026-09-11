/**
 * Names that must not become usernames.
 *
 * A username ends up in URLs and in anything that addresses a person, so
 * `admin` or `support` in the wrong hands is a social-engineering tool. The
 * database enforces format and uniqueness; this list is the part that needs
 * human judgement, so it lives in code where it can be read and extended.
 */
const RESERVED = new Set([
  "admin", "administrator", "root", "support", "help", "staff", "moderator",
  "system", "official", "drphone", "security", "billing", "orders", "order",
  "checkout", "cart", "account", "login", "logout", "register", "signin",
  "signup", "verify", "password", "settings", "api", "www", "mail", "info",
  "contact", "sales", "shop", "store", "me", "you", "null", "undefined",
]);

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/** Mirrors the `users_username_format` check constraint. */
const FORMAT = /^[A-Za-z0-9_]{3,20}$/;

/** Returns a message to show the person, or null when the name is fine. */
export function checkUsername(username: string): string | null {
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return `Use between ${USERNAME_MIN} and ${USERNAME_MAX} characters.`;
  }
  if (!FORMAT.test(username)) {
    return "Use only letters, numbers and underscores.";
  }
  if (RESERVED.has(username.toLowerCase())) {
    return "That username isn't available.";
  }
  return null;
}
