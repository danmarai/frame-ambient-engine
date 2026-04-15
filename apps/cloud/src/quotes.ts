/**
 * Quote service — picks quotes by category, tracks usage to avoid repeats.
 * Quotes age out of "used" state after TTL expires.
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Quote {
  text: string;
  author: string;
  category: string;
}

interface UsedEntry {
  text: string;
  usedAt: number;
}

// Load quotes from JSON
const quotesData = JSON.parse(
  readFileSync(path.join(__dirname, "data", "quotes.json"), "utf-8"),
);

const allQuotes: Quote[] = quotesData.quotes;
const categories: Array<{ id: string; label: string }> = quotesData.categories;

// Track used quotes per category — TTL 7 days
const USED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const usedQuotes = new Map<string, UsedEntry[]>();

/** Get available categories */
export function getQuoteCategories() {
  return categories;
}

/** Pick a quote from the given category, avoiding recently used ones */
export function pickQuote(category: string = "random"): Quote {
  // Get candidate quotes
  let candidates: Quote[];
  if (category === "random") {
    candidates = allQuotes;
  } else {
    candidates = allQuotes.filter((q) => q.category === category);
    if (candidates.length === 0) candidates = allQuotes; // fallback
  }

  // Clean expired used entries
  const now = Date.now();
  const usedKey = category;
  const used = usedQuotes.get(usedKey) || [];
  const activeUsed = used.filter((u) => now - u.usedAt < USED_TTL_MS);
  usedQuotes.set(usedKey, activeUsed);

  const usedTexts = new Set(activeUsed.map((u) => u.text));

  // Find unused quotes
  let available = candidates.filter((q) => !usedTexts.has(q.text));

  // If all used, reset and pick from full list
  if (available.length === 0) {
    usedQuotes.set(usedKey, []);
    available = candidates;
  }

  // Random pick
  const picked = available[Math.floor(Math.random() * available.length)]!;

  // Mark as used
  activeUsed.push({ text: picked.text, usedAt: now });
  usedQuotes.set(usedKey, activeUsed);

  return picked;
}

/** Get usage stats */
export function getQuoteStats() {
  const stats: Record<
    string,
    { total: number; used: number; available: number }
  > = {};
  const now = Date.now();

  for (const cat of categories) {
    if (cat.id === "random") continue;
    const catQuotes = allQuotes.filter((q) => q.category === cat.id);
    const used = (usedQuotes.get(cat.id) || []).filter(
      (u) => now - u.usedAt < USED_TTL_MS,
    );
    stats[cat.id] = {
      total: catQuotes.length,
      used: used.length,
      available: catQuotes.length - used.length,
    };
  }

  return { categories: stats, totalQuotes: allQuotes.length, ttlDays: 7 };
}
