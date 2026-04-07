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
    // Only run on mount — not when checkTvStatus changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [scanResult, setScanResult] = useState<{
    type: "success" | "empty" | "error";
    text: string;
  } | null>(null);

  async function handleScanForTvs() {
    setScanning(true);
    setDiscoveredDevices([]);
    setScanResult(null);
    try {
      const res = await fetch("/api/tv/discover", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        // API returns a flat array of TvDeviceInfo objects
        const devices: DiscoveredDevice[] = Array.isArray(data)
          ? data
          : (data.devices ?? []);
        setDiscoveredDevices(devices);
        if (devices.length === 0) {
          setScanResult({
            type: "empty",
            text: "No Frame TVs found on your network.",
          });
        } else {
          setScanResult({
            type: "success",
            text: `Found ${devices.length} Frame TV${devices.length > 1 ? "s" : ""}. Select one below or enter an IP manually.`,
          });
        }
      } else {
        setScanResult({ type: "error", text: "Failed to scan for TVs." });
      }
    } catch {
      setScanResult({ type: "error", text: "Network error during scan." });
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

    // Step 1: verifying TV is reachable
    await new Promise((r) => setTimeout(r, 500));
    setPairStep(2);

    // Step 2+3: the API call does HTTP probe then WebSocket pairing
    // This can take up to 60 seconds while waiting for user to press Allow
    try {
      const res = await fetch("/api/tv/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: settings.tv.ip }),
      });

      const data = await res.json();

      if (res.ok && data.paired) {
        setPairStep(3);
        setPairResult(
          `Paired with ${data.device?.name ?? "TV"} (${data.device?.model ?? "Unknown"})`,
        );
        await checkTvStatus(settings.tv.ip);
      } else {
        setPairResult(data.error || "Pairing failed");
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
          options={[
            "forest",
            "ocean",
            "astro",
            "sky",
            "cute",
            "landmarks",
            "natgeo",
          ]}
          onChange={(v) =>
            setSettings({ ...settings, theme: v as AppSettings["theme"] })
          }
        />
      </Section>

      {/* Image Style */}
      <Section title="Image Style">
        <Select
          label="Rendering Style"
          value={settings.imageStyle ?? "photorealistic"}
          options={[
            "photorealistic",
            "fine-art",
            "artistic",
            "illustration",
            "random",
          ]}
          onChange={(v) =>
            setSettings({
              ...settings,
              imageStyle: v as AppSettings["imageStyle"],
            })
          }
        />
      </Section>

      {/* Overlays */}
      <Section title="Image Overlays">
        <Toggle
          label="Show Quote on Image"
          checked={settings.overlay?.showQuote ?? false}
          onChange={(v) =>
            setSettings({
              ...settings,
              overlay: {
                ...settings.overlay,
                showQuote: v,
                showWeather: settings.overlay?.showWeather ?? false,
              },
            })
          }
        />
        <Toggle
          label="Show Weather on Image"
          checked={settings.overlay?.showWeather ?? false}
          onChange={(v) =>
            setSettings({
              ...settings,
              overlay: {
                ...settings.overlay,
                showWeather: v,
                showQuote: settings.overlay?.showQuote ?? false,
              },
            })
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
        scanResult={scanResult}
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
  scanResult,
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
  scanResult: { type: "success" | "empty" | "error"; text: string } | null;
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
    1: "Verifying TV is reachable...",
    2: "Waiting for you to press Allow on your TV remote (up to 60s)...",
    3: "Paired successfully!",
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
        {/* Connected device info — show at top when connected */}
        {tvConnection === "connected" && tvDevice && (
          <div className="rounded-md border border-green-500/20 bg-green-500/5 p-3">
            <p className="mb-1 text-xs font-medium text-green-600">
              Connected Device
            </p>
            <p className="text-sm text-frame-text">
              {tvDevice.name} — {tvDevice.model}
            </p>
            <p className="text-xs text-frame-muted">
              Firmware: {tvDevice.firmwareVersion} | Art Mode:{" "}
              {tvDevice.isArtMode ? "On" : "Off"}
            </p>
          </div>
        )}

        {/* Step 1: Find your TV */}
        <div>
          <p className="mb-2 text-xs font-medium text-frame-muted">
            Step 1: Find your TV
          </p>
          <p className="mb-3 text-xs text-frame-muted">
            Scan your network to auto-discover Frame TVs, or enter the IP
            address manually. Your TV must be powered on (not just standby) to
            be discovered.
          </p>

          {/* Scan button */}
          <button
            type="button"
            onClick={onScan}
            disabled={scanning}
            className="mb-3 w-full rounded-md border border-frame-border bg-frame-bg px-3 py-2 text-sm text-frame-text transition-colors hover:bg-frame-border disabled:opacity-50"
          >
            {scanning
              ? "Scanning your network... (up to 10 seconds)"
              : "Scan for Frame TVs"}
          </button>

          {/* Scan result message */}
          {scanResult && (
            <div
              className={`mb-3 rounded-md px-3 py-2 text-sm ${
                scanResult.type === "success"
                  ? "bg-frame-success/10 text-frame-success"
                  : scanResult.type === "empty"
                    ? "bg-yellow-500/10 text-yellow-600"
                    : "bg-frame-error/10 text-frame-error"
              }`}
            >
              <p>{scanResult.text}</p>
              {scanResult.type === "empty" && (
                <p className="mt-1 text-xs opacity-80">
                  Make sure your TV is powered on and connected to the same WiFi
                  network. You can also enter the IP address manually below.
                </p>
              )}
            </div>
          )}

          {/* Discovered devices list */}
          {discoveredDevices.length > 0 && (
            <div className="mb-3 rounded-md border border-frame-border bg-frame-bg p-2">
              <p className="mb-2 text-xs text-frame-muted">
                Click a TV to select it:
              </p>
              <div className="space-y-1">
                {discoveredDevices.map((device) => (
                  <button
                    key={device.ip}
                    type="button"
                    onClick={() => onSelectDevice(device.ip)}
                    className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-frame-text hover:bg-frame-accent/10 hover:text-frame-accent"
                  >
                    <span className="font-medium">
                      {device.name}{" "}
                      <span className="font-normal text-frame-muted">
                        ({device.model})
                      </span>
                    </span>
                    <span className="text-xs text-frame-muted">
                      {device.ip}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Manual IP input */}
          <TextInput
            label="TV IP Address"
            value={settings.tv.ip}
            placeholder="e.g. 192.168.1.100"
            onChange={(v) =>
              setSettings({ ...settings, tv: { ...settings.tv, ip: v } })
            }
          />
          {!settings.tv.ip && (
            <p className="mt-1 text-xs text-frame-muted">
              Find your TV&apos;s IP in its network settings, or use the scan
              above.
            </p>
          )}
        </div>

        {/* Step 2: Connect */}
        {settings.tv.ip && (
          <div>
            <p className="mb-2 text-xs font-medium text-frame-muted">
              Step 2: Connect to your TV
            </p>
            <p className="mb-3 text-xs text-frame-muted">
              Test the connection to verify your TV is reachable, then pair to
              enable art publishing.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onTestConnection}
                disabled={tvConnection === "checking"}
                className="flex-1 rounded-md border border-frame-border bg-frame-bg px-3 py-2 text-sm text-frame-text transition-colors hover:bg-frame-border disabled:opacity-50"
              >
                {tvConnection === "checking" ? "Testing..." : "Test Connection"}
              </button>
              <button
                type="button"
                onClick={onPair}
                disabled={pairing}
                className="flex-1 rounded-md bg-frame-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-frame-accent/90 disabled:opacity-50"
              >
                {pairing ? "Pairing..." : "Pair with TV"}
              </button>
            </div>
          </div>
        )}

        {/* Pairing steps */}
        {pairStep !== null && (
          <div className="rounded-md border border-frame-border bg-frame-bg p-3">
            <ol className="space-y-1.5">
              {([1, 2, 3] as PairStep[]).map((step) => (
                <li
                  key={step}
                  className={`flex items-center gap-2 text-sm ${
                    step === pairStep
                      ? "font-medium text-frame-accent"
                      : step < pairStep
                        ? "text-frame-success"
                        : "text-frame-muted"
                  }`}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs">
                    {step < pairStep ? "✓" : step}
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
            {pairResult.startsWith("Paired") && (
              <p className="mt-1 text-xs opacity-80">
                You can now publish images to your TV from the Preview Studio.
              </p>
            )}
          </div>
        )}
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
