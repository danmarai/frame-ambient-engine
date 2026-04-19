/** Feedback routes — user ratings on generated art */
import { Router } from "express";
import { optionalAuth } from "../auth.js";
import { getRawDb } from "../db.js";

const router = Router();

router.post("/api/feedback", optionalAuth, (req, res) => {
  const { tvId, contentId, rating } = req.body;
  if (!tvId || !contentId || !rating) {
    res.status(400).json({ error: "Missing tvId, contentId, or rating" });
    return;
  }
  const userId = (req as any).user?.userId;
  const db = getRawDb();
  db.prepare(
    "INSERT INTO feedback (tv_id, content_id, rating, user_id, timestamp) VALUES (?, ?, ?, ?, ?)",
  ).run(tvId, contentId, rating, userId || null, new Date().toISOString());

  const count = db.prepare("SELECT COUNT(*) as cnt FROM feedback").get() as {
    cnt: number;
  };
  console.log(
    `Feedback: ${rating} on ${contentId} for TV ${tvId} by ${userId || "anonymous"}`,
  );
  res.json({ success: true, totalFeedback: count.cnt });
});

router.get("/api/feedback/:tvId", (req, res) => {
  const db = getRawDb();
  const rows = db
    .prepare("SELECT * FROM feedback WHERE tv_id = ? ORDER BY timestamp DESC")
    .all(req.params.tvId);
  res.json(rows);
});

export default router;
