/**
 * Frame Art — Android companion app for Samsung Frame TV
 *
 * Architecture:
 * - Connect: scan for TVs (auto-detect subnet), pick one
 * - Gallery: cloud art cards, push to TV via native TCP
 * - Studio: WebView with bidirectional JS bridge
 *
 * Upload: Studio WebView → postMessage → native TCP → TV → progress back to WebView
 */

import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  Platform,
  Alert,
  BackHandler,
} from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import TcpSocket from "react-native-tcp-socket";
// Buffer is globally available in React Native (Hermes runtime).
// react-native-tcp-socket depends on the `buffer` package and ensures the
// polyfill is loaded at runtime. No explicit dependency needed in this package.

// ============================================================
// Config
// ============================================================

const CLOUD = "https://frameapp.dmarantz.com";
const DEBUG = true;
const SCAN_TIMEOUT = 1000;
const UPLOAD_TIMEOUT = 45000;
const FLUSH_WAIT = 1500;

// ============================================================
// Types
// ============================================================

type Screen = "connect" | "gallery" | "studio";

interface TvInfo {
  ip: string;
  name: string;
  model: string;
  year: number | null;
  resolution: string;
}
interface Scene {
  sceneId: string;
  prompt: string;
  imageUrl: string;
  durationMs: number;
  provider: string;
}

// Shared upload contract — matches docs/HARDENING_PLAN.md exactly
type UploadPhase =
  | "checking_tv"
  | "activating_art_mode"
  | "downloading_image"
  | "connecting_ws"
  | "requesting_send"
  | "waiting_ready"
  | "uploading_tcp"
  | "tcp_flushing"
  | "waiting_image_added"
  | "selecting_image"
  | "activating_display"
  | "complete"
  | "failed";

type UploadError =
  | "tv_not_reachable"
  | "art_service_unavailable"
  | "pairing_required"
  | "tv_recovering"
  | "upload_in_progress"
  | "tcp_failed"
  | "tcp_incomplete"
  | "ws_failed"
  | "ws_timeout"
  | "image_rejected"
  | "storage_full"
  | "unsupported_operation"
  | "activation_failed"
  | "invalid_image"
  | "download_failed";

interface UploadResult {
  success: boolean;
  phase: UploadPhase;
  error?: UploadError;
  errorDetail?: string;
  contentId?: string;
  durationMs: number;
  requestId: string;
  tvIp: string;
  retryAllowed: boolean;
  retryAfterMs?: number;
}

// ============================================================
// Per-TV Upload Mutex
// ============================================================

const tvUploadLocks = new Map<string, Promise<UploadResult>>();

// ============================================================
// Per-TV Circuit Breaker
// ============================================================

const COOLDOWN_MS = 30000;

// Crash-class errors that trip the breaker (per HARDENING_PLAN.md)
const CRASH_ERRORS: Set<UploadError> = new Set([
  "tcp_failed",
  "tcp_incomplete",
  "ws_timeout",
  "art_service_unavailable",
]);

interface BreakerState {
  state: "closed" | "open" | "half_open";
  trippedAt: number;
  lastError?: UploadError;
}

const tvBreakers = new Map<string, BreakerState>();

function checkBreaker(tvIp: string): BreakerState {
  const b = tvBreakers.get(tvIp);
  if (!b || b.state === "closed") return { state: "closed", trippedAt: 0 };

  const elapsed = Date.now() - b.trippedAt;
  if (elapsed >= COOLDOWN_MS) {
    // Cooldown expired → half_open (allow one probe)
    const halfOpen: BreakerState = {
      state: "half_open",
      trippedAt: b.trippedAt,
      lastError: b.lastError,
    };
    tvBreakers.set(tvIp, halfOpen);
    return halfOpen;
  }

  // Still in cooldown
  return b;
}

function tripBreaker(tvIp: string, error: UploadError): void {
  tvBreakers.set(tvIp, {
    state: "open",
    trippedAt: Date.now(),
    lastError: error,
  });
}

function resetBreaker(tvIp: string): void {
  tvBreakers.delete(tvIp);
}

// ============================================================
// Upload State Machine
// ============================================================

