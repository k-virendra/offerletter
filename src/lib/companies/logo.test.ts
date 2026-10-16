import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processLogo } from "./logo";

async function image(format: "png" | "jpeg" | "webp", width: number, height: number, withExif = false) {
  let pipeline = sharp({ create: { width, height, channels: 3, background: "#1F4E8C" } })[format]();
  if (withExif) pipeline = pipeline.withMetadata({ exif: { IFD0: { Copyright: "Example", Artist: "Someone" } } });
  return pipeline.toBuffer();
}

const file = (data: Buffer | string, type: string) => new Blob([typeof data === "string" ? data : new Uint8Array(data)], { type });

describe("processLogo", () => {
  it("re-encodes PNG, JPG and WebP as PNG", async () => {
    for (const format of ["png", "jpeg", "webp"] as const) {
      const result = await processLogo(file(await image(format, 640, 180), `image/${format}`));
      expect(result.ok, format).toBe(true);
      if (!result.ok) continue;
      expect((await sharp(result.png).metadata()).format).toBe("png");
      expect([result.width, result.height]).toEqual([640, 180]);
    }
  });

  it("drops EXIF and other metadata", async () => {
    const result = await processLogo(file(await image("jpeg", 300, 100, true), "image/jpeg"));
    expect(result.ok).toBe(true);
    if (result.ok) expect((await sharp(result.png).metadata()).exif).toBeUndefined();
  });

  it("shrinks very large logos to fit 1600 × 800", async () => {
    const result = await processLogo(file(await image("png", 4000, 1000), "image/png"));
    expect(result.ok && [result.width, result.height]).toEqual([1600, 400]);
  });

  it("refuses SVG, even when it claims to be a PNG", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>';
    expect(await processLogo(file(svg, "image/svg+xml"))).toEqual({ ok: false, message: "Upload a PNG, JPG or WebP file. SVG isn’t accepted." });
    const disguised = await processLogo(file(svg, "image/png"));
    expect(disguised.ok).toBe(false);
  });

  it("refuses files that aren't images", async () => {
    const result = await processLogo(file("not an image", "image/png"));
    expect(result).toEqual({ ok: false, message: "We couldn’t read this image. Try saving it again as a PNG or JPG." });
  });
});
