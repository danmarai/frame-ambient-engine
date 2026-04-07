"use client";

import { useCallback, useEffect, useState } from "react";
import { logout } from "@/app/login/actions";

type TvStatus = "checking" | "connected" | "disconnected" | "unconfigured";

export function Header() {
  const [tvStatus, setTvStatus] = useState<TvStatus>("checking");
  const [tvName, setTvName] = useState<string | null>(null);

  const checkTv = useCallback(async () => {
    try {
      const res = await fetch("/api/tv/status");
      const data = await res.json();
      if (data.connected) {
        setTvStatus("connected");
        setTvName(data.device?.name || "TV");
      } else if (data.reason === "No TV configured") {
        setTvStatus("unconfigured");
      } else {
        setTvStatus("disconnected");
      }
    } catch {
      setTvStatus("disconnected");
    }
  }, []);

  useEffect(() => {
    checkTv();
    const interval = setInterval(checkTv, 30000);

    // Listen for immediate refresh from other components (e.g., after pairing)
    const onRefresh = () => checkTv();
    window.addEventListener("tv-status-changed", onRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener("tv-status-changed", onRefresh);
    };
  }, [checkTv]);

  const tvColors: Record<TvStatus, string> = {
    checking: "bg-yellow-400 animate-pulse",
    connected: "bg-green-500",
    disconnected: "bg-red-500",
    unconfigured: "bg-gray-400",
  };

  const tvLabels: Record<TvStatus, string> = {
    checking: "Checking TV...",
    connected: tvName || "TV Connected",
    disconnected: "TV Offline",
    unconfigured: "No TV",
  };

  return (
    <header className="flex items-center justify-between border-b border-frame-border bg-frame-surface px-6 py-3">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-frame-success" />
          <span className="text-xs text-frame-muted">System OK</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${tvColors[tvStatus]}`}
          />
          <span className="text-xs text-frame-muted">{tvLabels[tvStatus]}</span>
        </div>
      </div>

      <form action={logout}>
        <button
          type="submit"
          className="text-xs text-frame-muted transition-colors hover:text-frame-text"
        >
          Sign Out
        </button>
      </form>
    </header>
  );
}
