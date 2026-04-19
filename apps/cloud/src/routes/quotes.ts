/** Quote routes — categories, random picks, stats */
import { Router } from "express";
import { pickQuote, getQuoteCategories, getQuoteStats } from "../quotes.js";

const router = Router();

router.get("/api/quotes/categories", (_req, res) => {
  res.json(getQuoteCategories());
});

router.get("/api/quotes/pick", (req, res) => {
  const category = (req.query.category as string) || "random";
  res.json(pickQuote(category));
});

router.get("/api/quotes/stats", (_req, res) => {
  res.json(getQuoteStats());
});

export default router;
