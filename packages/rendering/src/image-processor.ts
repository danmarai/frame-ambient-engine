import sharp from "sharp";
import type { SceneContext } from "@frame/core";

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

/**
 * Apply text overlays (quote and/or weather) onto an image.
 *
 * Uses SVG rendered via sharp's composite API. The overlays are
 * semi-transparent with a dark background for readability.
 *
 * @param imageBuffer - The source image
 * @param context - Scene context with weather/quote data
 * @param options - Which overlays to show
 */
export async function applyOverlays(
  imageBuffer: Buffer,
  context: SceneContext,
  options: { showQuote: boolean; showWeather: boolean },
): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width ?? 3840;
  const height = meta.height ?? 2160;

  const overlays: sharp.OverlayOptions[] = [];

  // Weather overlay — top-right corner
  if (options.showWeather && context.weather) {
    const w = context.weather;
    const temp = `${w.temperatureF ?? ""}°F`;
    const desc = w.description ?? w.sky ?? "";
    const weatherSvg = `
      <svg width="460" height="90" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="460" height="90" rx="16" fill="rgba(0,0,0,0.55)"/>
        <text x="24" y="38" font-family="Helvetica, Arial, sans-serif" font-size="28" font-weight="bold" fill="white">${escapeXml(temp)}</text>
        <text x="24" y="68" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="rgba(255,255,255,0.8)">${escapeXml(desc.slice(0, 40))}</text>
      </svg>`;
    overlays.push({
      input: Buffer.from(weatherSvg),
      top: 48,
      left: width - 508,
    });
  }

  // Quote overlay — bottom-center
  if (options.showQuote && context.quote) {
    const q = context.quote;
    const quoteText = q.text.length > 80 ? q.text.slice(0, 77) + "..." : q.text;
    const author = q.author ? `— ${q.author}` : "";
    const boxWidth = Math.min(1200, width - 200);
    const boxHeight = author ? 120 : 90;
    const quoteSvg = `
      <svg width="${boxWidth}" height="${boxHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${boxWidth}" height="${boxHeight}" rx="16" fill="rgba(0,0,0,0.55)"/>
        <text x="${boxWidth / 2}" y="45" font-family="Georgia, serif" font-size="24" font-style="italic" fill="white" text-anchor="middle">"${escapeXml(quoteText)}"</text>
        ${author ? `<text x="${boxWidth / 2}" y="80" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="rgba(255,255,255,0.7)" text-anchor="middle">${escapeXml(author)}</text>` : ""}
      </svg>`;
    overlays.push({
      input: Buffer.from(quoteSvg),
      top: height - boxHeight - 60,
      left: Math.floor((width - boxWidth) / 2),
    });
  }

  if (overlays.length === 0) return imageBuffer;

  return sharp(imageBuffer).composite(overlays).toBuffer();
}

/** Escape text for safe SVG embedding. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
