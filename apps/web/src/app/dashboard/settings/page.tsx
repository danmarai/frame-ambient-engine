"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppSettings } from "@frame/core";
import { DEFAULT_SETTINGS } from "@frame/core";

interface DiscoveredDevice {
  ip: string;
  name: string;
  model: string;
}

interface TvStatusResult {
  connected: boolean;
  device?: {
    name: string;
    model: string;
    isFrameTV: boolean;
    isArtMode: boolean;
    firmwareVersion: string;
  };
  error?: string;
}

type PairStep = 1 | 2 | 3;

type TvConnectionState =
  | "unknown"
  | "checking"
  | "connected"
  | "disconnected"
  | "no-tv";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // TV-specific state
  const [tvConnection, setTvConnection] =
    useState<TvConnectionState>("unknown");
  const [tvDevice, setTvDevice] = useState<TvStatusResult["device"] | null>(
    null,
  );
  const [scanning, setScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<
    DiscoveredDevice[]
  >([]);
  const [pairing, setPairing] = useState(false);
  const [pairStep, setPairStep] = useState<PairStep | null>(null);
  const [pairResult, setPairResult] = useState<string | null>(null);

  const checkTvStatus = useCallback(
    async (ip?: string) => {
      const targetIp = ip ?? settings.tv.ip;
      if (!targetIp) {
        setTvConnection("no-tv");
        setTvDevice(null);
        return;
      }
      setTvConnection("checking");
      try {
        const res = await fetch(
          `/api/tv/status?ip=${encodeURIComponent(targetIp)}`,
        );
        const data: TvStatusResult = await res.json();
        if (data.connected) {
          setTvConnection("connected");
          setTvDevice(data.device ?? null);
        } else {
          setTvConnection("disconnected");
          setTvDevice(null);
        }
      } catch {
        setTvConnection("disconnected");
        setTvDevice(null);
      }
    },
    [settings.tv.ip],
  );

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings(data);
        // Check TV status after loading settings
        if (data.tv?.ip) {
          checkTvStatus(data.tv.ip);
        } else {
          setTvConnection("no-tv");
        }
      })
      .catch(() => {});
  }, [checkTvStatus]);

  async function handleScanForTvs() {
    setScanning(true);
    setDiscoveredDevices([]);
    try {
      const res = await fetch("/api/tv/discover", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setDiscoveredDevices(data.devices ?? []);
        if (!data.devices?.length) {
          setMessage({ type: "error", text: "No TVs found on network" });
        }
      } else {
        setMessage({ type: "error", text: "Failed to scan for TVs" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error during scan" });
    } finally {
      setScanning(false);
    }
  }

  async function handlePair() {
    if (!settings.tv.ip) {
      setMessage({ type: "error", text: "Enter a TV IP address first" });
      return;
    }
    setPairing(true);
    setPairResult(null);
    setPairStep(1);

    // Step 1: brief pause for user to read
    await new Promise((r) => setTimeout(r, 800));
    setPairStep(2);

    try {
      const res = await fetch("/api/tv/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: settings.tv.ip }),
      });

      setPairStep(3);

      if (res.ok) {
        const data = await res.json();
        setPairResult(
          data.device
            ? `Paired with ${data.device.name} (${data.device.model})`
            : "Pairing successful",
        );
        await checkTvStatus();
      } else {
        const err = await res.json().catch(() => ({ error: "Pairing failed" }));
        setPairResult(err.error || "Pairing failed");
      }
    } catch {
      setPairResult("Network error during pairing");
    } finally {
      setPairing(false);
    }
  }

  function handleSelectDiscoveredDevice(ip: string) {
    setSettings({ ...settings, tv: { ...settings.tv, ip } });
    setDiscoveredDevices([]);
  }

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
      <TvSection
        settings={settings}
        setSettings={setSettings}
        tvConnection={tvConnection}
        tvDevice={tvDevice}
        scanning={scanning}
        discoveredDevices={discoveredDevices}
        pairing={pairing}
        pairStep={pairStep}
        pairResult={pairResult}
        onScan={handleScanForTvs}
        onPair={handlePair}
        onTestConnection={() => checkTvStatus()}
        onSelectDevice={handleSelectDiscoveredDevice}
      />

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

function ConnectionStatusDot({ state }: { state: TvConnectionState }) {
  const colors: Record<TvConnectionState, string> = {
    unknown: "bg-gray-400",
    checking: "bg-yellow-400 animate-pulse",
    connected: "bg-green-500",
    disconnected: "bg-red-500",
    "no-tv": "bg-gray-400",
  };

  const labels: Record<TvConnectionState, string> = {
    unknown: "Unknown",
    checking: "Checking...",
    connected: "Connected",
    disconnected: "Not connected",
    "no-tv": "No TV configured",
  };

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-frame-muted">
      <span className={`inline-block h-2 w-2 rounded-full ${colors[state]}`} />
      {labels[state]}
    </span>
  );
}

function TvSection({
  settings,
  setSettings,
  tvConnection,
  tvDevice,
  scanning,
  discoveredDevices,
  pairing,
  pairStep,
  pairResult,
  onScan,
  onPair,
  onTestConnection,
  onSelectDevice,
}: {
  settings: AppSettings;
  setSettings: (s: AppSettings) => void;
  tvConnection: TvConnectionState;
  tvDevice: TvStatusResult["device"] | null;
  scanning: boolean;
  discoveredDevices: DiscoveredDevice[];
  pairing: boolean;
  pairStep: PairStep | null;
  pairResult: string | null;
  onScan: () => void;
  onPair: () => void;
  onTestConnection: () => void;
  onSelectDevice: (ip: string) => void;
}) {
  const pairSteps: Record<PairStep, string> = {
    1: "Ensure your TV is powered on",
    2: "Click Pair to initiate connection",
    3: "On your TV, press Allow when prompted",
  };

  return (
    <div className="mb-8 rounded-lg border border-frame-border bg-frame-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-frame-muted">
          Samsung Frame TV
        </h2>
        <ConnectionStatusDot state={tvConnection} />
      </div>
      <div className="space-y-4">
        {/* IP Input */}
        <TextInput
          label="TV IP Address"
          value={settings.tv.ip}
          placeholder="192.168.1.100"
          onChange={(v) =>
            setSettings({ ...settings, tv: { ...settings.tv, ip: v } })
          }
        />

        {/* Scan for TVs */}
        <div className="flex items-center justify-between">
          <label className="text-sm text-frame-text">Discover TVs</label>
          <button
            type="button"
            onClick={onScan}
            disabled={scanning}
            className="rounded-md border border-frame-border bg-frame-bg px-3 py-1.5 text-sm text-frame-text transition-colors hover:bg-frame-border disabled:opacity-50"
          >
            {scanning ? "Scanning..." : "Scan for TVs"}
          </button>
        </div>

        {/* Discovered devices list */}
        {discoveredDevices.length > 0 && (
          <div className="rounded-md border border-frame-border bg-frame-bg p-2">
            <p className="mb-2 text-xs text-frame-muted">
              Found {discoveredDevices.length} device(s):
            </p>
            <div className="space-y-1">
              {discoveredDevices.map((device) => (
                <button
                  key={device.ip}
                  type="button"
                  onClick={() => onSelectDevice(device.ip)}
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-frame-text hover:bg-frame-border"
                >
                  <span>
                    {device.name} ({device.model})
                  </span>
                  <span className="text-xs text-frame-muted">{device.ip}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Pair button */}
        <div className="flex items-center justify-between">
          <label className="text-sm text-frame-text">Pair with TV</label>
          <button
            type="button"
            onClick={onPair}
            disabled={pairing || !settings.tv.ip}
            className="rounded-md border border-frame-border bg-frame-bg px-3 py-1.5 text-sm text-frame-text transition-colors hover:bg-frame-border disabled:opacity-50"
          >
            {pairing ? "Pairing..." : "Pair"}
          </button>
        </div>

        {/* Pairing steps */}
        {pairStep !== null && (
          <div className="rounded-md border border-frame-border bg-frame-bg p-3">
            <p className="mb-2 text-xs font-medium text-frame-muted">
              Pairing Steps:
            </p>
            <ol className="space-y-1.5">
              {([1, 2, 3] as PairStep[]).map((step) => (
                <li
                  key={step}
                  className={`flex items-center gap-2 text-sm ${
                    step === pairStep
                      ? "font-medium text-frame-accent"
                      : step < pairStep
                        ? "text-frame-muted line-through"
                        : "text-frame-muted"
                  }`}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs">
                    {step}
                  </span>
                  {pairSteps[step]}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Pair result */}
        {pairResult && (
          <div
            className={`rounded-md px-3 py-2 text-sm ${
              pairResult.startsWith("Paired")
                ? "bg-frame-success/10 text-frame-success"
                : "bg-frame-error/10 text-frame-error"
            }`}
          >
            {pairResult}
          </div>
        )}

        {/* Connected device info */}
        {tvConnection === "connected" && tvDevice && (
          <div className="rounded-md border border-green-500/20 bg-green-500/5 p-3">
            <p className="mb-1 text-xs font-medium text-frame-muted">
              Connected Device
            </p>
            <p className="text-sm text-frame-text">
              {tvDevice.name} - {tvDevice.model}
            </p>
            <p className="text-xs text-frame-muted">
              Firmware: {tvDevice.firmwareVersion} | Art Mode:{" "}
              {tvDevice.isArtMode ? "On" : "Off"}
            </p>
          </div>
        )}

        {/* Test Connection button */}
        <div className="flex items-center justify-between">
          <label className="text-sm text-frame-text">Test Connection</label>
          <button
            type="button"
            onClick={onTestConnection}
            disabled={!settings.tv.ip || tvConnection === "checking"}
            className="rounded-md border border-frame-border bg-frame-bg px-3 py-1.5 text-sm text-frame-text transition-colors hover:bg-frame-border disabled:opacity-50"
          >
            {tvConnection === "checking" ? "Testing..." : "Test Connection"}
          </button>
        </div>
      </div>
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
