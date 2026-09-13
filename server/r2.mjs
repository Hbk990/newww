// An R2-shaped wrapper over a folder on disk. Keys become paths, so
// "orders/0008-HQ-AB12.json" is a real file you can open, copy or back up.
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync} from 'node:fs';
import {readFile, writeFile, unlink, readdir, stat, mkdir} from 'node:fs/promises';
import path from 'node:path';

// Keys the app uses are uuids and "<folder>/<name>.json". Anything outside that
// shape is rejected rather than allowed to escape the data directory.
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

export class R2 {
  constructor(directory) {
    this.root = path.resolve(directory);
    if (!existsSync(this.root)) mkdirSync(this.root, {recursive: true});
  }
  #path(key) {
    if (typeof key !== 'string' || !SAFE.test(key) || key.includes('..')) throw new Error(`Unsafe object key: ${key}`);
    const full = path.resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) throw new Error(`Unsafe object key: ${key}`);
    return full;
  }
  async get(key) {
    let bytes;
    try { bytes = await readFile(this.#path(key)); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    const body = new Uint8Array(bytes);
    return {
      key,
      size: body.byteLength,
      etag: createHash('md5').update(bytes).digest('hex'),
      body,
      async text() { return bytes.toString('utf8'); },
      async arrayBuffer() { return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength); },
    };
  }
  async put(key, value, _options) {
    const file = this.#path(key);
    await mkdir(path.dirname(file), {recursive: true});
    const data = typeof value === 'string' ? Buffer.from(value, 'utf8')
      : value instanceof Uint8Array ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
      : Buffer.from(value);
    await writeFile(file, data);
    return {key, size: data.byteLength};
  }
  async delete(key) {
    try { await unlink(this.#path(key)); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  async #walk(dir, prefixPath = '') {
    let entries;
    try { entries = await readdir(dir, {withFileTypes: true}); }
    catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    const found = [];
    for (const entry of entries) {
      const key = prefixPath ? `${prefixPath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) found.push(...await this.#walk(path.join(dir, entry.name), key));
      else if (entry.isFile()) found.push(key);
    }
    return found;
  }
  // Keys come back in ascending order, which is what the order listing relies on.
  async list({prefix = '', limit = 1000, cursor} = {}) {
    const all = (await this.#walk(this.root)).filter(k => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) || 0 : 0;
    const page = all.slice(start, start + limit);
    const objects = await Promise.all(page.map(async key => {
      const info = await stat(this.#path(key)).catch(() => null);
      return {key, size: info?.size ?? 0, uploaded: info?.mtime ?? new Date()};
    }));
    const next = start + page.length;
    return {objects, truncated: next < all.length, cursor: next < all.length ? String(next) : undefined};
  }
}
