// Runs the shop on an ordinary Node server — a VPS, a home machine, anywhere
// Node 22 runs. The app code is untouched: this supplies the two bindings it
// expects (a D1-shaped database, an R2-shaped bucket) and translates between
// Node's HTTP API and the Web Request/Response the built app speaks.
//
//   node --import ./server/register.mjs server/index.mjs
//
// Settings, all optional:
//   PORT        port to listen on            (default 3000)
//   HOST        address to bind              (default 0.0.0.0)
//   DATA_DIR    where data is kept           (default ./data)
//   TRUST_PROXY set to 0 to ignore X-Forwarded-* headers (default 1)
import {createServer} from 'node:http';
import {existsSync, statSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {env} from './workers-env.mjs';
import {D1} from './d1.mjs';
import {R2} from './r2.mjs';
import {contentType} from './mime.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLIENT = path.join(root, 'dist', 'client');
const SERVER_ENTRY = path.join(root, 'dist', 'server', 'index.js');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
const TRUST_PROXY = process.env.TRUST_PROXY !== '0';

if (!existsSync(SERVER_ENTRY) || !existsSync(CLIENT)) {
  console.error('\nThe site has not been built. Run `npm run build` first.\n');
  process.exit(1);
}

// 1. Bindings, in place before the app is imported.
env.DB = new D1(path.join(DATA_DIR, 'huqa.sqlite'));
env.BUCKET = new R2(path.join(DATA_DIR, 'files'));

// 2. The built app.
const app = (await import(SERVER_ENTRY)).default;
if (typeof app?.fetch !== 'function') {
  console.error('\ndist/server/index.js did not export a fetch handler. Rebuild with `npm run build`.\n');
  process.exit(1);
}

const first = value => (typeof value === 'string' ? value.split(',')[0].trim() : undefined);

function toRequest(req) {
  // The app compares the Origin header against its own URL to reject cross-site
  // posts, so behind nginx the forwarded scheme and host have to be honoured or
  // every checkout and admin action is refused.
  const proto = (TRUST_PROXY && first(req.headers['x-forwarded-proto'])) || 'http';
  const host = (TRUST_PROXY && first(req.headers['x-forwarded-host'])) || req.headers.host || `${HOST}:${PORT}`;
  const url = new URL(req.url || '/', `${proto}://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined || key.startsWith(':')) continue;
    for (const one of Array.isArray(value) ? value : [value]) headers.append(key, one);
  }
  // The order route reads the visitor's address from this header on Cloudflare.
  const clientIp = (TRUST_PROXY && first(req.headers['x-forwarded-for'])) || req.socket.remoteAddress || '';
  if (clientIp) headers.set('cf-connecting-ip', clientIp);

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: hasBody ? 'half' : undefined,
    redirect: 'manual',
  });
}

async function send(res, response) {
  const headers = {};
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'set-cookie') headers[key] = value;
  });
  const cookies = response.headers.getSetCookie?.() ?? [];
  if (cookies.length) headers['set-cookie'] = cookies;
  res.writeHead(response.status, headers);
  if (!response.body) return res.end();
  try {
    for await (const chunk of response.body) res.write(chunk);
  } catch (e) {
    console.error('Response stream failed', e);
  }
  res.end();
}

// 3. Static files. Cloudflare serves these itself; here we do it, and only from
// inside dist/client.
async function staticFile(pathname) {
  if (pathname.includes('\0')) return null;
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  const file = path.resolve(CLIENT, '.' + path.posix.normalize(decoded));
  if (file !== CLIENT && !file.startsWith(CLIENT + path.sep)) return null;
  if (path.basename(file).startsWith('.')) return null;
  let info;
  try { info = statSync(file); } catch { return null; }
  if (!info.isFile()) return null;
  return {file, size: info.size};
}

const server = createServer(async (req, res) => {
  try {
    const asset = req.method === 'GET' || req.method === 'HEAD'
      ? await staticFile(new URL(req.url || '/', 'http://x').pathname)
      : null;
    if (asset) {
      // Everything under _next/static carries a content hash in its name.
      const immutable = asset.file.includes(`${path.sep}_next${path.sep}static${path.sep}`);
      res.writeHead(200, {
        'Content-Type': contentType(asset.file),
        'Content-Length': asset.size,
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') return res.end();
      return res.end(await readFile(asset.file));
    }
    const response = await app.fetch(toRequest(req), env, {waitUntil() {}, passThroughOnException() {}});
    await send(res, response);
  } catch (e) {
    console.error('Request failed', e);
    if (!res.headersSent) res.writeHead(500, {'Content-Type': 'text/plain; charset=utf-8'});
    res.end('Something went wrong on our side. Please try again.');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`HUQA is running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      try { env.DB.close(); } catch { /* already closed */ }
      process.exit(0);
    });
  });
}
