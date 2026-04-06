/**
 * @frame/rendering - Scene composition and rendering.
 */

export const RENDER_TARGET = {
  width: 3840,
  height: 2160,
  format: "image/jpeg" as const,
  quality: 92,
} as const;

export { composePrompt } from "./prompt-composer";
export { generateScene } from "./scene-generator";
export type { GeneratorDeps } from "./scene-generator";

export { prepareForTV, getImageMetadata } from "./image-processor";

export { saveRating, computeStyleHints } from "./feedback";
