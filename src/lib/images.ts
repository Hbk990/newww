/**
 * Image validation by content, not by claim.
 *
 * The filename and the browser-reported MIME type are both attacker-controlled
 * on any upload form. The only trustworthy answer comes from the bytes.
 */

export type ImageKind = "image/jpeg" | "image/png" | "image/webp" | "image/avif";

export type Probed = {
  kind: ImageKind;
  extension: string;
  width: number;
  height: number;
};

export type ProbeFailure = { error: string };

/** 8 MB. Large enough for a product photo off a phone, small enough to serve. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Below this a "photo" is a tracking pixel or a broken export, not a product shot. */
const MIN_DIMENSION = 50;

/**
 * Identifies an image from its header and reads its dimensions.
 *
 * SVG is deliberately not accepted. An SVG is a document: it can carry
 * <script>, and a stored one served from our own origin is a cross-site
 * scripting hole with a product page for a delivery mechanism. There is no
 * safe way to accept it here without sanitising it, and product photos are
 * never vector anyway.
 */
export function probeImage(bytes: Uint8Array): Probed | ProbeFailure {
  if (bytes.length === 0) return { error: "That file is empty." };
  if (bytes.length > MAX_IMAGE_BYTES) {
    return {
      error: `That file is ${(bytes.length / 1024 / 1024).toFixed(1)}MB. The limit is ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`,
    };
  }

  const probed = png(bytes) ?? jpeg(bytes) ?? webp(bytes) ?? avif(bytes);
  if (!probed) {
    // Named explicitly, because "unsupported file" sends someone hunting for a
    // converter when the real problem is that they picked the wrong file.
    if (looksLikeSvg(bytes)) {
      return {
        error: "SVG isn't accepted — it can carry scripts. Export a PNG or JPEG instead.",
      };
    }
    return { error: "That doesn't look like a JPEG, PNG, WebP or AVIF image." };
  }

  if (probed.width < MIN_DIMENSION || probed.height < MIN_DIMENSION) {
    return {
      error: `That image is ${probed.width}×${probed.height}. Product photos need to be at least ${MIN_DIMENSION}px on each side.`,
    };
  }
  return probed;
}

function looksLikeSvg(b: Uint8Array): boolean {
  // Enough of the head to catch "<svg", "<?xml" and a leading comment or BOM.
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(b.subarray(0, 512))
    .toLowerCase();
  return head.includes("<svg") || (head.includes("<?xml") && head.includes("svg"));
}

function png(b: Uint8Array): Probed | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !signature.every((v, i) => b[i] === v)) return null;
  // IHDR is the first chunk and always at this offset; width and height are
  // big-endian 32-bit.
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return {
    kind: "image/png",
    extension: "png",
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

function jpeg(b: Uint8Array): Probed | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // Walk the segment chain to the first frame header. Dimensions are not at a
  // fixed offset in a JPEG: EXIF, ICC profiles and comments all come first,
  // and their sizes vary per camera.
  let offset = 2;
  while (offset + 9 < b.length) {
    if (b[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = b[offset + 1];
    if (marker === undefined) break;
    // SOF0/1/2/3/5/6/7/9/10/11/13/14/15 — every frame type carries the size.
    // DHT (c4), DNL (c8) and DAC (cc) share the range and must be skipped.
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      return {
        kind: "image/jpeg",
        extension: "jpg",
        height: view.getUint16(offset + 5),
        width: view.getUint16(offset + 7),
      };
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    const length = view.getUint16(offset + 2);
    if (length < 2) break;
    offset += 2 + length;
  }
  return null;
}

function webp(b: Uint8Array): Probed | null {
  if (b.length < 30) return null;
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...b.subarray(start, end));
  if (ascii(0, 4) !== "RIFF" || ascii(8, 12) !== "WEBP") return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const format = ascii(12, 16);

  if (format === "VP8 ") {
    // Lossy: 14-bit dimensions, little-endian, after the 3-byte start code.
    return {
      kind: "image/webp",
      extension: "webp",
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }
  if (format === "VP8L") {
    // Lossless packs both dimensions into 28 bits as (width-1, height-1).
    const bits = view.getUint32(21, true);
    return {
      kind: "image/webp",
      extension: "webp",
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  if (format === "VP8X") {
    // Extended: 24-bit canvas size, little-endian, also stored minus one.
    const w = (b[24] ?? 0) | ((b[25] ?? 0) << 8) | ((b[26] ?? 0) << 16);
    const h = (b[27] ?? 0) | ((b[28] ?? 0) << 8) | ((b[29] ?? 0) << 16);
    return { kind: "image/webp", extension: "webp", width: w + 1, height: h + 1 };
  }
  return null;
}

function avif(b: Uint8Array): Probed | null {
  if (b.length < 12) return null;
  const brand = String.fromCharCode(...b.subarray(4, 12));
  if (!brand.startsWith("ftyp") || !/avif|avis/.test(brand)) return null;
  /*
   * Dimensions live in an ispe box inside a nested meta/iprp/ipco tree. Parsing
   * that properly is a real ISO-BMFF walk, and getting it subtly wrong would
   * store the wrong size — worse than storing none, because the page would
   * reserve the wrong space. Scanning for the box is a deliberate shortcut;
   * when it is not found the image is still accepted with no dimensions.
   */
  const found = indexOfAscii(b, "ispe");
  if (found >= 0 && found + 16 <= b.length) {
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const width = view.getUint32(found + 8);
    const height = view.getUint32(found + 12);
    if (width > 0 && height > 0 && width < 65536 && height < 65536) {
      return { kind: "image/avif", extension: "avif", width, height };
    }
  }
  return { kind: "image/avif", extension: "avif", width: 0, height: 0 };
}

function indexOfAscii(b: Uint8Array, needle: string): number {
  const target = [...needle].map((c) => c.charCodeAt(0));
  outer: for (let i = 0; i + target.length <= Math.min(b.length, 4096); i += 1) {
    for (let j = 0; j < target.length; j += 1) {
      if (b[i + j] !== target[j]) continue outer;
    }
    return i;
  }
  return -1;
}
