"use client";

import { useState, useEffect, useCallback } from "react";

interface SceneContext {
  weather: {
    sky: string;
    precipitation: string;
    temperature: string;
    temperatureF: number;
    description: string;
    location: string;
  } | null;
  market: {
    symbol: string;
    direction: string;
    changePercent: number;
    price: number;
  } | null;
  quote: {
    text: string;
    author?: string;
  } | null;
  theme: string;
}

interface Scene {
  id: string;
  status: string;
  context: SceneContext | null;
  prompt: string | null;
  imageProvider: string | null;
  imagePath: string | null;
  createdAt: string;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
}

const THEMES = ["forest", "ocean", "astro", "sky", "cute"] as const;
const PROVIDERS = ["openai", "gemini", "mock"] as const;

export default function PreviewPage() {
  const [generating, setGenerating] = useState(false);
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [recentScenes, setRecentScenes] = useState<Scene[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<string>("");
  const [selectedProvider, setSelectedProvider] = useState<string>("");

  const loadScenes = useCallback(async () => {
    try {
      const res = await fetch("/api/scenes");
      if (res.ok) {
        const scenes: Scene[] = await res.json();
        setRecentScenes(scenes);
        if (scenes.length > 0 && !currentScene) {
          setCurrentScene(scenes[0]!);
        }
      }
    } catch {
      // Silent fail on initial load
    }
  }, [currentScene]);

  useEffect(() => {
    loadScenes();
  }, [loadScenes]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);

    try {
      const body: Record<string, string> = {};
      if (selectedTheme) body.theme = selectedTheme;
      if (selectedProvider) body.provider = selectedProvider;

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || err.error || "Generation failed");
      }

      const scene: Scene = await res.json();
      setCurrentScene(scene);
      setRecentScenes((prev) => [scene, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Preview Studio</h1>
      </div>

      {/* Controls */}
      <div className="rounded-lg border border-frame-border bg-frame-surface p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs text-frame-muted">Theme</label>
            <select
              value={selectedTheme}
              onChange={(e) => setSelectedTheme(e.target.value)}
              className="rounded border border-frame-border bg-frame-bg px-3 py-2 text-sm text-frame-text"
            >
              <option value="">Use settings default</option>
              {THEMES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-frame-muted">
              Image Provider
            </label>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="rounded border border-frame-border bg-frame-bg px-3 py-2 text-sm text-frame-text"
            >
              <option value="">Use settings default</option>
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p === "openai"
                    ? "OpenAI (DALL-E 3)"
                    : p === "gemini"
                      ? "Google Gemini"
                      : "Mock"}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="rounded bg-frame-accent px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-frame-accent/90 disabled:opacity-50"
          >
            {generating ? "Generating..." : "Generate Wallpaper"}
          </button>
        </div>

        {generating && (
          <div className="mt-4 flex items-center gap-2 text-sm text-frame-muted">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-frame-accent border-t-transparent" />
            Generating scene — this may take 10-30 seconds...
          </div>
        )}

        {error && (
          <div className="mt-4 rounded bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* Current scene preview */}
      {currentScene && (
        <div className="space-y-4">
          {/* Image */}
          {currentScene.imagePath && (
            <div className="overflow-hidden rounded-lg border border-frame-border">
              <img
                src={`/api/scenes/${currentScene.id}/image`}
                alt="Generated wallpaper"
                className="w-full"
                style={{ aspectRatio: "16/9", objectFit: "cover" }}
              />
            </div>
          )}

          {/* Scene details */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Context panel */}
            <div className="rounded-lg border border-frame-border bg-frame-surface p-4">
              <h3 className="mb-3 text-sm font-medium text-frame-text">
                Scene Context
              </h3>
              {currentScene.context?.weather && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-frame-muted">
                    Weather
                  </p>
                  <p className="text-sm text-frame-text">
                    {currentScene.context.weather.description}
                  </p>
                  <p className="text-xs text-frame-muted">
                    {currentScene.context.weather.sky} &middot;{" "}
                    {currentScene.context.weather.temperature}
                  </p>
                </div>
              )}
              {currentScene.context?.market && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-frame-muted">Market</p>
                  <p className="text-sm text-frame-text">
                    {currentScene.context.market.symbol}{" "}
                    <span
                      className={
                        currentScene.context.market.direction === "up"
                          ? "text-green-400"
                          : currentScene.context.market.direction === "down"
                            ? "text-red-400"
                            : "text-frame-muted"
                      }
                    >
                      {currentScene.context.market.changePercent > 0 ? "+" : ""}
                      {currentScene.context.market.changePercent.toFixed(2)}%
                    </span>
                  </p>
                </div>
              )}
              {currentScene.context?.quote && (
                <div>
                  <p className="text-xs font-medium text-frame-muted">Quote</p>
                  <p className="text-sm italic text-frame-text">
                    &ldquo;{currentScene.context.quote.text}&rdquo;
                  </p>
                  {currentScene.context.quote.author && (
                    <p className="text-xs text-frame-muted">
                      — {currentScene.context.quote.author}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Prompt panel */}
            <div className="rounded-lg border border-frame-border bg-frame-surface p-4">
              <h3 className="mb-3 text-sm font-medium text-frame-text">
                Prompt
              </h3>
              <p className="text-xs leading-relaxed text-frame-muted">
                {currentScene.prompt}
              </p>
            </div>

            {/* Metadata panel */}
            <div className="rounded-lg border border-frame-border bg-frame-surface p-4">
              <h3 className="mb-3 text-sm font-medium text-frame-text">
                Details
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-frame-muted">Theme</span>
                  <span className="text-frame-text capitalize">
                    {currentScene.context?.theme}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-frame-muted">Provider</span>
                  <span className="text-frame-text">
                    {currentScene.imageProvider}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-frame-muted">Duration</span>
                  <span className="text-frame-text">
                    {currentScene.durationMs
                      ? `${(currentScene.durationMs / 1000).toFixed(1)}s`
                      : "--"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-frame-muted">Created</span>
                  <span className="text-frame-text">
                    {currentScene.createdAt
                      ? new Date(currentScene.createdAt).toLocaleTimeString()
                      : "--"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent scenes gallery */}
      {recentScenes.length > 1 && (
        <div>
          <h2 className="mb-3 text-lg font-medium">Recent Generations</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {recentScenes.map((scene) => (
              <button
                key={scene.id}
                onClick={() => setCurrentScene(scene)}
                className={`overflow-hidden rounded-lg border transition-colors ${
                  currentScene?.id === scene.id
                    ? "border-frame-accent"
                    : "border-frame-border hover:border-frame-accent/50"
                }`}
              >
                {scene.imagePath ? (
                  <img
                    src={`/api/scenes/${scene.id}/image`}
                    alt={`Scene ${scene.id.slice(0, 8)}`}
                    className="aspect-video w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-frame-bg text-xs text-frame-muted">
                    {scene.status === "failed" ? "Failed" : "No image"}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!currentScene && !generating && (
        <div className="rounded-lg border border-dashed border-frame-border p-12 text-center">
          <p className="text-lg text-frame-muted">No scenes yet</p>
          <p className="mt-1 text-sm text-frame-muted">
            Click &ldquo;Generate Wallpaper&rdquo; to create your first scene
          </p>
        </div>
      )}
    </div>
  );
}
