import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";

import { MAX_IMAGE_BYTES, probeImage, type Probed } from "./images";

/**
 * The fixtures are encoded by sharp rather than hand-written byte arrays.
 *
 * `probeImage` reads headers it wrote by hand, so testing it against headers
 * also written by hand would only prove the two agree with each other. Real
 * encoder output is the thing it has to survive in production.
 */
const made: Record<string, Uint8Array> = {};

beforeAll(async () => {
  const canvas = () =>
    sharp({
      create: {
        width: 640,
        height: 360,
        channels: 3,
        background: { r: 20, g: 130, b: 200 },
      },
    });
  const [png, jpeg, webp, avif] = await Promise.all([
    canvas().png().toBuffer(),
    canvas().jpeg().toBuffer(),
    canvas().webp().toBuffer(),
    canvas().avif({ effort: 0 }).toBuffer(),
  ]);
  Object.assign(made, { png, jpeg, webp, avif });
}, 30_000);

const ok = (result: Probed | { error: string }): Probed => {
  if ("error" in result) throw new Error(`expected an image, got: ${result.error}`);
  return result;
};

describe("probeImage", () => {
  it.each(["png", "jpeg", "webp", "avif"] as const)(
    "reads the real dimensions of a %s a phone or an editor would produce",
    (format) => {
      const bytes = made[format];
      expect(bytes, `${format} fixture was not encoded`).toBeDefined();
      const probed = ok(probeImage(bytes!));
      expect(probed.width).toBe(640);
      expect(probed.height).toBe(360);
      expect(probed.kind).toBe(`image/${format}`);
    },
  );

  it("refuses an SVG by name, since it can carry a script", () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const result = probeImage(svg);
    expect(result).toMatchObject({ error: expect.stringContaining("SVG") });
  });

  it("refuses an SVG that hides behind an XML declaration and a comment", () => {
    const svg = new TextEncoder().encode(
      '<?xml version="1.0"?>\n<!-- a product photo, honestly -->\n<svg width="600"></svg>',
    );
    expect(probeImage(svg)).toMatchObject({
      error: expect.stringContaining("SVG"),
    });
  });

  it("refuses a JPEG that is really a zip, whatever it is called", () => {
    // PK\x03\x04 — the header a .docx, .zip or .apk starts with.
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0]);
    expect(probeImage(zip)).toMatchObject({
      error: expect.stringContaining("doesn't look like"),
    });
  });

  it("rejects an image too small to be a product photo", async () => {
    const tiny = await sharp({
      create: { width: 40, height: 40, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    expect(probeImage(tiny)).toMatchObject({
      error: expect.stringContaining("at least"),
    });
  });

  it("rejects an empty file with its own message", () => {
    expect(probeImage(new Uint8Array())).toMatchObject({ error: "That file is empty." });
  });

  it("states the size in the message when the file is over the limit", () => {
    const huge = new Uint8Array(MAX_IMAGE_BYTES + 1);
    const result = probeImage(huge);
    expect(result).toMatchObject({ error: expect.stringContaining("8MB") });
    // Checked before the header is parsed, so a 9MB file of zeroes is refused
    // for its size rather than for not being an image.
    expect(result).toMatchObject({ error: expect.stringContaining("8.0MB") });
  });
});
