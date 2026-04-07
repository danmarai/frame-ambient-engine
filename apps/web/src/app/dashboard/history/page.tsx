"use client";

import { useState, useEffect } from "react";

interface HistoryEntry {
  id: string;
  type: "generation" | "publish";
  status: string;
  timestamp: string;
  durationMs?: number;
  error?: string;
  sceneId?: string;
  contentId?: string;
  provider?: string;
  theme?: string;
}

type FilterStatus = "all" | "success" | "failed";

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("all");

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    setLoading(true);
    try {
      // Load scenes as generation history
      const scenesRes = await fetch("/api/scenes?limit=50&sort=newest");
      const scenesData = await scenesRes.json();
      const scenes = Array.isArray(scenesData)
        ? scenesData
        : (scenesData.scenes ?? []);

      const history: HistoryEntry[] = [];

      for (const scene of scenes) {
        // Generation entry
        history.push({
          id: `gen-${scene.id}`,
          type: "generation",
          status: scene.status === "complete" ? "success" : scene.status,
          timestamp: scene.createdAt,
          durationMs: scene.durationMs,
          error: scene.error,
          sceneId: scene.id,
          provider: scene.imageProvider,
          theme: scene.context?.theme,
        });

        // Publish entry if published
        if (scene.publishStatus) {
          history.push({
            id: `pub-${scene.id}`,
            type: "publish",
            status:
              scene.publishStatus === "published"
                ? "success"
                : scene.publishStatus,
            timestamp: scene.completedAt ?? scene.createdAt,
            sceneId: scene.id,
          });
        }
      }

      // Sort by timestamp descending
      history.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );

      setEntries(history);
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }

  const filtered =
    filter === "all"
      ? entries
      : entries.filter((e) =>
          filter === "success"
            ? e.status === "success"
            : e.status !== "success",
        );

  const statusIcon = (status: string) => {
    if (status === "success" || status === "complete") return "text-green-500";
    if (status === "failed" || status === "error") return "text-red-500";
    if (status === "generating" || status === "pending")
      return "text-yellow-500";
    return "text-frame-muted";
  };

  const statusDot = (status: string) => {
    if (status === "success" || status === "complete") return "bg-green-500";
    if (status === "failed" || status === "error") return "bg-red-500";
    if (status === "generating" || status === "pending")
      return "bg-yellow-500 animate-pulse";
    return "bg-gray-400";
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">History</h1>
        <div className="flex gap-1 rounded-lg border border-frame-border bg-frame-surface p-1">
          {(["all", "success", "failed"] as FilterStatus[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                filter === f
                  ? "bg-frame-accent text-white"
                  : "text-frame-muted hover:text-frame-text"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-frame-muted">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-frame-accent border-t-transparent" />
          Loading history...
        </div>
      )}

      {/* Timeline */}
      {!loading && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-frame-border p-8 text-center text-frame-muted">
          No history entries yet.
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((entry) => (
          <div
            key={entry.id}
            className="flex items-start gap-3 rounded-lg border border-frame-border bg-frame-surface p-3"
          >
            {/* Status dot */}
            <div className="mt-1.5">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${statusDot(entry.status)}`}
              />
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-medium uppercase ${
                    entry.type === "generation"
                      ? "text-blue-400"
                      : "text-purple-400"
                  }`}
                >
                  {entry.type === "generation" ? "Generated" : "Published"}
                </span>
                <span className={`text-xs ${statusIcon(entry.status)}`}>
                  {entry.status}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap gap-3 text-xs text-frame-muted">
                <span>{new Date(entry.timestamp).toLocaleString()}</span>
                {entry.durationMs && (
                  <span>{(entry.durationMs / 1000).toFixed(1)}s</span>
                )}
                {entry.provider && <span>via {entry.provider}</span>}
                {entry.theme && (
                  <span className="capitalize">{entry.theme}</span>
                )}
              </div>

              {entry.error && (
                <p className="mt-1 text-xs text-red-400">{entry.error}</p>
              )}
            </div>

            {/* Scene thumbnail */}
            {entry.sceneId &&
              entry.type === "generation" &&
              entry.status === "success" && (
                <img
                  src={`/api/scenes/${entry.sceneId}/image`}
                  alt=""
                  className="h-12 w-20 rounded object-cover"
                />
              )}
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-frame-muted">
        Showing {filtered.length} of {entries.length} entries
      </p>
    </div>
  );
}
