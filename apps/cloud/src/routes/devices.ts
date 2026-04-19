/** Device registry routes — scan, list, and manage TV devices */
import { Router } from "express";
import { optionalAuth } from "../auth.js";
import { getRawDb } from "../db.js";
import { isValidTvIp } from "../middleware.js";
import { logger } from "../logger.js";

const router = Router();

router.get("/api/devices", optionalAuth, (_req, res) => {
  const db = getRawDb();
  const devices = db
    .prepare("SELECT * FROM tv_devices ORDER BY last_seen_at DESC")
    .all();
  res.json(devices);
});

router.get("/api/devices/:tvId", (req, res) => {
  const db = getRawDb();
  const device = db
    .prepare("SELECT * FROM tv_devices WHERE id = ?")
    .get(req.params.tvId);
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.json(device);
});

/** Fetch and store full device metadata from TV */
router.post("/api/devices/scan", async (req, res) => {
  const { tvIp } = req.body;
  if (!tvIp) {
    res.status(400).json({ error: "Missing tvIp" });
    return;
  }
  if (!isValidTvIp(tvIp)) {
    res
      .status(400)
      .json({ error: "Invalid TV IP — must be a private network address" });
    return;
  }

  try {
    const apiRes = await fetch(`http://${tvIp}:8001/api/v2/`, {
      signal: AbortSignal.timeout(5000),
    });
    const apiData = (await apiRes.json()) as any;
    const device = apiData.device || {};

    const metadata: Record<string, unknown> = {
      tvIp,
      scannedAt: new Date().toISOString(),
      modelName: device.modelName,
      modelCode: device.model,
      name: device.name,
      isFrameTV: device.FrameTVSupport === "true",
      powerState: device.PowerState,
      firmwareVersion: device.firmwareVersion,
      resolution: device.resolution,
      networkType: device.networkType,
      wifiMac: device.wifiMac,
      duid: device.duid || device.id,
      developerMode: device.developerMode,
      countryCode: device.countryCode,
      language: device.Language,
      yearPrefix: device.model?.substring(0, 2),
      estimatedYear: device.model
        ? 2000 + parseInt(device.model.substring(0, 2))
        : null,
    };

    const tvId = `frame-${device.wifiMac?.replace(/:/g, "").slice(-6) || tvIp}`;
    metadata.tvId = tvId;
    const now = new Date().toISOString();

    const db = getRawDb();
    db.prepare(
      `INSERT INTO tv_devices (id, tv_ip, model_name, model_code, name, resolution, is_frame_tv, firmware_version, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         tv_ip = excluded.tv_ip,
         model_name = excluded.model_name,
         firmware_version = excluded.firmware_version,
         last_seen_at = excluded.last_seen_at`,
    ).run(
      tvId,
      tvIp,
      device.modelName,
      device.model,
      device.name,
      device.resolution,
      device.FrameTVSupport === "true" ? 1 : 0,
      device.firmwareVersion,
      now,
    );

    logger.info(
      {
        modelName: metadata.modelName,
        estimatedYear: metadata.estimatedYear,
        tvIp,
      },
      "Device scanned",
    );
    res.json(metadata);
  } catch (err: unknown) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Scan failed" });
  }
});

export default router;
