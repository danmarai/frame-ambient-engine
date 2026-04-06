"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Scene {
  id: string;
  status: string;
  imageProvider: string | null;
  createdAt: string;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
}

export default function DashboardPage() {
  const [sceneCount, setSceneCount] = useState(0);
  const [lastScene, setLastScene] = useState<Scene | null>(null);

  useEffect(() => {
    fetch("/api/scenes")
      .then((r) => r.json())
      .then((data: { scenes: Scene[]; total: number } | Scene[]) => {
        const scenes = Array.isArray(data) ? data : data.scenes;
        const total = Array.isArray(data) ? data.length : data.total;
        setSceneCount(total);
        if (scenes.length > 0) setLastScene(scenes[0]!);
      })
      .catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <StatusCard
          title="System Status"
          value="Healthy"
          subtitle="All providers operational"
          color="success"
        />
        <StatusCard
          title="Scenes Generated"
          value={sceneCount.toString()}
          subtitle={
            lastScene
              ? `Last: ${new Date(lastScene.createdAt).toLocaleString()}`
              : "No scenes generated yet"
          }
          color={sceneCount > 0 ? "success" : "muted"}
        />
        <StatusCard
          title="Image Provider"
          value={lastScene?.imageProvider ?? "None"}
          subtitle={
            lastScene?.durationMs
              ? `Last generation: ${(lastScene.durationMs / 1000).toFixed(1)}s`
              : "Configure in settings"
          }
          color={lastScene ? "success" : "muted"}
        />
      </div>

      {lastScene?.status === "complete" && (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-medium">Latest Generation</h2>
            <Link
              href="/dashboard/preview"
              className="text-sm text-frame-accent hover:underline"
            >
              Open Preview Studio
            </Link>
          </div>
          <div className="overflow-hidden rounded-lg border border-frame-border">
            <img
              src={`/api/scenes/${lastScene.id}/image`}
              alt="Latest wallpaper"
              className="w-full"
              style={{ aspectRatio: "16/9", objectFit: "cover" }}
            />
          </div>
        </div>
      )}

      {sceneCount === 0 && (
        <div className="mt-8 rounded-lg border border-frame-border bg-frame-surface p-6">
          <h2 className="mb-4 text-lg font-medium">Getting Started</h2>
          <ol className="list-inside list-decimal space-y-2 text-frame-muted">
            <li>
              <Link
                href="/dashboard/settings"
                className="text-frame-accent hover:underline"
              >
                Configure your settings
              </Link>{" "}
              (location, theme, image provider)
            </li>
            <li>
              Go to the{" "}
              <Link
                href="/dashboard/preview"
                className="text-frame-accent hover:underline"
              >
                Preview Studio
              </Link>{" "}
              to generate your first wallpaper
            </li>
            <li>Set up your Samsung Frame TV IP address</li>
            <li>Enable the scheduler for automatic updates</li>
          </ol>
        </div>
      )}
    </div>
  );
}

function StatusCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  color: "success" | "warning" | "error" | "muted";
}) {
  const colorMap = {
    success: "text-frame-success",
    warning: "text-frame-warning",
    error: "text-frame-error",
    muted: "text-frame-muted",
  };

  return (
    <div className="rounded-lg border border-frame-border bg-frame-surface p-5">
      <p className="text-sm text-frame-muted">{title}</p>
      <p className={`mt-1 text-xl font-semibold ${colorMap[color]}`}>{value}</p>
      <p className="mt-1 text-xs text-frame-muted">{subtitle}</p>
    </div>
  );
}
