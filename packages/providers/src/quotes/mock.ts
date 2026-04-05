import type { QuoteProvider, Quote, ProviderHealth } from "@frame/core";

const CURATED_QUOTES: Quote[] = [
  {
    text: "Be the change you wish to see in the world.",
    author: "Mahatma Gandhi",
    source: "curated",
  },
  {
    text: "Every day is a new beginning.",
    author: "Unknown",
    source: "curated",
  },
  {
    text: "Believe you can and you're halfway there.",
    author: "Theodore Roosevelt",
    source: "curated",
  },
  {
    text: "The best time to plant a tree was 20 years ago. The second best time is now.",
    author: "Chinese Proverb",
    source: "curated",
  },
  {
    text: "Kindness is a language the deaf can hear and the blind can see.",
    author: "Mark Twain",
    source: "curated",
  },
  {
    text: "In the middle of difficulty lies opportunity.",
    author: "Albert Einstein",
    source: "curated",
  },
  {
    text: "Stars can't shine without darkness.",
    author: "Unknown",
    source: "curated",
  },
  {
    text: "You are braver than you believe, stronger than you seem, and smarter than you think.",
    author: "A.A. Milne",
    source: "curated",
  },
  {
    text: "Do small things with great love.",
    author: "Mother Teresa",
    source: "curated",
  },
  {
    text: "The only way to do great work is to love what you do.",
    author: "Steve Jobs",
    source: "curated",
  },
];

export class MockQuoteProvider implements QuoteProvider {
  name = "curated";

  async getQuote(): Promise<Quote> {
    await new Promise((r) => setTimeout(r, 50));
    return CURATED_QUOTES[Math.floor(Math.random() * CURATED_QUOTES.length)]!;
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: this.name,
      status: "healthy",
      lastChecked: new Date().toISOString(),
      latencyMs: 1,
      message: "Curated quotes always available",
    };
  }
}
