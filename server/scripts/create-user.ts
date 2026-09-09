/**
 * Creates (or resets) the single login. Run on the server:
 *   npm run create:user -- <username> <password>
 * The password must survive being the only thing between the internet and
 * every supplier balance you have, so it is strength-checked here too.
 */
import { prisma } from '../src/lib/db.js';
import { hashPassword, validatePasswordStrength } from '../src/lib/auth.js';

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error('Usage: npm run create:user -- <username> <password>');
  process.exit(1);
}
validatePasswordStrength(password);

const passwordHash = await hashPassword(password);
const user = await prisma.user.upsert({
  where: { username },
  create: { username, passwordHash },
  update: { passwordHash, failedLogins: 0, lockedUntil: null },
});
console.log(`User "${user.username}" ready (id ${user.id}).`);
console.log('Sign in, then switch on two-factor authentication from Settings.');
await prisma.$disconnect();