function makeRequestId(): string {
  return `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fail(
  phase: UploadPhase,
  error: UploadError,
  detail: string,
  start: number,
  rid: string,
  tvIp: string,
): UploadResult {
  return {
    success: false,
    phase,
    error,
    errorDetail: detail,
    durationMs: Date.now() - start,
    requestId: rid,
    tvIp,
    retryAllowed: true,
  };
}

/** Acquire per-TV mutex. Returns null if lock held, or a release function. */
function acquireTvLock(tvIp: string): (() => void) | null {
  if (tvUploadLocks.has(tvIp)) return null;
  let release: () => void;
  const p = new Promise<void>((resolve) => {
    release = () => {
      tvUploadLocks.delete(tvIp);
      resolve();
    };
  });
  tvUploadLocks.set(tvIp, p as any);
  return release!;
}

async function nativeUploadToTv(
  tvIp: string,
  imageData: Buffer,
  onPhase: (phase: UploadPhase, detail: string) => void,
): Promise<UploadResult> {
  const start = Date.now();
  const rid = makeRequestId();
  return doUpload(tvIp, imageData, rid, start, onPhase);
}

async function doUpload(
  tvIp: string,
  imageData: Buffer,
  rid: string,
  start: number,
  onPhase: (phase: UploadPhase, detail: string) => void,
): Promise<UploadResult> {
  return new Promise((resolve) => {
    let resolved = false;
    let tcpWriteDone = false; // write callback fired + end() called
    let tcpClosed = false; // socket close event fired
    let imageAdded = false;
    let contentId = "";
    let currentPhase: UploadPhase = "connecting_ws";

    const done = (result: UploadResult) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {}
      resolve(result);
    };

    const setPhase = (phase: UploadPhase, detail: string) => {
      currentPhase = phase;
      onPhase(phase, detail);
    };

    // Global timeout
    const timer = setTimeout(() => {
      done(
        fail(
          currentPhase,
          "ws_timeout",
          "Upload timeout after 45s",
          start,
          rid,
          tvIp,
        ),
      );
    }, UPLOAD_TIMEOUT);

    // Phase: connecting_ws
    setPhase("connecting_ws", "Opening WebSocket to " + tvIp + ":8002...");
    const ws = new WebSocket(
      `wss://${tvIp}:8002/api/v2/channels/com.samsung.art-app?name=${btoa("FrameArtApp")}`,
    );

    ws.onopen = () =>
      setPhase("connecting_ws", "WebSocket open, waiting for channel...");

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);

        // Phase: requesting_send (channel handshake received)
        if (
          msg.event === "ms.channel.connect" ||
          msg.event === "ms.channel.ready"
        ) {
          setPhase(
            "requesting_send",
            "Channel ready (" + msg.event + "), sending send_image...",
          );
          ws.send(
            JSON.stringify({
              method: "ms.channel.emit",
              params: {
                event: "art_app_request",
                to: "host",
                data: JSON.stringify({
                  request: "send_image",
                  file_type: "jpg",
                  request_id: rid,
                  id: rid,
                  conn_info: {
                    d2d_mode: "socket",
                    connection_id: Math.floor(Math.random() * 4294967296),
                    id: rid,
                  },
                  image_date: new Date()
                    .toISOString()
                    .replace("T", " ")
                    .split(".")[0]
                    .replace(/-/g, ":"),
                  matte_id: "none",
                  portrait_matte_id: "shadowbox_polar",
                  file_size: imageData.length,
                }),
              },
            }),
          );
          setPhase("waiting_ready", "Waiting for TV to prepare d2d socket...");
        }

        if (msg.event === "d2d_service_message") {
          const inner =
            typeof msg.data === "string" ? JSON.parse(msg.data) : msg.data;

          // Phase: uploading_tcp (ready_to_use received)
          if (inner.event === "ready_to_use" && inner.conn_info) {
            const ci =
              typeof inner.conn_info === "string"
                ? JSON.parse(inner.conn_info)
                : inner.conn_info;
            if (!ci.ip || !ci.port || !ci.key) {
              done(
                fail(
                  "waiting_ready",
                  "ws_failed",
                  "Invalid conn_info from TV",
                  start,
                  rid,
                  tvIp,
                ),
              );
              return;
            }

            setPhase(
              "uploading_tcp",
              "Opening TCP to " + ci.ip + ":" + ci.port + "...",
            );
            const hdr = JSON.stringify({
              num: 0,
              total: 1,
              fileLength: imageData.length,
              fileName: "art.jpg",
              fileType: "jpg",
              secKey: ci.key,
              version: "0.0.1",
            });
            const hb = Buffer.from(hdr, "ascii");
            const lb = Buffer.alloc(4);
            lb.writeUInt32BE(hb.length, 0);

            const tcp = TcpSocket.createConnection(
              { host: ci.ip, port: parseInt(ci.port) },
              () => {
                setPhase(
                  "uploading_tcp",
                  "TCP connected, writing " +
                    (imageData.length / 1024).toFixed(0) +
                    "KB...",
                );
                tcp.write(lb);
                tcp.write(hb);
                tcp.write(Buffer.from(imageData), () => {
                  tcpWriteDone = true;
                  setPhase(
                    "tcp_flushing",
                    "Write complete, flushing socket...",
                  );
                  tcp.end();
                });
              },
            );

            tcp.on("close", () => {
              tcpClosed = true;
              // If socket closed before write callback fired, it's an incomplete upload
              if (!tcpWriteDone) {
                done(
                  fail(
                    "uploading_tcp",
                    "tcp_incomplete",
                    "TCP socket closed before all bytes were written",
                    start,
                    rid,
                    tvIp,
                  ),
                );
                return;
              }
              setPhase(
                "waiting_image_added",
                "TCP closed cleanly, waiting for TV confirmation...",
              );
              // If image_added already arrived (unlikely but possible), finish
              if (imageAdded) {
                finishActivation(
                  ws,
                  contentId,
                  start,
                  rid,
                  tvIp,
                  setPhase,
                  done,
                );
              }
            });

            tcp.on("error", (e) => {
              done(
                fail(
                  "uploading_tcp",
                  "tcp_failed",
                  "TCP error: " + e.message,
                  start,
                  rid,
                  tvIp,
                ),
              );
            });
          }

          // Phase: waiting_image_added → selecting_image
          if (inner.event === "image_added") {
            contentId = inner.content_id;
            imageAdded = true;
            setPhase(
              "waiting_image_added",
              "TV confirmed image received: " + contentId,
            );
            // Only proceed to activation if TCP write is done and socket closed
            if (tcpWriteDone && tcpClosed) {
              finishActivation(ws, contentId, start, rid, tvIp, setPhase, done);
            }
            // If TCP not done yet, the tcp.on("close") handler will trigger activation
          }

          // d2d error from TV
          if (inner.event === "error") {
            const code = inner.error_code;
            if (code === -11) {
              done(
                fail(
                  currentPhase,
                  "storage_full",
                  "TV storage full (error -11)",
                  start,
                  rid,
                  tvIp,
                ),
              );
            } else if (code === -7) {
              done(
                fail(
                  currentPhase,
                  "unsupported_operation",
                  "Unsupported (error -7)",
                  start,
                  rid,
                  tvIp,
                ),
              );
            } else {
              done(
                fail(
                  currentPhase,
                  "image_rejected",
                  "TV error code: " + code,
                  start,
                  rid,
                  tvIp,
                ),
              );
            }
          }
        }
      } catch (e: any) {
        setPhase(currentPhase, "Parse error: " + e.message);
      }
    };

    ws.onerror = () => {
      done(
        fail(
          currentPhase,
          "ws_failed",
          "WebSocket connection error",
          start,
          rid,
          tvIp,
        ),
      );
    };

    ws.onclose = () => {
      // If WS closes before we're done, it's a failure
      if (!resolved) {
        done(
          fail(
            currentPhase,
            "ws_failed",
            "WebSocket closed unexpectedly during " + currentPhase,
            start,
            rid,
            tvIp,
          ),
        );
      }
    };
  });
}

