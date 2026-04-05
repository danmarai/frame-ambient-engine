/**
 * OpenAI DALL-E 3 image provider.
 *
 * Uses the REST API directly (no SDK dependency).
 * Generates at 1792x1024 (DALL-E 3's max landscape).
 * The Frame TV is 3840x2160 — images will need upscaling later.
 */

import type {
  ImageProvider,
  ImageGenerationRequest,
  GeneratedImage,
  ProviderHealth,
} from "@frame/core";

interface DallEResponse {
  data: Array<{
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
  }>;
}

export class OpenAIImageProvider implements ImageProvider {
  name = "openai";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: request.prompt,
        n: 1,
        size: "1792x1024",
        quality: "hd",
        style: request.style === "vivid" ? "vivid" : "natural",
        response_format: "b64_json",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as DallEResponse;
    const b64 = data.data[0]?.b64_json;
    if (!b64) {
      throw new Error("No image data in OpenAI response");
    }

    return {
      data: Buffer.from(b64, "base64"),
      mimeType: "image/png",
      width: 1792,
      height: 1024,
      provider: this.name,
      generatedAt: new Date().toISOString(),
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const res = await fetch("https://api.openai.com/v1/models/dall-e-3", {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return {
        provider: this.name,
        status: res.ok ? "healthy" : "degraded",
        lastChecked: new Date().toISOString(),
        latencyMs: Date.now() - start,
        message: res.ok ? "DALL-E 3 accessible" : `HTTP ${res.status}`,
      };
    } catch (err) {
      return {
        provider: this.name,
        status: "failed",
        lastChecked: new Date().toISOString(),
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }
}
