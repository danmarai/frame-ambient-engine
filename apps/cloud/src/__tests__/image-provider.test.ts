import { afterEach, describe, expect, it, vi } from "vitest";
import { GPTImageProvider } from "@frame/providers";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("current image API contract", () => {
  it("requests current model and native 16:9 without retired DALL-E options", async () => {
    vi.stubEnv("OPENAI_IMAGE_MODEL", "");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{b64_json:Buffer.from("image").toString("base64")}]})));
    vi.stubGlobal("fetch", fetcher);
    const image = await new GPTImageProvider("test-only").generate({prompt:"autumn river",width:3840,height:2160});
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toMatchObject({model:"gpt-image-2.5-sunburst",size:"2560x1440",quality:"high",output_format:"png"});
    expect(body).not.toHaveProperty("style");
    expect(image).toMatchObject({width:2560,height:1440,mimeType:"image/png"});
    expect(image.data.toString()).toBe("image");
  });
  it("rejects a success response without image bytes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[]}))));
    await expect(new GPTImageProvider("test-only").generate({prompt:"river",width:3840,height:2160})).rejects.toThrow("No image data");
  });
});