/** After TCP complete + image_added confirmed, select and activate */
function finishActivation(
  ws: WebSocket,
  contentId: string,
  start: number,
  rid: string,
  tvIp: string,
  setPhase: (p: UploadPhase, d: string) => void,
  done: (r: UploadResult) => void,
) {
  // Phase: selecting_image
  setTimeout(() => {
    setPhase("selecting_image", "Selecting image " + contentId + "...");
    ws.send(
      JSON.stringify({
        method: "ms.channel.emit",
        params: {
          event: "art_app_request",
          to: "host",
          data: JSON.stringify({
            request: "select_image",
            content_id: contentId,
            id: "sel",
          }),
        },
      }),
    );
  }, FLUSH_WAIT);

  // Phase: activating_display
  setTimeout(() => {
    setPhase("activating_display", "Activating Art Mode...");
    ws.send(
      JSON.stringify({
        method: "ms.channel.emit",
        params: {
          event: "art_app_request",
          to: "host",
          data: JSON.stringify({
            request: "set_artmode_status",
            value: "on",
            id: "art",
          }),
        },
      }),
    );
  }, FLUSH_WAIT + 1500);

  // Phase: complete
  setTimeout(() => {
    setPhase("complete", "Art is displaying on TV!");
    done({
      success: true,
      phase: "complete",
      contentId,
      durationMs: Date.now() - start,
      requestId: rid,
      tvIp,
      retryAllowed: true,
    });
  }, FLUSH_WAIT + 3500);
}

// Multi-level TV connectivity check
interface TvState {
  reachable: boolean;
  artServiceUp: boolean;
  artMode: string | null;
  wsConnected: boolean;
}

async function checkTvState(
  tvIp: string,
  onStage?: (s: string) => void,
): Promise<TvState> {
  const log = onStage || (() => {});
  const state: TvState = {
    reachable: false,
    artServiceUp: false,
    artMode: null,
    wsConnected: false,
  };

  log("Checking TV at " + tvIp + ":8001...");
  try {
    const c = new AbortController();
    setTimeout(() => c.abort(), 4000);
    const r = await fetch(`http://${tvIp}:8001/api/v2/`, { signal: c.signal });
    if (r.ok) {
      state.reachable = true;
      log("TV is on the network");
    }
  } catch {
    log("TV not reachable on port 8001");
    return state;
  }

  log("Connecting to Art Mode service (port 8002)...");
  return new Promise((resolve) => {
    const ws = new WebSocket(
      `wss://${tvIp}:8002/api/v2/channels/com.samsung.art-app?name=${btoa("FrameArtApp")}`,
    );
    const t = setTimeout(() => {
      log("Art service timeout (10s) — may need pairing approval on TV");
      try {
        ws.close();
      } catch {}
      resolve(state);
    }, 10000);

    ws.onopen = () => {
      state.artServiceUp = true;
      log("WebSocket open, waiting for channel...");
    };
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data as string);
        if (
          m.event === "ms.channel.connect" ||
          m.event === "ms.channel.ready"
        ) {
          state.wsConnected = true;
          log("Channel connected (" + m.event + "), querying art mode...");
          ws.send(
            JSON.stringify({
              method: "ms.channel.emit",
              params: {
                event: "art_app_request",
                to: "host",
                data: JSON.stringify({
                  request: "get_artmode_status",
                  id: "h",
                }),
              },
            }),
          );
        }
        if (m.event === "d2d_service_message") {
          const i = typeof m.data === "string" ? JSON.parse(m.data) : m.data;
          if (i.event === "artmode_status") {
            state.artMode = i.value;
            log("Art Mode: " + i.value);
            clearTimeout(t);
            try {
              ws.close();
            } catch {}
            resolve(state);
          }
        }
      } catch {}
    };
    ws.onerror = () => {
      clearTimeout(t);
      log("WebSocket error — art service may not be running");
      resolve(state);
    };
    ws.onclose = () => {
      clearTimeout(t);
      if (!state.wsConnected) log("WebSocket closed before handshake");
      resolve(state);
    };
  });
}

async function activateArtMode(
  tvIp: string,
  onStage?: (s: string) => void,
): Promise<boolean> {
  const log = onStage || (() => {});
  log("Attempting to activate Art Mode...");
  return new Promise((resolve) => {
    const ws = new WebSocket(
      `wss://${tvIp}:8002/api/v2/channels/com.samsung.art-app?name=${btoa("FrameArtApp")}`,
    );
    const t = setTimeout(() => {
      try {
        ws.close();
      } catch {}
      resolve(false);
    }, 8000);
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data as string);
        if (
          m.event === "ms.channel.connect" ||
          m.event === "ms.channel.ready"
        ) {
          ws.send(
            JSON.stringify({
              method: "ms.channel.emit",
              params: {
                event: "art_app_request",
                to: "host",
                data: JSON.stringify({
                  request: "set_artmode_status",
                  value: "on",
                  id: "activate",
                }),
              },
            }),
          );
          setTimeout(() => {
            clearTimeout(t);
            log("Art Mode activation sent");
            try {
              ws.close();
            } catch {}
            resolve(true);
          }, 2000);
        }
      } catch {}
    };
    ws.onerror = () => {
      clearTimeout(t);
      resolve(false);
    };
  });
}

