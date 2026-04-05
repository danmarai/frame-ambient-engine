"use client";

import { useEffect, useState } from "react";
import type { AppSettings } from "@frame/core";
import { DEFAULT_SETTINGS } from "@frame/core";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setSettings(data))
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        const saved = await res.json();
        setSettings(saved);
        setMessage({ type: "success", text: "Settings saved successfully" });
      } else {
        const err = await res.json();
        setMessage({ type: "error", text: err.error || "Failed to save" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>

      {message && (
        <div
          className={`mb-6 rounded-md px-4 py-3 text-sm ${
            message.type === "success"
              ? "bg-frame-success/10 text-frame-success"
              : "bg-frame-error/10 text-frame-error"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Theme */}
      <Section title="Theme">
        <Select
          label="Active Theme"
          value={settings.theme}
          options={["forest", "ocean", "astro", "sky", "cute"]}
          onChange={(v) =>
            setSettings({ ...settings, theme: v as AppSettings["theme"] })
          }
        />
      </Section>

      {/* Weather */}
      <Section title="Weather">
        <Toggle
          label="Enable Weather"
          checked={settings.weather.enabled}
          onChange={(v) =>
            setSettings({
              ...settings,
              weather: { ...settings.weather, enabled: v },
            })
          }
        />
        <Select
          label="Integration Mode"
          value={settings.weather.mode}
          options={["reflect", "invert", "accent-only", "off"]}
          onChange={(v) =>
            setSettings({
              ...settings,
              weather: {
                ...settings.weather,
                mode: v as AppSettings["weather"]["mode"],
              },
            })
          }
        />
        <Select
          label="Forecast Target"
          value={settings.weather.target}
          options={["auto", "today", "tomorrow"]}
          onChange={(v) =>
            setSettings({
              ...settings,
              weather: {
                ...settings.weather,
                target: v as AppSettings["weather"]["target"],
              },
            })
          }
        />
      </Section>

      {/* Market */}
      <Section title="Market">
        <Toggle
          label="Enable Market Indicator"
          checked={settings.market.enabled}
          onChange={(v) =>
            setSettings({
              ...settings,
              market: { ...settings.market, enabled: v },
            })
          }
        />
        <Select
          label="Symbol"
          value={settings.market.symbol}
          options={["BTC", "SPY"]}
          onChange={(v) =>
            setSettings({
              ...settings,
              market: {
                ...settings.market,
                symbol: v as AppSettings["market"]["symbol"],
              },
            })
          }
        />
        <Select
          label="Timeframe"
          value={settings.market.timeframe}
          options={["day", "week"]}
          onChange={(v) =>
            setSettings({
              ...settings,
              market: {
                ...settings.market,
                timeframe: v as AppSettings["market"]["timeframe"],
              },
            })
          }
        />
      </Section>

      {/* Quotes */}
      <Section title="Quotes">
        <Toggle
          label="Show Motivational Quotes"
          checked={settings.quotes.enabled}
          onChange={(v) =>
            setSettings({
              ...settings,
              quotes: { ...settings.quotes, enabled: v },
            })
          }
        />
      </Section>

      {/* TV */}
      <Section title="Samsung Frame TV">
        <TextInput
          label="TV IP Address"
          value={settings.tv.ip}
          placeholder="192.168.1.100"
          onChange={(v) =>
            setSettings({ ...settings, tv: { ...settings.tv, ip: v } })
          }
        />
      </Section>

      {/* Scheduler */}
      <Section title="Scheduler">
        <Toggle
          label="Enable Auto-Refresh"
          checked={settings.scheduler.enabled}
          onChange={(v) =>
            setSettings({
              ...settings,
              scheduler: { ...settings.scheduler, enabled: v },
            })
          }
        />
        <NumberInput
          label="Refresh Interval (minutes)"
          value={settings.scheduler.intervalMinutes}
          min={1}
          max={1440}
          onChange={(v) =>
            setSettings({
              ...settings,
              scheduler: { ...settings.scheduler, intervalMinutes: v },
            })
          }
        />
      </Section>

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-8 rounded-md bg-frame-accent px-6 py-2.5 font-medium text-white transition-colors hover:bg-frame-accent/90 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8 rounded-lg border border-frame-border bg-frame-surface p-5">
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-frame-muted">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-frame-text">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-frame-border bg-frame-bg px-3 py-1.5 text-sm text-frame-text"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-frame-text">{label}</label>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? "bg-frame-accent" : "bg-frame-border"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function TextInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-frame-text">{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-48 rounded-md border border-frame-border bg-frame-bg px-3 py-1.5 text-sm text-frame-text placeholder-frame-muted"
      />
    </div>
  );
}

function NumberInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-frame-text">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || min)}
        className="w-24 rounded-md border border-frame-border bg-frame-bg px-3 py-1.5 text-sm text-frame-text"
      />
    </div>
  );
}
