/** Pairing routes — TV pairing by IP and by code */
import { Router } from "express";
import { optionalAuth } from "../auth.js";
import { getRawDb } from "../db.js";
import { claimCode, validateCode } from "../pairing.js";
import { sendToTv } from "../tv-connections.js";
import { isValidTvIp } from "../middleware.js";
import { logger } from "../logger.js";

const router = Router();

/** Pair by TV IP — scans the TV, registers it, returns device info */
router.post("/api/pair-by-ip", optionalAuth, async (req, res) => {
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

    if (device.FrameTVSupport !== "true") {
      res.status(400).json({ error: "Not a Samsung Frame TV" });
      return;
    }

    const tvId = `frame-${(device.wifiMac || "").replace(/:/g, "").slice(-6) || tvIp.replace(/\./g, "")}`;

    const metadata = {
      tvIp,
      tvId,
      scannedAt: new Date().toISOString(),
      modelName: device.modelName,
      modelCode: device.model,
      name: device.name,
      isFrameTV: true,
      resolution: device.resolution,
      wifiMac: device.wifiMac,
      estimatedYear: device.model
        ? 2000 + parseInt(device.model.substring(0, 2))
        : null,
    };

    const db = getRawDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tv_devices (id, tv_ip, model_name, model_code, name, resolution, is_frame_tv, paired_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         tv_ip = excluded.tv_ip,
         paired_at = excluded.paired_at,
         last_seen_at = excluded.last_seen_at`,
    ).run(
      tvId,
      tvIp,
      device.modelName,
      device.model,
      device.name,
      device.resolution,
      now,
      now,
    );

    const userId = (req as any).user?.userId;
    logger.info(
      { deviceName: device.name, tvId, tvIp, userId: userId || "anonymous" },
      "Paired by IP",
    );

    res.json({ success: true, tvId, tvIp, device: metadata });
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Could not reach TV",
    });
  }
});

router.post("/api/pair", (req, res) => {
  const { code, phoneSessionId } = req.body;
  if (!code || !phoneSessionId) {
    res.status(400).json({ error: "Missing code or phoneSessionId" });
    return;
  }

  const session = claimCode(code, phoneSessionId);
  if (!session) {
    res.status(404).json({ error: "Invalid or expired code" });
    return;
  }

  logger.info(
    { tvId: session.tvId, tvIp: session.tvIp, phoneSessionId },
    "Paired via code",
  );

  sendToTv(session.tvId, {
    type: "paired",
    phoneSessionId,
    message: "Your TV is now linked!",
  });

  res.json({
    success: true,
    tvId: session.tvId,
    tvIp: session.tvIp,
  });
});

router.get("/api/pair/status/:code", (req, res) => {
  const session = validateCode(req.params.code);
  if (!session) {
    res.status(404).json({ error: "Invalid or expired code" });
    return;
  }
  res.json({
    code: session.code,
    paired: !!session.pairedAt,
    tvId: session.tvId,
  });
});

export default router;
