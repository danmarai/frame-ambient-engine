/**
 * OpenAI GPT Image provider (gpt-image-1).
 *
 * Uses the same /v1/images/generations endpoint as DALL-E but with
 * the gpt-image-1 model which produces significantly better photorealistic
 * output, handles text rendering, and follows complex prompts more faithfully.
 *
 * Key differences from DALL-E 3:
 * - Model: "gpt-image-1" instead of "dall-e-3"
 * - Size options: 1024x1024, 1536x1024, 1024x1536 (not 1792x1024)
 * - Quality: "low" | "medium" | "high" (not "standard" | "hd")
 * - No "style" parameter (vivid/natural) — the model handles this natively
 * - Output format: supports b64_json and url
 * - Better photorealism, text rendering, and instruction following
 */

import type {
  ImageProvider,
  ImageGenerationRequest,
  GeneratedImage,
  ProviderHealth,
} from "@frame/core";

interface GPTImageResponse {
  data: Array<{
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
  }>;
}

export class GPTImageProvider implements ImageProvider {
  name = "gpt-image";
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "gpt-image-1") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    // Use 1536x1024 landscape for Frame TV (closest to 16:9)
    const size = "1536x1024";

    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        prompt: request.prompt,
        n: 1,
        size,
        quality: "high",
        output_format: "png",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`GPT Image API error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as GPTImageResponse;
    const b64 = data.data[0]?.b64_json;
    if (!b64) {
      throw new Error("No image data in GPT Image response");
    }

    return {
      data: Buffer.from(b64, "base64"),
      mimeType: "image/png",
      width: 1536,
      height: 1024,
      provider: this.name,
      generatedAt: new Date().toISOString(),
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const res = await fetch(
        `https://api.openai.com/v1/models/${this.model}`,
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        },
      );
      return {
        provider: this.name,
        status: res.ok ? "healthy" : "degraded",
        lastChecked: new Date().toISOString(),
        latencyMs: Date.now() - start,
        message: res.ok ? `${this.model} accessible` : `HTTP ${res.status}`,
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
