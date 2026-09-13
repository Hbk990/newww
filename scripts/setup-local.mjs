// One-command local setup that works on Windows, macOS and Linux: install
// dependencies, build, and create the local database.
//
//   npm run setup
//
// `npm run install:ci` is the hosting platform's installer — a bash script that
// needs flock and GNU timeout, so it cannot run on Windows. This does the same
// job with plain Node and pnpm.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';

const win = process.platform === 'win32';
const CONFIG = 'dist/server/wrangler.json';
const step = m => console.log('\n== ' + m);
const fail = (...lines) => { console.error('\nSetup stopped.\n' + lines.join('\n') + '\n'); process.exit(1); };

const node = (args, opts = {}) => spawnSync(process.execPath, args, {stdio: 'inherit', ...opts});

// 1. Node version
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  fail(`This project needs Node 22.13 or newer. You have ${process.versions.node}.`,
       'Install the LTS build from https://nodejs.org, then run this again.');
}
if (!existsSync('package.json')) {
  fail('Run this from inside the project folder — the one containing package.json.');
}

// 2. pnpm, at the version package.json pins
step('Checking pnpm');
const probe = cmd => {
  const r = spawnSync(cmd[0], [...cmd.slice(1), '--version'], {encoding: 'utf8', shell: win});
  return r.status === 0 ? (r.stdout || '').trim().split('\n').pop().trim() : null;
};
let pnpm = null;
if (probe(['corepack', 'pnpm']) === '11.25.0') pnpm = ['corepack', 'pnpm'];
else if (probe(['pnpm']) === '11.25.0') pnpm = ['pnpm'];
if (!pnpm) {
  fail('Could not find pnpm 11.25.0.', 'Run this once, then try again:', '', '    npm install -g pnpm@11.25.0', '');
}
console.log('Using: ' + pnpm.join(' '));

// 3. Dependencies. Several packages are 30-40 MB, and pnpm's one-minute default
// request timeout gives up on them over a slow link. Wait much longer, retry
// hard, and pull fewer files at once so each gets the whole connection. Anything
// already fetched stays in the project's pnpm store, so a retry resumes.
const NETWORK = {
  npm_config_fetch_timeout: '900000',
  npm_config_fetch_retries: '10',
  npm_config_fetch_retry_mintimeout: '10000',
  npm_config_fetch_retry_maxtimeout: '120000',
};
const ATTEMPTS = 4;
step('Installing dependencies');
console.log('About 1 GB to download, so the first run takes a while. If the connection');
console.log('drops it picks up where it left off — leave it running.\n');
let installed = false;
for (let attempt = 1; attempt <= ATTEMPTS && !installed; attempt++) {
  // Narrow the pipe further each time: fewer parallel downloads, more bandwidth each.
  const concurrency = attempt === 1 ? '4' : attempt === 2 ? '2' : '1';
  if (attempt > 1) {
    console.log(`\nThe connection gave out. Resuming — attempt ${attempt} of ${ATTEMPTS}, ${concurrency} file(s) at a time.`);
    console.log('Nothing already downloaded is lost.\n');
  }
  const r = spawnSync(pnpm[0], [...pnpm.slice(1), 'install', '--frozen-lockfile'], {
    stdio: 'inherit',
    shell: win,
    env: {...process.env, ...NETWORK, npm_config_network_concurrency: concurrency},
  });
  installed = r.status === 0;
}
if (!installed) {
  fail('Dependency install did not finish — the downloads kept timing out.',
       '',
       'Run `npm run setup` again. It resumes from what it already has, so each',
       'attempt gets further. Do not delete the project folder between tries —',
       'the downloads are cached inside it.',
       '',
       'On a very weak connection, try it on a different network or leave it',
       'running overnight.');
}

// 4. Build
step('Building');
if (node(['scripts/run-framework.mjs', 'build']).status !== 0) {
  fail('Build failed. Copy the error above and send it over.');
}
if (!existsSync(CONFIG)) {
  fail(`The build did not produce ${CONFIG}. Copy the output above and send it over.`);
}

// 5. Database
step('Preparing the local database');
const {migrate} = await import('./migrate.mjs');
try { migrate({remote: false}); }
catch (e) { fail(e.message, 'Delete the .wrangler folder and run `npm run setup` again.'); }

console.log(`
Ready.

Next:

    npm run demo     fill the shop with demo products (optional)
    npm start        start the site

Then open http://127.0.0.1:8787 and, to create your admin login,
http://127.0.0.1:8787/admin
`);
