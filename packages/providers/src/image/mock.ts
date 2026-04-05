import type {
  ImageProvider,
  ImageGenerationRequest,
  GeneratedImage,
  ProviderHealth,
} from "@frame/core";

export class MockImageProvider implements ImageProvider {
  name = "mock";

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    // Simulate generation delay
    await new Promise((r) => setTimeout(r, 1000));

    // Generate a 1x1 pixel JPEG as placeholder
    // Real providers will return actual 3840x2160 images
    const placeholder = Buffer.from(
      "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAAAf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpgA//Z",
      "base64",
    );

    return {
      data: placeholder,
      mimeType: "image/jpeg",
      width: request.width,
      height: request.height,
      provider: this.name,
      generatedAt: new Date().toISOString(),
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: this.name,
      status: "healthy",
      lastChecked: new Date().toISOString(),
      latencyMs: 5,
      message: "Mock provider always healthy",
    };
  }
}
