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

export interface OverlayOptions {
  showQuote: boolean;
  showWeather: boolean;
  showMarket: boolean;
  temperatureUnit?: "celsius" | "fahrenheit";
}

/**
 * Apply text overlays (quote, weather, market) onto an image.
 *
 * Uses SVG rendered via sharp's composite API. The overlays are
 * semi-transparent with a dark background for readability.
 * All sizes are designed for 3840x2160 (4K) display.
 */
export async function applyOverlays(
  imageBuffer: Buffer,
  context: SceneContext,
  options: OverlayOptions,
): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width ?? 3840;
  const height = meta.height ?? 2160;

  const overlays: sharp.OverlayOptions[] = [];

  // Weather overlay — top-right corner (large, readable on TV)
  if (options.showWeather && context.weather) {
    const w = context.weather;
    const useCelsius = (options.temperatureUnit ?? "celsius") === "celsius";
    const temp = useCelsius
      ? `${w.temperatureC ?? Math.round((((w.temperatureF ?? 0) - 32) * 5) / 9)}°C`
      : `${w.temperatureF ?? ""}°F`;
    const desc = w.description ?? w.sky ?? "";
    const boxW = 920;
    const boxH = 180;
    const weatherSvg = `
      <svg width="${boxW}" height="${boxH}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${boxW}" height="${boxH}" rx="24" fill="rgba(0,0,0,0.6)"/>
        <text x="48" y="75" font-family="Helvetica, Arial, sans-serif" font-size="56" font-weight="bold" fill="white">${escapeXml(temp)}</text>
        <text x="48" y="130" font-family="Helvetica, Arial, sans-serif" font-size="36" fill="rgba(255,255,255,0.85)">${escapeXml(desc.slice(0, 30))}</text>
      </svg>`;
    overlays.push({
      input: Buffer.from(weatherSvg),
      top: 60,
      left: width - boxW - 60,
    });
  }

  // Market overlay — top-right, below weather (or at weather position if no weather)
  if (options.showMarket && context.market) {
    const m = context.market;
    const sign = m.changePercent > 0 ? "+" : "";
    const arrow =
      m.direction === "up" ? "▲" : m.direction === "down" ? "▼" : "●";
    const color =
      m.direction === "up"
        ? "#4ade80"
        : m.direction === "down"
          ? "#f87171"
          : "#a3a3a3";
    const marketText = `${m.symbol}  ${arrow} ${sign}${m.changePercent.toFixed(2)}%`;
    const priceText = m.price
      ? `$${m.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
      : "";
    const boxW = 920;
    const boxH = 140;
    const topPos = options.showWeather && context.weather ? 260 : 60;
    const marketSvg = `
      <svg width="${boxW}" height="${boxH}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${boxW}" height="${boxH}" rx="24" fill="rgba(0,0,0,0.6)"/>
        <text x="48" y="60" font-family="Helvetica, Arial, sans-serif" font-size="44" font-weight="bold" fill="${color}">${escapeXml(marketText)}</text>
        <text x="48" y="110" font-family="Helvetica, Arial, sans-serif" font-size="32" fill="rgba(255,255,255,0.7)">${escapeXml(priceText)}</text>
      </svg>`;
    overlays.push({
      input: Buffer.from(marketSvg),
      top: topPos,
      left: width - boxW - 60,
    });
  }

  // Quote overlay — bottom-center (large, elegant)
  if (options.showQuote && context.quote) {
    const q = context.quote;
    const quoteText = q.text.length > 60 ? q.text.slice(0, 57) + "..." : q.text;
    const author = q.author ? `— ${q.author}` : "";
    const boxWidth = Math.min(2400, width - 300);
    const boxHeight = author ? 220 : 160;
    const quoteSvg = `
      <svg width="${boxWidth}" height="${boxHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${boxWidth}" height="${boxHeight}" rx="24" fill="rgba(0,0,0,0.6)"/>
        <text x="${boxWidth / 2}" y="85" font-family="Georgia, serif" font-size="48" font-style="italic" fill="white" text-anchor="middle">\u201C${escapeXml(quoteText)}\u201D</text>
        ${author ? `<text x="${boxWidth / 2}" y="155" font-family="Helvetica, Arial, sans-serif" font-size="32" fill="rgba(255,255,255,0.7)" text-anchor="middle">${escapeXml(author)}</text>` : ""}
      </svg>`;
    overlays.push({
      input: Buffer.from(quoteSvg),
      top: height - boxHeight - 80,
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
