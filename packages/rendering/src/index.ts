/**
 * @frame/rendering - Scene composition and rendering.
 *
 * This package will contain the render engine that produces
 * preview and full-resolution artifacts from a Scene Spec.
 * Stub for Milestone 0 — implementation comes in Milestone 3.
 */

export const RENDER_TARGET = {
  width: 3840,
  height: 2160,
  format: "image/jpeg" as const,
  quality: 92,
} as const;
