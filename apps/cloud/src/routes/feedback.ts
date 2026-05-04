/** Feedback routes — legacy rating endpoint (prefer /api/ratings for new code) */
import { Router } from "express";
import { requireAuth } from "../auth.js";
import { getRawDb } from "../db.js";
import { getOwnedTv } from "../tv-ownership.js";
import { logger } from "../logger.js";

const router = Router();

router.post("/api/feedback", requireAuth, (req, res) => {
  const { tvId, contentId, rating } = req.body;
  if (!tvId || !contentId || !rating) {
    res.status(400).json({ error: "Missing tvId, contentId, or rating" });
    return;
  }
  if (
    rating !== "up" &&
    rating !== "down" &&
    rating !== "thumbs_up" &&
    rating !== "thumbs_down"
  ) {
    res.status(400).json({ error: "Invalid rating value" });
    return;
  }

  const userId = (req as any).user.userId as string;

  // Verify TV ownership
  const tv = getOwnedTv(userId, { tvId });
  if (!tv) {
    res.status(403).json({ error: "TV is not paired to this user" });
    return;
  }

  const db = getRawDb();
  db.prepare(
    "INSERT INTO feedback (tv_id, content_id, rating, user_id, timestamp) VALUES (?, ?, ?, ?, ?)",
  ).run(tvId, contentId, rating, userId, new Date().toISOString());

  const count = db.prepare("SELECT COUNT(*) as cnt FROM feedback").get() as {
    cnt: number;
  };
  logger.info(
    { rating, contentId, tvId, userId },
    "Feedback received (legacy)",
  );
  res.json({ success: true, totalFeedback: count.cnt });
});

router.get("/api/feedback/:tvId", requireAuth, (req, res) => {
  const userId = (req as any).user.userId as string;
  const tvId = req.params.tvId as string;

  // Verify TV ownership — only return feedback for TVs the user owns
  const tv = getOwnedTv(userId, { tvId });
  if (!tv) {
    res.status(403).json({ error: "TV is not paired to this user" });
    return;
  }

  const db = getRawDb();
  const rows = db
    .prepare(
      "SELECT * FROM feedback WHERE tv_id = ? AND user_id = ? ORDER BY timestamp DESC",
    )
    .all(tvId, userId);
  res.json(rows);
});

export default router;
