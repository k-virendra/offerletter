import "server-only";
import sharp from "sharp";
import { LOGO_MAX_BYTES, logoFileError } from "./schema";

// Logos are re-encoded before they are stored: the file's real content is checked (not its name or declared type),
// metadata such as EXIF and GPS is dropped, and the size is capped. Letters show logos at most 56 px tall, so
// 1600 × 800 is plenty for print at 300 dpi.

const MAX_WIDTH = 1600;
const MAX_HEIGHT = 800;
const MAX_INPUT_PIXELS = 40_000_000;
const UNSUPPORTED = "Upload a PNG, JPG or WebP file. SVG isn’t accepted.";

export type ProcessedLogo = { ok: true; png: Buffer; width: number; height: number } | { ok: false; message: string };

export async function processLogo(file: Blob): Promise<ProcessedLogo> {
  const declared = logoFileError(file);
  if (declared) return { ok: false, message: declared };
  if (file.size > LOGO_MAX_BYTES) return { ok: false, message: "Upload a logo under 2 MB." };

  const input = Buffer.from(await file.arrayBuffer());
  try {
    const metadata = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!metadata.format || !["png", "jpeg", "webp"].includes(metadata.format)) return { ok: false, message: UNSUPPORTED };

    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: MAX_WIDTH, height: MAX_HEIGHT, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer({ resolveWithObject: true });
    return { ok: true, png: data, width: info.width, height: info.height };
  } catch {
    return { ok: false, message: "We couldn’t read this image. Try saving it again as a PNG or JPG." };
  }
}
