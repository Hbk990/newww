import { localStorage } from "./local";

export type PutResult = { url: string; key: string };

export type StorageDriver = {
  name: string;
  /** Writes the bytes and returns a public URL plus the handle to delete by. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<PutResult>;
  /** Best-effort delete. A missing object is not an error. */
  remove(key: string): Promise<void>;
  /** True when files survive a redeploy. */
  durable: boolean;
};

/**
 * Which driver is in use.
 *
 * Local disk is the default so the image pipeline works the moment the repo is
 * cloned, the same way the console mail transport lets registration work before
 * an email provider is chosen. It is explicitly *not* durable: on Vercel the
 * filesystem is read-only at runtime and wiped between deploys anyway, so
 * production needs a real bucket. `imagesAreDurable` exists so the admin can
 * say so on screen rather than letting someone upload a catalog that quietly
 * disappears.
 */
export const storage: StorageDriver = selectDriver();

function selectDriver(): StorageDriver {
  const name = process.env.STORAGE_DRIVER ?? "local";
  if (name === "local") return localStorage;
  /*
   * Named explicitly rather than falling back to local.
   *
   * A typo in STORAGE_DRIVER that silently used the disk would look like it
   * worked — uploads succeed, thumbnails render — and the catalog would vanish
   * on the next deploy with nothing having complained.
   */
  throw new Error(
    `Unknown STORAGE_DRIVER "${name}". Only "local" exists so far; ` +
      `add a driver in src/lib/storage/ and register it here.`,
  );
}

export const imagesAreDurable = storage.durable;

/**
 * A stable, collision-proof key.
 *
 * Scoped by product so a bucket listing is browsable, and suffixed with
 * randomness because two people uploading "IMG_1234.jpg" for the same product
 * must not overwrite each other.
 */
export function imageKey(productId: string, extension: string): string {
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `products/${productId}/${Date.now().toString(36)}-${random}.${extension}`;
}
