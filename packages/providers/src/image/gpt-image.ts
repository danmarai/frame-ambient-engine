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

  constructor(apiKey: string, model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    // Native 16:9 avoids cropping the composition for Frame TV.
    const size = "2560x1440";

    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      signal: AbortSignal.timeout(180_000),
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
      width: 2560,
      height: 1440,
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
