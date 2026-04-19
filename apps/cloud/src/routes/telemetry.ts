/** Telemetry routes — device debug logs from Tizen/mobile apps */
import { Router } from "express";
import path from "path";
import { getRawDb } from "../db.js";
import { telemetryLimiter } from "../middleware.js";

const TELEMETRY_MAX_ENTRIES = 2000;

export function createTelemetryRouter(staticDir: string) {
  const router = Router();

  router.post("/api/telemetry", telemetryLimiter, (req, res) => {
    const { deviceId, sessionId, tvIp, screen, timestamp, logs } = req.body;
    const receivedAt = new Date().toISOString();
    const trimmedLogs = (logs || []).slice(-200);

    const db = getRawDb();
    const result = db
      .prepare(
        `INSERT INTO telemetry_entries (device_id, session_id, tv_ip, screen, timestamp, logs, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        deviceId || "unknown",
        sessionId || "unknown",
        tvIp || "",
        screen || "",
        timestamp || receivedAt,
        JSON.stringify(trimmedLogs),
        receivedAt,
      );

    // Cap total entries to prevent unbounded growth
    db.prepare(
      `DELETE FROM telemetry_entries WHERE id NOT IN (
         SELECT id FROM telemetry_entries ORDER BY received_at DESC LIMIT ?
       )`,
    ).run(TELEMETRY_MAX_ENTRIES);

    console.log(
      `Telemetry: ${deviceId || "unknown"}/${sessionId || "unknown"} (${screen || ""}) — ${trimmedLogs.length} log lines`,
    );
    res.json({ ok: true, id: result.lastInsertRowid });
  });

  router.get("/api/telemetry", (_req, res) => {
    const db = getRawDb();
    const rows = db
      .prepare(
        `SELECT device_id, session_id,
                COUNT(*) as entries,
                MAX(received_at) as last_seen,
                GROUP_CONCAT(DISTINCT screen) as screens
         FROM telemetry_entries
         GROUP BY device_id, session_id
         ORDER BY last_seen DESC`,
      )
      .all() as Array<{
      device_id: string;
      session_id: string;
      entries: number;
      last_seen: string;
      screens: string;
    }>;

    res.json(
      rows.map((r) => ({
        deviceId: r.device_id,
        sessionId: r.session_id,
        entries: r.entries,
        lastSeen: r.last_seen,
        screens: r.screens ? r.screens.split(",") : [],
      })),
    );
  });

  router.get("/api/telemetry/:deviceId/:sessionId", (req, res) => {
    const { deviceId, sessionId } = req.params;
    const db = getRawDb();
    const entries = db
      .prepare(
        `SELECT * FROM telemetry_entries
         WHERE device_id = ? AND session_id = ?
         ORDER BY received_at ASC`,
      )
      .all(deviceId, sessionId);
    res.json(entries);
  });

  router.get("/telemetry", (_req, res) => {
    res.sendFile(path.join(staticDir, "telemetry.html"));
  });

  return router;
}
