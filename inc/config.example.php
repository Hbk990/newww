<?php
declare(strict_types=1);

/* Copy this file to config.php and fill in real values.
 *
 * config.php is git-ignored because it holds the install token and the
 * fallback customer password hash. The deployed server keeps its own copy;
 * never commit it.
 *
 * Generate the values with:
 *   php -r 'echo bin2hex(random_bytes(12)), PHP_EOL;'                  // install token
 *   php -r 'echo password_hash("your-passcode", PASSWORD_DEFAULT), PHP_EOL;'
 *
 * The customer passcode stored in storage/settings.json takes precedence over
 * CUSTOMER_PASSWORD_HASH; this constant is only the fallback before setup runs.
 */

const INSTALL_TOKEN = 'replace-with-a-random-token';
const CUSTOMER_PASSWORD_HASH = 'replace-with-a-password_hash-string';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const BACKUP_LIMIT = 10;

/* Addresses of proxies allowed to set the client IP via CF-Connecting-IP or
 * X-Forwarded-For. Leave EMPTY unless the site really sits behind one: an
 * untrusted forwarded header is attacker-controlled and would defeat the login
 * throttle. Example for Cloudflare: const TRUSTED_PROXIES = ['173.245.48.1'];
 */
const TRUSTED_PROXIES = [];