async function checkHealth(
  tvIp: string,
): Promise<{ alive: boolean; artMode: string | null }> {
  const state = await checkTvState(tvIp);
  return { alive: state.wsConnected, artMode: state.artMode };
}

// ============================================================
// Telemetry
// ============================================================

let deviceId = "android-" + Math.random().toString(36).slice(2, 10);
let sessionId = "ses-" + Date.now().toString(36);

async function uploadTelemetry(logs: string[], tvIp: string, screen: string) {
  try {
    await fetch(CLOUD + "/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId,
        sessionId,
        tvIp,
        screen,
        timestamp: new Date().toISOString(),
        logs: logs.slice(-200),
      }),
    });
  } catch {}
}

// ============================================================
// App
// ============================================================

let scanAborted = false;

export default function App() {
  const [screen, setScreen] = useState<Screen>("connect");
  const [tvIp, setTvIp] = useState("");
  const [tvInfo, setTvInfo] = useState<TvInfo | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState<"info" | "success" | "error">(
    "info",
  );
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [foundTvs, setFoundTvs] = useState<TvInfo[]>([]);
  const [scanPct, setScanPct] = useState(0);
  const [scanStage, setScanStage] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [tvHealth, setTvHealth] = useState("");
  const webRef = useRef<WebView>(null);
  const logsRef = useRef<string[]>([]);

  function log(m: string) {
    const l = new Date().toLocaleTimeString() + " " + m;
    logsRef.current = [...logsRef.current.slice(-200), l];
    setLogs((p) => [...p.slice(-200), l]);
    console.log("[FA]", m);
  }
  function stat(m: string, t: "info" | "success" | "error" = "info") {
    setStatus(m);
    setStatusType(t);
    log(m);
  }

  function sendToWebView(type: string, data: Record<string, any>) {
    if (webRef.current) {
      webRef.current.injectJavaScript(
        `if(window.__onNativeMessage){window.__onNativeMessage(${JSON.stringify({ type, ...data })})}true;`,
      );
    }
  }

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen === "studio") {
        setScreen("gallery");
        return true;
      }
      if (screen === "gallery") {
        setScreen("connect");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen]);

  useEffect(() => {
    scanNetwork();
  }, []);

  // Detect phone's local subnet via TCP socket
  async function detectLocalSubnet(): Promise<string | null> {
    try {
      const socket = TcpSocket.createConnection(
        { host: "8.8.8.8", port: 53 },
        () => {
          socket.destroy();
        },
      );
      return new Promise((resolve) => {
        socket.on("connect", () => {
          const addr = socket.address();
          socket.destroy();
          if (addr && typeof addr === "object" && "address" in addr) {
            const ip = (addr as any).address as string;
            const parts = ip.split(".");
            if (parts.length === 4) resolve(parts.slice(0, 3).join(".") + ".");
            else resolve(null);
          } else resolve(null);
        });
        socket.on("error", () => resolve(null));
        setTimeout(() => {
          socket.destroy();
          resolve(null);
        }, 3000);
      });
    } catch {
      return null;
    }
  }

  async function scanNetwork() {
    scanAborted = false;
    setScanning(true);
    setFoundTvs([]);
    setScanPct(0);
    setScanStage("Detecting your network...");
    log("=== SCAN START ===");

    const detectedSubnet = await detectLocalSubnet();
    log("Phone subnet: " + (detectedSubnet || "unknown"));

    const fallbacks = [
      "192.168.1.",
      "192.168.0.",
      "192.168.86.",
      "192.168.254.",
      "10.0.0.",
      "10.199.1.",
    ];
    const subnets: string[] = [];
    if (detectedSubnet && !fallbacks.includes(detectedSubnet)) {
      subnets.push(detectedSubnet);
    } else if (detectedSubnet) {
      subnets.push(detectedSubnet);
      fallbacks.splice(fallbacks.indexOf(detectedSubnet), 1);
    }
    for (const s of fallbacks) {
      if (!subnets.includes(s)) subnets.push(s);
    }
    log("Scan order: " + subnets.join(", "));

    const found: TvInfo[] = [];
    let checked = 0;
    const total = subnets.length * 254;
    const t0 = Date.now();

    for (const sub of subnets) {
      if (scanAborted) break;
      setScanStage("Scanning " + sub + "x");
      log("Subnet: " + sub + "x");

      const ps: Promise<void>[] = [];
      for (let i = 1; i <= 254; i++) {
        if (scanAborted) break;
        const ip = sub + i;
        ps.push(
          (async () => {
            try {
              const c = new AbortController();
              setTimeout(() => c.abort(), SCAN_TIMEOUT);
              const r = await fetch(`http://${ip}:8001/api/v2/`, {
                signal: c.signal,
              });
              if (r.ok) {
                const d = (await r.json()).device;
                if (d?.FrameTVSupport === "true") {
                  const tv: TvInfo = {
                    ip,
                    name: d.name || "Frame TV",
                    model: d.modelName || "",
                    year: d.model
                      ? 2000 + parseInt(d.model.substring(0, 2))
                      : null,
                    resolution: d.resolution || "",
                  };
                  found.push(tv);
                  setFoundTvs((p) => [...p, tv]);
                  log("FOUND: " + tv.name + " at " + ip);
                }
              }
            } catch {}
            checked++;
            if (checked % 127 === 0 || checked === total)
              setScanPct(Math.floor((checked / total) * 100));
          })(),
        );
      }
      await Promise.all(ps);
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    setScanning(false);
    setScanStage("");
    log(
      scanAborted
        ? "Scan stopped after " + elapsed + "s"
        : found.length
          ? found.length + " TV(s) in " + elapsed + "s"
          : "No TVs (" + elapsed + "s)",
    );
  }

  async function connectTv(ip: string) {
    scanAborted = true;
    setScanning(false);
    stat("Connecting to " + ip + "...");
    try {
      const c = new AbortController();
      setTimeout(() => c.abort(), 8000);
      const r = await fetch(`http://${ip}:8001/api/v2/`, { signal: c.signal });
      const d = (await r.json()).device;
      if (d?.FrameTVSupport !== "true") {
        Alert.alert("Not a Frame TV");
        return;
      }
      const info: TvInfo = {
        ip,
        name: d.name || d.modelName,
        model: d.modelName || "",
        year: d.model ? 2000 + parseInt(d.model.substring(0, 2)) : null,
        resolution: d.resolution || "",
      };
      setTvIp(ip);
      setTvInfo(info);
      stat(`Connected: ${info.name} (${info.model})`, "success");
      log("Checking TV state...");
      const tvState = await checkTvState(ip, log);
      if (tvState.wsConnected) {
        setTvHealth(`Art Mode: ${tvState.artMode || "unknown"}`);
      } else if (tvState.reachable) {
        setTvHealth("On network, Art Mode service pending");
      } else {
        setTvHealth("Not responding");
      }
    } catch (e: any) {
      stat("Failed: " + e.message, "error");
    }
  }

  async function loadScenes() {
    try {
      const r = await fetch(CLOUD + "/api/scenes");
      const d = await r.json();
      setScenes(d);
      log("Loaded " + d.length + " scenes");
    } catch (e: any) {
      log("Load failed: " + e.message);
    }
  }

  async function pushScene(scene: Scene, fromWebView = false) {
    if (!tvIp) {
      const msg = "No TV connected";
      if (fromWebView) sendToWebView("uploadError", { error: msg });
      else stat(msg, "error");
      return;
    }

    // Per-TV mutex — covers entire operation (preflight, download, upload)
    const releaseLock = acquireTvLock(tvIp);
    if (!releaseLock) {
      const msg = "Another upload to this TV is in progress";
      log("UPLOAD: " + msg);
      if (fromWebView)
        sendToWebView("uploadError", {
          error: "upload_in_progress",
          errorDetail: msg,
        });
      else stat(msg, "error");
      return;
    }

    // Check circuit breaker
    const breaker = checkBreaker(tvIp);
    if (breaker.state === "open") {
      const remaining = COOLDOWN_MS - (Date.now() - breaker.trippedAt);
      const msg =
        "TV is recovering — wait " +
        Math.ceil(remaining / 1000) +
        "s before retrying";
      log("UPLOAD: BREAKER OPEN — " + msg);
      releaseLock();
      if (fromWebView)
        sendToWebView("uploadError", {
          error: "tv_recovering",
          errorDetail: msg,
          retryAllowed: false,
          retryAfterMs: remaining,
        });
      else stat(msg, "error");
      return;
    }
    const isProbe = breaker.state === "half_open";
    if (isProbe) log("UPLOAD: BREAKER HALF_OPEN — this upload is a probe");

    setUploading(true);
    try {
      // Phase callback: logs + WebView progress
      const onPhase = (phase: UploadPhase, detail: string) => {
        log("UPLOAD [" + phase + "] " + detail);
        if (fromWebView)
          sendToWebView("uploadProgress", { phase, stage: detail });
      };

      // --- Pre-upload: check TV state ---
      onPhase("checking_tv", "Checking TV at " + tvIp + "...");
      const tvState = await checkTvState(tvIp, (s) =>
        onPhase("checking_tv", s),
      );

      if (!tvState.reachable) {
        const msg = "TV not found on network";
        onPhase("failed", msg);
        if (fromWebView)
          sendToWebView("uploadError", {
            error: "tv_not_reachable",
            errorDetail: msg,
          });
        else
          Alert.alert(
            "TV Not Found",
            "Cannot reach TV at " +
              tvIp +
              ".\n\nCheck:\n1. TV is powered on\n2. Phone and TV on same WiFi",
            [{ text: "OK" }],
          );
        return;
      }

      if (!tvState.wsConnected) {
        onPhase(
          "activating_art_mode",
          "Art service not responding, trying to activate...",
        );
        const activated = await activateArtMode(tvIp, (s) =>
          onPhase("activating_art_mode", s),
        );
        if (!activated) {
          const msg =
            "Art Mode not available. May need pairing approval on TV.";
          onPhase("failed", msg);
          if (fromWebView)
            sendToWebView("uploadError", {
              error: "art_service_unavailable",
              errorDetail: msg,
            });
          else
            Alert.alert(
              "Art Mode Not Available",
              "Try:\n1. Check TV for pairing popup\n2. Switch to Art Mode (press power once)\n3. Wait 10s and retry",
              [
                { text: "Retry", onPress: () => pushScene(scene, fromWebView) },
                { text: "Cancel", style: "cancel" },
              ],
            );
          return;
        }
        onPhase("activating_art_mode", "Waiting for Art Mode...");
        await new Promise((r) => setTimeout(r, 3000));
      } else if (tvState.artMode === "off") {
        onPhase("activating_art_mode", "Art Mode is OFF, activating...");
        await activateArtMode(tvIp, (s) => onPhase("activating_art_mode", s));
        await new Promise((r) => setTimeout(r, 3000));
      }

      // --- Download image ---
      onPhase("downloading_image", "Downloading from cloud...");
      let img: Buffer;
      try {
        const imgUrl = scene.imageUrl.startsWith("http")
          ? scene.imageUrl
          : CLOUD + scene.imageUrl;
        const r = await fetch(imgUrl);
        if (!r.ok) throw new Error("HTTP " + r.status);
        const buf = await r.arrayBuffer();
        img = Buffer.from(buf);
        onPhase(
          "downloading_image",
          "Downloaded " + (img.length / 1024).toFixed(0) + "KB",
        );
      } catch (e: any) {
        onPhase("failed", "Download error: " + e.message);
        if (fromWebView)
          sendToWebView("uploadError", {
            error: "download_failed",
            errorDetail: e.message,
          });
        else stat("Download failed: " + e.message, "error");
        return;
      }

      if (img.length < 1000 || img[0] !== 0xff || img[1] !== 0xd8) {
        onPhase("failed", "Invalid image (" + img.length + " bytes)");
        if (fromWebView)
          sendToWebView("uploadError", {
            error: "invalid_image",
            errorDetail: img.length + " bytes, not JPEG",
          });
        else stat("Invalid image", "error");
        return;
      }

      // --- Upload to TV (state machine handles phases from here) ---
      const res = await nativeUploadToTv(tvIp, img, onPhase);

      // Circuit breaker: trip on crash-class errors, reset on success
      if (res.success) {
        resetBreaker(tvIp);
        const msg =
          "Art displayed on TV! (" + (res.durationMs / 1000).toFixed(1) + "s)";
        stat(msg, "success");
        if (fromWebView)
          sendToWebView("uploadComplete", {
            contentId: res.contentId,
            durationMs: res.durationMs,
            requestId: res.requestId,
          });
      } else {
        // Circuit breaker: trip on crash-class errors OR any half-open probe failure
        const isCrashError = res.error && CRASH_ERRORS.has(res.error);
        if (isCrashError || isProbe) {
          tripBreaker(tvIp, res.error || "ws_failed");
          log(
            "BREAKER: tripped for " +
              tvIp +
              " (" +
              res.error +
              (isProbe ? ", probe failed" : "") +
              "), cooldown " +
              COOLDOWN_MS / 1000 +
              "s",
          );
          res.retryAllowed = false;
          res.retryAfterMs = COOLDOWN_MS;
        }
        stat("Failed: " + (res.errorDetail || res.error), "error");
        if (fromWebView)
          sendToWebView("uploadError", {
            error: res.error,
            errorDetail: res.errorDetail,
            phase: res.phase,
            requestId: res.requestId,
            retryAllowed: res.retryAllowed,
            retryAfterMs: res.retryAfterMs,
          });
      }
    } finally {
      setUploading(false);
      releaseLock();
      uploadTelemetry(logsRef.current, tvIp, "upload");
    }
  }

  function onWebViewMessage(event: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      log("Bridge: " + msg.type);
      if (msg.type === "publish" && msg.imageUrl) {
        pushScene(
          {
            sceneId: msg.sceneId || "studio",
            prompt: "",
            imageUrl: msg.imageUrl,
            durationMs: 0,
            provider: "",
          },
          true,
        );
      }
      if (msg.type === "navigate") {
        if (msg.to === "gallery") {
          setScreen("gallery");
          loadScenes();
        }
        if (msg.to === "connect") {
          setScreen("connect");
        }
      }
      if (msg.type === "log") log("Studio: " + msg.message);
      if (msg.type === "uploadTelemetry")
        uploadTelemetry(msg.logs || [], tvIp, "studio");
    } catch {}
  }

  const bridgeScript = `
    window.FrameArtBridge = {
      publish: function(sceneId, imageUrl) { window.ReactNativeWebView.postMessage(JSON.stringify({type:"publish",sceneId:sceneId,imageUrl:imageUrl})); },
      navigate: function(to) { window.ReactNativeWebView.postMessage(JSON.stringify({type:"navigate",to:to})); },
      log: function(msg) { window.ReactNativeWebView.postMessage(JSON.stringify({type:"log",message:msg})); },
      uploadTelemetry: function(logs) { window.ReactNativeWebView.postMessage(JSON.stringify({type:"uploadTelemetry",logs:logs})); },
      isApp: true, tvIp: "${tvIp}", tvConnected: ${tvInfo ? "true" : "false"},
    };
    window.__FRAME_ART_APP__ = true;
    true;
  `;

  function DebugPanel({ title }: { title: string }) {
    if (!DEBUG || logs.length === 0) return null;
    return (
      <View style={s.debugWrap}>
        <View style={s.debugSep} />
        <Text style={s.debugLabel}>DEBUG — {title}</Text>
        <ScrollView style={s.debugScroll} nestedScrollEnabled>
          {logs.map((l, i) => (
            <Text key={i} style={s.debugLine}>
              {l}
            </Text>
          ))}
        </ScrollView>
        <TouchableOpacity
          style={s.telemetryBtn}
          onPress={() => {
            uploadTelemetry(logsRef.current, tvIp, screen);
            log("Telemetry uploaded");
          }}
        >
          <Text style={s.telemetryTxt}>Upload Logs</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function StatusBar2() {
    if (!status) return null;
    return (
      <View
        style={[
          s.statBar,
          statusType === "error" && s.statErr,
          statusType === "success" && s.statOk,
        ]}
      >
        <Text style={s.statTxt}>{status}</Text>
      </View>
    );
  }

  // ============================================================
  // CONNECT
  // ============================================================
  if (screen === "connect") {
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a14" />
        <ScrollView contentContainerStyle={s.connectContent}>
          <Text style={s.appTitle}>Frame Art</Text>
          <Text style={s.appSub}>AI Art for your Samsung Frame TV</Text>
          {foundTvs.length > 0 && (
            <View>
              <Text style={s.secLabel}>
                Found on your network{scanning ? " (still scanning...)" : ""}:
              </Text>
              {foundTvs.map((tv, i) => (
                <TouchableOpacity
                  key={i}
                  style={[s.tvCard, tvInfo?.ip === tv.ip && s.tvCardActive]}
                  onPress={() => connectTv(tv.ip)}
                >
                  <Text style={s.tvName}>
                    {tvInfo?.ip === tv.ip ? "✓ " : "● "}
                    {tv.name}
                  </Text>
                  <Text style={s.tvMeta}>
                    {tv.model} ({tv.year || "?"}) — {tv.ip}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {scanning && (
            <View style={s.scanBox}>
              <ActivityIndicator size="small" color="#0ff" />
              <View style={{ flex: 1 }}>
                <Text style={s.scanTxt}>Scanning... {scanPct}%</Text>
                {scanStage ? (
                  <Text style={s.scanDetail}>{scanStage}</Text>
                ) : null}
              </View>
            </View>
          )}
          {!scanning && foundTvs.length === 0 && (
            <View style={s.noTvBox}>
              <Text style={s.noTvTxt}>No Frame TVs found</Text>
              <TouchableOpacity style={s.scanAgain} onPress={scanNetwork}>
                <Text style={s.scanAgainTxt}>Scan Again</Text>
              </TouchableOpacity>
            </View>
          )}
          {!scanning && foundTvs.length > 0 && !tvInfo && (
            <TouchableOpacity style={s.scanAgain} onPress={scanNetwork}>
              <Text style={s.scanAgainTxt}>Scan Again</Text>
            </TouchableOpacity>
          )}
          <Text style={s.secLabel}>Or enter TV IP manually:</Text>
          <TextInput
            style={s.input}
            value={tvIp}
            onChangeText={setTvIp}
            placeholder="192.168.1.100"
            placeholderTextColor="#555"
            keyboardType="decimal-pad"
          />
          <TouchableOpacity
            style={[s.primaryBtn, !tvIp && s.btnDis]}
            onPress={() => connectTv(tvIp)}
            disabled={!tvIp}
          >
            <Text style={s.primaryTxt}>Connect</Text>
          </TouchableOpacity>
          {tvInfo && (
            <View style={s.connectedBox}>
              <Text style={s.connectedName}>{tvInfo.name}</Text>
              <Text style={s.connectedMeta}>
                {tvInfo.model} | {tvInfo.resolution} | {tvHealth}
              </Text>
              <TouchableOpacity
                style={s.goCta}
                onPress={() => {
                  setScreen("gallery");
                  loadScenes();
                }}
              >
                <Text style={s.goCtaTxt}>Go to Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.goSecondary}
                onPress={() => setScreen("studio")}
              >
                <Text style={s.goSecondaryTxt}>Open Studio</Text>
              </TouchableOpacity>
            </View>
          )}
          <StatusBar2 />
          <DebugPanel title="Connect" />
        </ScrollView>
      </View>
    );
  }

  // ============================================================
  // GALLERY
  // ============================================================
  if (screen === "gallery") {
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a14" />
        <View style={s.header}>
          <TouchableOpacity style={s.hBtn} onPress={() => setScreen("connect")}>
            <Text style={s.hBack}>Connect</Text>
          </TouchableOpacity>
          <Text style={s.hTitle}>Gallery</Text>
          <TouchableOpacity style={s.hBtn} onPress={() => setScreen("studio")}>
            <Text style={s.hAction}>Studio</Text>
          </TouchableOpacity>
        </View>
        <StatusBar2 />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.galleryContent}
        >
          {scenes.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyTitle}>No art yet</Text>
              <Text style={s.emptyBody}>
                Generate art in the Studio, then push it here.
              </Text>
              <TouchableOpacity
                style={s.secondaryBtn}
                onPress={() => setScreen("studio")}
              >
                <Text style={s.secondaryTxt}>Open Studio</Text>
              </TouchableOpacity>
            </View>
          ) : (
            scenes.map((sc) => (
              <View key={sc.sceneId} style={s.sceneCard}>
                <Image
                  source={{ uri: CLOUD + sc.imageUrl }}
                  style={s.sceneImg}
                  resizeMode="cover"
                />
                <View style={s.sceneBottom}>
                  <Text style={s.scenePrompt} numberOfLines={2}>
                    {sc.prompt?.substring(0, 80) || "Generated art"}
                  </Text>
                  <TouchableOpacity
                    style={[s.pushBtn, uploading && s.btnDis]}
                    onPress={() => pushScene(sc)}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={s.pushTxt}>Push to TV</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
          <TouchableOpacity style={s.refreshBtn} onPress={loadScenes}>
            <Text style={s.refreshTxt}>Refresh</Text>
          </TouchableOpacity>
          <DebugPanel title="Gallery" />
        </ScrollView>
      </View>
    );
  }

  // ============================================================
  // STUDIO (WebView)
  // ============================================================
  if (screen === "studio") {
    const studioUrl = `${CLOUD}/studio?app=true&tvIp=${encodeURIComponent(tvIp)}&debug=1`;
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a14" />
        <View style={s.header}>
          <TouchableOpacity
            style={s.hBtn}
            onPress={() => {
              setScreen("gallery");
              loadScenes();
            }}
          >
            <Text style={s.hBack}>Gallery</Text>
          </TouchableOpacity>
          <Text style={s.hTitle}>Studio</Text>
          <TouchableOpacity style={s.hBtn} onPress={() => setScreen("connect")}>
            <Text style={s.hAction}>Connect</Text>
          </TouchableOpacity>
        </View>
        <WebView
          ref={webRef}
          source={{ uri: studioUrl }}
          style={{ flex: 1, backgroundColor: "#0f0f1a" }}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          originWhitelist={["*"]}
          injectedJavaScript={bridgeScript}
          onMessage={onWebViewMessage}
          startInLoadingState
          renderLoading={() => (
            <View
              style={{
                flex: 1,
                backgroundColor: "#0f0f1a",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <ActivityIndicator size="large" color="#0ff" />
            </View>
          )}
        />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <Text style={{ color: "#fff", padding: 40 }}>Unknown screen</Text>
    </View>
  );
}

// ============================================================
// Styles
// ============================================================
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a0a14" },
  connectContent: { padding: 20, paddingTop: 50 },
  appTitle: {
    fontSize: 30,
    fontWeight: "bold",
    color: "#0ff",
    textAlign: "center",
    marginBottom: 6,
  },
  appSub: {
    fontSize: 13,
    color: "#888",
    textAlign: "center",
    marginBottom: 24,
  },
  secLabel: { fontSize: 12, color: "#aaa", marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: "#161626",
    borderWidth: 1,
    borderColor: "#2a2a3e",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#fff",
    marginBottom: 10,
  },
  primaryBtn: {
    backgroundColor: "#0ff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 4,
  },
  primaryTxt: { fontSize: 17, fontWeight: "700", color: "#000" },
  btnDis: { opacity: 0.4 },
  scanBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    backgroundColor: "#161626",
    borderRadius: 12,
    marginTop: 8,
  },
  scanTxt: { color: "#ccc", fontSize: 14 },
  scanDetail: { color: "#999", fontSize: 11, marginTop: 2 },
  scanAgain: { alignItems: "center", padding: 12, marginTop: 8 },
  scanAgainTxt: { color: "#0ff", fontSize: 14 },
  noTvBox: { alignItems: "center", padding: 20, marginTop: 8 },
  noTvTxt: { color: "#666", fontSize: 14, marginBottom: 8 },
  tvCard: {
    backgroundColor: "#0d1f2d",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#1a3040",
  },
  tvCardActive: { borderColor: "#0ff", backgroundColor: "#0d2d1d" },
  tvName: { color: "#4f4", fontSize: 15, fontWeight: "600" },
  tvMeta: { color: "#888", fontSize: 11, marginTop: 3 },
  connectedBox: {
    backgroundColor: "#0d2d0d",
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
  },
  connectedName: { color: "#4f4", fontSize: 18, fontWeight: "700" },
  connectedMeta: {
    color: "#8a8",
    fontSize: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  goCta: {
    backgroundColor: "#0ff",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  goCtaTxt: { fontSize: 16, fontWeight: "700", color: "#000" },
  goSecondary: { alignItems: "center", padding: 10, marginTop: 6 },
  goSecondaryTxt: { color: "#0af", fontSize: 14 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    paddingTop: 46,
    backgroundColor: "#0a0a14",
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a2e",
  },
  hBtn: { padding: 8, minWidth: 70 },
  hBack: { color: "#0ff", fontSize: 14, fontWeight: "600" },
  hTitle: { color: "#fff", fontSize: 16, fontWeight: "600" },
  hAction: {
    color: "#0af",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
  },
  statBar: {
    backgroundColor: "#0d1f2d",
    padding: 10,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 10,
  },
  statErr: { backgroundColor: "#2d0d0d" },
  statOk: { backgroundColor: "#0d2d0d" },
  statTxt: { color: "#ccc", fontSize: 13, textAlign: "center" },
  galleryContent: { padding: 12, paddingBottom: 40 },
  sceneCard: {
    backgroundColor: "#161626",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 14,
  },
  sceneImg: { width: "100%" as any, aspectRatio: 16 / 9 },
  sceneBottom: { padding: 12 },
  scenePrompt: { color: "#999", fontSize: 12, lineHeight: 18, marginBottom: 8 },
  pushBtn: {
    backgroundColor: "#0a5",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 18,
    alignSelf: "flex-end",
  },
  pushTxt: { color: "#fff", fontSize: 14, fontWeight: "600" },
  emptyBox: { alignItems: "center", padding: 40 },
  emptyTitle: {
    color: "#888",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptyBody: {
    color: "#556",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
  },
  secondaryBtn: {
    backgroundColor: "#1a1a2e",
    borderRadius: 10,
    padding: 12,
    paddingHorizontal: 20,
  },
  secondaryTxt: { color: "#0af", fontSize: 14 },
  refreshBtn: { alignItems: "center", padding: 14, marginTop: 8 },
  refreshTxt: { color: "#556", fontSize: 14 },
  debugWrap: { marginTop: 20 },
  debugSep: { height: 1, backgroundColor: "#2a2a3e", marginBottom: 8 },
  debugLabel: {
    color: "#0ff",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 6,
    letterSpacing: 1,
  },
  debugScroll: {
    maxHeight: 250,
    backgroundColor: "#08080e",
    borderRadius: 8,
    padding: 8,
  },
  debugLine: {
    color: "#8cf",
    fontSize: 10,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 16,
  },
  telemetryBtn: { alignItems: "center", padding: 8, marginTop: 6 },
  telemetryTxt: { color: "#556", fontSize: 11 },
});
