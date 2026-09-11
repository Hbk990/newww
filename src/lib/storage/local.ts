import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";

import type { PutResult, StorageDriver } from "./index";

/** Everything lands under public/, which Next serves as static files. */
const ROOT = join(process.cwd(), "public", "uploads");

/**
 * Disk-backed storage for development.
 *
 * Not durable, and it must not be used in production: on a serverless host the
 * filesystem is read-only at runtime, and where it is writable the files are
 * still discarded on the next deploy. This exists so the whole upload flow —
 * validation, ordering, the primary-image trigger, deletion — can be built and
 * tested before anyone chooses a provider.
 */
export const localStorage: StorageDriver = {
  name: "local",
  durable: false,

  // The content type is part of the driver contract because a bucket needs it
  // as object metadata; a static file on disk is served from its extension, so
  // this driver has nothing to do with it.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async put(key, bytes, _contentType): Promise<PutResult> {
    const target = safeJoin(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    return { url: `/uploads/${key}`, key };
  },

  async remove(key) {
    try {
      await unlink(safeJoin(key));
    } catch (error) {
      // A file already gone is the desired end state, not a failure.
      const code = (error as { code?: string }).code;
      if (code !== "ENOENT") throw error;
    }
  },
};

/**
 * Resolves a key inside ROOT, refusing anything that escapes it.
 *
 * Keys are generated server-side today, but this function is the only thing
 * standing between a stored key and the filesystem — a key of "../../.env"
 * would otherwise write wherever it pointed. Cheap here, catastrophic if the
 * key ever becomes user-influenced.
 */
function safeJoin(key: string): string {
  /*
   * Shape checked before joining, because `join` is forgiving in a way that
   * hides mistakes: it folds a leading slash rather than treating the segment
   * as absolute, so a key of "/etc/passwd" quietly becomes
   * "uploads/etc/passwd" — contained, but nowhere the caller intended. A
   * malformed key should fail, not land somewhere surprising.
   */
  if (key.startsWith("/") || key.startsWith("\\")) {
    throw new Error(`Storage keys are relative; got an absolute one: ${key}`);
  }
  if (key.split(/[/\\]/).includes("..")) {
    throw new Error(`Refusing a storage key containing "..": ${key}`);
  }

  // Belt and braces: even a key that passes the shape checks is verified to
  // resolve inside the upload root.
  const target = normalize(join(ROOT, key));
  if (target !== ROOT && !target.startsWith(ROOT + sep)) {
    throw new Error(`Refusing a storage key that escapes the upload root: ${key}`);
  }
  return target;
}
