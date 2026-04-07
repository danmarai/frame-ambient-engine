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

interface ScenesResponse {
  scenes: Scene[];
  page: number;
  limit: number;
  total: number;
}

type FilterTab = "all" | "favorites" | "liked" | "disliked";

const THEMES = [
  "forest",
  "ocean",
  "astro",
  "sky",
  "cute",
  "landmarks",
  "natgeo",
] as const;
const IMAGE_STYLES = [
  "photorealistic",
  "fine-art",
  "artistic",
  "illustration",
  "random",
] as const;
const PROVIDERS = ["openai", "gemini", "mock"] as const;
const PAGE_LIMIT = 12;

export default function PreviewPage() {
  const [generating, setGenerating] = useState(false);
  const [generateElapsed, setGenerateElapsed] = useState(0);
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [recentScenes, setRecentScenes] = useState<Scene[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Persist dropdown state in localStorage
  const [selectedTheme, setSelectedTheme] = useState<string>(() =>
    typeof window !== "undefined"
      ? (localStorage.getItem("preview.theme") ?? "")
      : "",
  );
  const [selectedStyle, setSelectedStyle] = useState<string>(() =>
    typeof window !== "undefined"
      ? (localStorage.getItem("preview.style") ?? "")
      : "",
  );
  const [selectedProvider, setSelectedProvider] = useState<string>(() =>
    typeof window !== "undefined"
      ? (localStorage.getItem("preview.provider") ?? "")
      : "",
  );

  // Overlay controls for preview
  const [showQuoteOverlay, setShowQuoteOverlay] = useState(false);
  const [showWeatherOverlay, setShowWeatherOverlay] = useState(false);
  const [showMarketOverlay, setShowMarketOverlay] = useState(false);

  // Persist selections
  useEffect(() => {
    localStorage.setItem("preview.theme", selectedTheme);
  }, [selectedTheme]);
  useEffect(() => {
    localStorage.setItem("preview.style", selectedStyle);
  }, [selectedStyle]);
  useEffect(() => {
    localStorage.setItem("preview.provider", selectedProvider);
  }, [selectedProvider]);

  // Rating and favorite state
  const [ratings, setRatings] = useState<Record<string, "up" | "down">>({});
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});

  // Filter + pagination
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [page, setPage] = useState(1);
  const [totalScenes, setTotalScenes] = useState(0);

  // Publish state
  const [publishing, setPublishing] = useState(false);
  const [publishStep, setPublishStep] = useState<string | null>(null);
  const [publishMessage, setPublishMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Delete state
  const [deleting, setDeleting] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalScenes / PAGE_LIMIT));

  // Generation timer
  useEffect(() => {
    if (!generating) {
      setGenerateElapsed(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      setGenerateElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [generating]);

  const loadScenes = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(PAGE_LIMIT));

      if (activeFilter === "favorites") params.set("favorite", "true");
      else if (activeFilter === "liked") params.set("rating", "up");
      else if (activeFilter === "disliked") params.set("rating", "down");

      const res = await fetch(`/api/scenes?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        let scenes: Scene[];
        if (Array.isArray(data)) {
          scenes = data;
          setTotalScenes(data.length);
        } else {
          const paginated = data as ScenesResponse;
          scenes = paginated.scenes;
          setTotalScenes(paginated.total);
        }
        setRecentScenes(scenes);
        if (scenes.length > 0 && !currentScene) {
          setCurrentScene(scenes[0]!);
        }
      }
    } catch {
      // Silent fail on load
    }
  }, [currentScene, page, activeFilter]);

  useEffect(() => {
    loadScenes();
  }, [loadScenes]);

  useEffect(() => {
    setPage(1);
  }, [activeFilter]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);

    try {
      const body: Record<string, string> = {};
      if (selectedTheme) body.theme = selectedTheme;
      if (selectedStyle) body.imageStyle = selectedStyle;
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

  async function handleRate(sceneId: string, rating: "up" | "down") {
    try {
      const res = await fetch(`/api/scenes/${sceneId}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      if (res.ok) {
        setRatings((prev) => ({ ...prev, [sceneId]: rating }));
      }
    } catch {
      // Silent fail
    }
  }

  async function handleFavorite(sceneId: string) {
    try {
      const res = await fetch(`/api/scenes/${sceneId}/favorite`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setFavorites((prev) => ({
          ...prev,
          [sceneId]: Boolean(data.favorite),
        }));
      }
    } catch {
      // Silent fail
    }
  }

  async function handleDelete(sceneId: string) {
    if (!confirm("Delete this scene? This cannot be undone.")) return;

    setDeleting(sceneId);
    try {
      const res = await fetch(`/api/scenes/${sceneId}/delete`, {
        method: "POST",
      });
      if (res.ok) {
        setRecentScenes((prev) => prev.filter((s) => s.id !== sceneId));
        setTotalScenes((prev) => prev - 1);
        if (currentScene?.id === sceneId) {
          setCurrentScene(null);
        }
      }
    } catch {
      // Silent fail
    } finally {
      setDeleting(null);
    }
  }

  async function handlePublish(sceneId: string) {
    setPublishing(true);
    setPublishMessage(null);
    setPublishStep("Preparing image...");

    try {
      setPublishStep("Uploading to TV...");
      const res = await fetch(`/api/scenes/${sceneId}/publish`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || "Publish failed");
      }

      setPublishStep(null);
      setPublishMessage({
        type: "success",
        text: `Published to TV in ${((data.durationMs ?? 0) / 1000).toFixed(1)}s`,
      });
    } catch (err) {
      setPublishStep(null);
      setPublishMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Publish failed",
      });
    } finally {
      setPublishing(false);
    }
  }

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "favorites", label: "Favorites" },
    { key: "liked", label: "Liked" },
    { key: "disliked", label: "Disliked" },
  ];

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
            <label className="mb-1 block text-xs text-frame-muted">Style</label>
            <select
              value={selectedStyle}
              onChange={(e) => setSelectedStyle(e.target.value)}
              className="rounded border border-frame-border bg-frame-bg px-3 py-2 text-sm text-frame-text"
            >
              <option value="">Use settings default</option>
              {IMAGE_STYLES.map((s) => (
                <option key={s} value={s}>
                  {s === "fine-art"
                    ? "Fine Art"
                    : s === "random"
                      ? "Random (cycle)"
                      : s.charAt(0).toUpperCase() + s.slice(1)}
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

        {/* Overlay indicators */}
        <div className="mt-3 flex items-center gap-4 border-t border-frame-border pt-3">
          <span className="text-xs text-frame-muted">Overlays:</span>
          <label className="flex items-center gap-1.5 text-xs text-frame-muted">
            <input
              type="checkbox"
              checked={showQuoteOverlay}
              onChange={(e) => setShowQuoteOverlay(e.target.checked)}
              className="rounded"
            />
            Quote
          </label>
          <label className="flex items-center gap-1.5 text-xs text-frame-muted">
            <input
              type="checkbox"
              checked={showWeatherOverlay}
              onChange={(e) => setShowWeatherOverlay(e.target.checked)}
              className="rounded"
            />
            Weather
          </label>
          <label className="flex items-center gap-1.5 text-xs text-frame-muted">
            <input
              type="checkbox"
              checked={showMarketOverlay}
              onChange={(e) => setShowMarketOverlay(e.target.checked)}
              className="rounded"
            />
            Market
          </label>
          <span className="text-xs text-frame-muted/60">
            (shown when published to TV)
          </span>
        </div>

        {/* Generation progress */}
        {generating && (
          <div className="mt-4">
            <div className="flex items-center gap-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-frame-accent border-t-transparent" />
              <span className="text-sm text-frame-muted">
                Generating scene... {generateElapsed}s
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-frame-border">
              <div
                className="h-full rounded-full bg-frame-accent transition-all duration-1000"
                style={{
                  width: `${Math.min(95, (generateElapsed / 35) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-1 text-xs text-frame-muted">
              {generateElapsed < 5
                ? "Gathering weather, market, and quote data..."
                : generateElapsed < 15
                  ? "Composing prompt and generating image..."
                  : generateElapsed < 30
                    ? "AI is painting your wallpaper..."
                    : "Almost done, this is a detailed one..."}
            </p>
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
          {currentScene.imagePath && (
            <div className="relative overflow-hidden rounded-lg border border-frame-border">
              <img
                src={`/api/scenes/${currentScene.id}/image`}
                alt="Generated wallpaper"
                className="w-full"
                style={{ aspectRatio: "16/9", objectFit: "cover" }}
              />
              {/* Overlay previews — CSS approximation of what will be composited */}
              {showWeatherOverlay && currentScene.context?.weather && (
                <div className="absolute right-4 top-4 rounded-xl bg-black/60 px-4 py-2 text-white">
                  <div className="text-lg font-bold">
                    {currentScene.context.weather.temperatureF
                      ? `${Math.round(((currentScene.context.weather.temperatureF - 32) * 5) / 9)}°C`
                      : ""}
                  </div>
                  <div className="text-xs opacity-80">
                    {currentScene.context.weather.description?.slice(0, 30)}
                  </div>
                </div>
              )}
              {showMarketOverlay && currentScene.context?.market && (
                <div
                  className={`absolute top-4 rounded-xl bg-black/60 px-4 py-2 text-white ${showWeatherOverlay && currentScene.context?.weather ? "right-4 top-16" : "right-4"}`}
                >
                  <div
                    className={`text-sm font-bold ${currentScene.context.market.direction === "up" ? "text-green-400" : currentScene.context.market.direction === "down" ? "text-red-400" : ""}`}
                  >
                    {currentScene.context.market.symbol}{" "}
                    {currentScene.context.market.direction === "up" ? "▲" : "▼"}{" "}
                    {currentScene.context.market.changePercent > 0 ? "+" : ""}
                    {currentScene.context.market.changePercent.toFixed(2)}%
                  </div>
                </div>
              )}
              {showQuoteOverlay && currentScene.context?.quote && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-xl bg-black/60 px-6 py-3 text-center text-white">
                  <div className="text-sm italic">
                    &ldquo;{currentScene.context.quote.text}&rdquo;
                  </div>
                  {currentScene.context.quote.author && (
                    <div className="mt-1 text-xs opacity-70">
                      — {currentScene.context.quote.author}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Publish to TV */}
          <div className="rounded-lg border border-frame-border bg-frame-surface p-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => handlePublish(currentScene.id)}
                disabled={publishing || currentScene.status !== "complete"}
                className="rounded bg-green-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
              >
                {publishing ? "Publishing..." : "Publish to TV"}
              </button>

              {publishStep && (
                <div className="flex items-center gap-2 text-sm text-frame-muted">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-frame-accent border-t-transparent" />
                  {publishStep}
                </div>
              )}

              {publishMessage && !publishStep && (
                <span
                  className={`text-sm ${
                    publishMessage.type === "success"
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {publishMessage.text}
                </span>
              )}
            </div>

            {currentScene.status !== "complete" && (
              <p className="mt-2 text-xs text-frame-muted">
                Scene must be complete before publishing.
              </p>
            )}
          </div>

          {/* Scene details */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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

            <div className="rounded-lg border border-frame-border bg-frame-surface p-4">
              <h3 className="mb-3 text-sm font-medium text-frame-text">
                Prompt
              </h3>
              <p className="text-xs leading-relaxed text-frame-muted">
                {currentScene.prompt}
              </p>
            </div>

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
      {recentScenes.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-medium">Recent Generations</h2>
            <span className="text-xs text-frame-muted">
              {totalScenes} total
            </span>
          </div>

          {/* Filter tabs */}
          <div className="mb-4 flex gap-1 rounded-lg border border-frame-border bg-frame-surface p-1">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  activeFilter === tab.key
                    ? "bg-frame-accent text-white"
                    : "text-frame-muted hover:text-frame-text"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {recentScenes.map((scene) => (
              <div
                key={scene.id}
                className={`group overflow-hidden rounded-lg border transition-colors ${
                  currentScene?.id === scene.id
                    ? "border-frame-accent"
                    : "border-frame-border hover:border-frame-accent/50"
                }`}
              >
                <button
                  onClick={() => {
                    setCurrentScene(scene);
                    setPublishMessage(null);
                    setPublishStep(null);
                  }}
                  className="relative w-full"
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

                {/* Controls bar */}
                <div className="flex items-center justify-between bg-frame-surface px-2 py-1">
                  <div className="flex gap-1">
                    {/* Thumbs up */}
                    <button
                      onClick={() => handleRate(scene.id, "up")}
                      title="Thumbs up"
                      className={`rounded p-1 transition-colors ${
                        ratings[scene.id] === "up"
                          ? "bg-green-500/20 text-green-400"
                          : "text-frame-muted hover:text-green-400"
                      }`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-3.5 w-3.5"
                      >
                        <path d="M1 8.998a1 1 0 0 1 1-1h3v9H2a1 1 0 0 1-1-1v-7Zm5.5 8h6.764a2 2 0 0 0 1.789-1.106l2.252-4.5A1 1 0 0 0 16.411 10H12.5V5a2 2 0 0 0-2-2h-.5L6.5 8.498v8.5Z" />
                      </svg>
                    </button>
                    {/* Thumbs down */}
                    <button
                      onClick={() => handleRate(scene.id, "down")}
                      title="Thumbs down"
                      className={`rounded p-1 transition-colors ${
                        ratings[scene.id] === "down"
                          ? "bg-red-500/20 text-red-400"
                          : "text-frame-muted hover:text-red-400"
                      }`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-3.5 w-3.5"
                      >
                        <path d="M19 11.002a1 1 0 0 1-1 1h-3v-9h3a1 1 0 0 1 1 1v7Zm-5.5-8H6.736a2 2 0 0 0-1.789 1.106l-2.252 4.5A1 1 0 0 0 3.589 10H7.5v5a2 2 0 0 0 2 2h.5l3.5-5.498v-8.5Z" />
                      </svg>
                    </button>
                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(scene.id)}
                      title="Delete scene"
                      disabled={deleting === scene.id}
                      className="rounded p-1 text-frame-muted opacity-0 transition-all hover:text-red-400 group-hover:opacity-100 disabled:opacity-50"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-3.5 w-3.5"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>
                  {/* Favorite star */}
                  <button
                    onClick={() => handleFavorite(scene.id)}
                    title="Toggle favorite"
                    className={`rounded p-1 transition-colors ${
                      favorites[scene.id]
                        ? "text-yellow-400"
                        : "text-frame-muted hover:text-yellow-400"
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill={favorites[scene.id] ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth={favorites[scene.id] ? 0 : 1.5}
                      className="h-3.5 w-3.5"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 0 0-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 0 0 .951-.69l1.07-3.292Z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded border border-frame-border px-3 py-1.5 text-sm text-frame-text transition-colors hover:bg-frame-surface disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-frame-muted">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded border border-frame-border px-3 py-1.5 text-sm text-frame-text transition-colors hover:bg-frame-surface disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!currentScene && !generating && recentScenes.length === 0 && (
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
