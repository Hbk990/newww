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

// Setting the password from here also clears two-factor. Whoever runs this is
// already at the database, so it protects nothing to leave it on — and leaving
// it on is how a reinstall ends with a login nobody can get past, asking for a
// code from a phone that was set up against a database that no longer exists.
const user = await prisma.user.upsert({
  where: { username },
  create: { username, passwordHash },
  update: { passwordHash, failedLogins: 0, lockedUntil: null, totpSecret: null, totpEnabled: false },
});
await prisma.recoveryCode.deleteMany({ where: { userId: user.id } });

console.log(`User "${user.username}" ready (id ${user.id}).`);
console.log('Sign in with this password alone — no code is needed.');
console.log('Before this system is reachable from the internet, switch on');
console.log('two-factor authentication from Settings.');
await prisma.$disconnect();
