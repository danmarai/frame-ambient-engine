import sharp from "sharp";

/**
 * Resize and convert an image buffer to Frame TV format.
 * Target: 3840x2160 JPEG, quality 92, progressive.
 */
export async function prepareForTV(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .resize(3840, 2160, { fit: "cover", position: "center" })
    .jpeg({ quality: 92, progressive: true })
    .toBuffer();
}

/**
 * Get metadata about an image buffer (dimensions, format, size).
 */
export async function getImageMetadata(imageBuffer: Buffer): Promise<{
  width: number;
  height: number;
  format: string;
  size: number;
}> {
  const metadata = await sharp(imageBuffer).metadata();
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    format: metadata.format ?? "unknown",
    size: imageBuffer.length,
  };
}
