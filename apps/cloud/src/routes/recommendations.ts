/** Recommendation routes — taste-ranked library suggestions */
import { Router } from "express";
import { requireAuth } from "../auth.js";
import { getLibraryRecommendations } from "../recommendations.js";

const router = Router();

/** GET /api/recommendations/library?limit=24&includeRated=false */
router.get("/api/recommendations/library", requireAuth, (req, res) => {
  const userId = (req as any).user.userId as string;
  const limitParam = parseInt(req.query.limit as string, 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 24;
  const includeRated = req.query.includeRated === "true";

  const result = getLibraryRecommendations(userId, { limit, includeRated });
  res.json(result);
});

export default router;
