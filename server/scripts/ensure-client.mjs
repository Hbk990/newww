/**
 * Makes sure the code's picture of the database - the Prisma client, which is
 * generated from prisma/schema.prisma - exists and matches the schema before
 * anything tries to use it. Without it, every command dies at its first import
 * with "does not provide an export named 'CarStatus'".
 *
 * It rebuilds only when the schema has actually changed, for one practical
 * reason: on Windows the generator cannot replace its own files while the
 * application has them open, so a rebuild that was not needed turns a working
 * installation into a locked one. When a rebuild is needed and cannot be done,
 * this says what to close instead of printing a stack trace.
 *
 *   node scripts/ensure-client.mjs          stop if the client cannot be built
 *   node scripts/ensure-client.mjs --soft   warn and carry on (used at install)
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = join(serverDir, 'prisma', 'schema.prisma');
const soft = process.argv.includes('--soft');

const schemaHash = createHash('sha256').update(readFileSync(schemaPath)).digest('hex');

/** Where the generated client landed - npm may hoist it to the repository root. */
function stampFile() {
  try {
    const require = createRequire(import.meta.url);
    return join(dirname(require.resolve('@prisma/client')), '.showroom-schema');
  } catch {
    return null;
  }
}

/** Is the client both present and built from this exact schema? */
async function upToDate() {
  const stamp = stampFile();
  if (!stamp || !existsSync(stamp) || readFileSync(stamp, 'utf8').trim() !== schemaHash) return false;
  try {
    const client = await import('@prisma/client');
    return typeof client.PrismaClient === 'function' && typeof client.CarStatus === 'object';
  } catch {
    return false;
  }
}

if (await upToDate()) process.exit(0);

console.log('Building the database client...');
const generated = spawnSync('npx', ['prisma', 'generate'], {
  cwd: serverDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (generated.status === 0) {
  const stamp = stampFile();
  if (stamp) {
    try {
      writeFileSync(stamp, schemaHash);
    } catch {
      // Only a shortcut for next time. Not being able to write it is harmless.
    }
  }
  process.exit(0);
}

console.error(`
Could not build the database client.

If the application is running, stop it first: Windows will not let these
files be replaced while a running program has them open. Close the terminal
running "npm run dev" (Ctrl+C), then run this on its own:

    npm run generate --workspace=server

The reason it failed is printed above this message.
`);
process.exit(soft ? 0 : 1);
