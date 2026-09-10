/**
 * Switches two-factor authentication off for a login that can no longer produce
 * a code — a lost or reset phone, an authenticator app deleted by accident.
 *
 *   npm run reset:2fa -- <username>
 *
 * It can only be run by someone already sitting at the database, which is a
 * higher level of access than the login protects, so this opens nothing that
 * was not already open. It still leaves the account protected by its password
 * alone until you switch two-factor back on from Settings, so do that next.
 */
import { prisma } from '../src/lib/db.js';

const [username] = process.argv.slice(2);
if (!username) {
  console.error('Usage: npm run reset:2fa -- <username>');
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { username } });
if (!user) {
  console.error(`No login called "${username}".`);
  const all = await prisma.user.findMany({ select: { username: true } });
  if (all.length) console.error(`Logins on this database: ${all.map((u) => u.username).join(', ')}`);
  process.exit(1);
}

await prisma.$transaction([
  prisma.recoveryCode.deleteMany({ where: { userId: user.id } }),
  prisma.session.deleteMany({ where: { userId: user.id } }),
  prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: null, totpEnabled: false, failedLogins: 0, lockedUntil: null },
  }),
]);

console.log(`Two-factor authentication is now OFF for "${username}".`);
console.log('Sign in with the password alone, then switch it back on from Settings');
console.log('so that a stolen password is not enough on its own.');
await prisma.$disconnect();
