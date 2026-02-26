import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, matches } from "@clawdiators/db";
import { QUICKDRAW_DIMENSIONS } from "@clawdiators/shared";
import type { ApiCallLogEntry } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateQuickdrawData } from "./data.js";
import { scoreQuickdraw } from "./scorer.js";
import { errorEnvelope } from "../../middleware/envelope.js";

export { generateQuickdrawData } from "./data.js";
export type {
  QuickdrawData,
  QuickdrawGroundTruth,
  WeatherEntry,
  StockEntry,
  NewsArticle,
} from "./data.js";
export { scoreQuickdraw } from "./scorer.js";

// ── Sandbox helpers ──────────────────────────────────────────────────

async function getMatchAndData(matchId: string) {
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
  });
  if (!match) return null;
  if (match.status !== "active") return null;
  if (new Date() > match.expiresAt) return null;

  const data = generateQuickdrawData(match.seed);
  return { match, data };
}

async function logApiCall(
  matchId: string,
  currentLog: ApiCallLogEntry[],
  method: string,
  path: string,
  status: number,
  startTime: number,
) {
  const entry: ApiCallLogEntry = {
    ts: new Date().toISOString(),
    method,
    path,
    status,
    durationMs: Date.now() - startTime,
  };
  await db
    .update(matches)
    .set({ apiCallLog: [...currentLog, entry] })
    .where(eq(matches.id, matchId));
}

// ── ChallengeModule implementation ───────────────────────────────────

export const quickdrawModule: ChallengeModule = {
  slug: "quickdraw",
  dimensions: QUICKDRAW_DIMENSIONS,

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateQuickdrawData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
      weather: data.weather,
      stocks: data.stocks,
      news: data.news,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreQuickdraw(input);
  },

  sandboxApiNames(): string[] {
    return ["weather", "stocks", "news"];
  },

  sandboxRoutes(): Hono {
    const sandbox = new Hono();

    // GET /:matchId/weather
    sandbox.get("/:matchId/weather", async (c) => {
      const startTime = Date.now();
      const matchId = c.req.param("matchId");
      const result = await getMatchAndData(matchId);

      if (!result) {
        return errorEnvelope(c, "Match not found or expired", 404, "The sands have swallowed this arena.");
      }

      const city = c.req.query("city");
      await logApiCall(matchId, result.match.apiCallLog, "GET",
        `/sandbox/${matchId}/weather${city ? `?city=${city}` : ""}`, 200, startTime);

      if (city) {
        const entry = result.data.weather.find(
          (w) => w.city.toLowerCase() === city.toLowerCase(),
        );
        if (!entry) {
          return c.json({ error: "City not found", available_cities: result.data.weather.map((w) => w.city) }, 404);
        }
        return c.json(entry);
      }
      return c.json({ cities: result.data.weather });
    });

    // GET /:matchId/stocks
    sandbox.get("/:matchId/stocks", async (c) => {
      const startTime = Date.now();
      const matchId = c.req.param("matchId");
      const result = await getMatchAndData(matchId);

      if (!result) {
        return errorEnvelope(c, "Match not found or expired", 404, "The sands have swallowed this arena.");
      }

      const ticker = c.req.query("ticker");
      const date = c.req.query("date");
      await logApiCall(matchId, result.match.apiCallLog, "GET",
        `/sandbox/${matchId}/stocks${ticker ? `?ticker=${ticker}` : ""}${date ? `${ticker ? "&" : "?"}date=${date}` : ""}`,
        200, startTime);

      if (ticker) {
        const stock = result.data.stocks.find(
          (s) => s.ticker.toLowerCase() === ticker.toLowerCase(),
        );
        if (!stock) {
          return c.json({ error: "Ticker not found", available_tickers: result.data.stocks.map((s) => s.ticker) }, 404);
        }
        if (date) {
          const day = stock.history.find((d) => d.date === date);
          if (!day) {
            return c.json({
              error: "Date not in range", ticker: stock.ticker,
              date_range: { from: stock.history[0].date, to: stock.history[stock.history.length - 1].date },
            }, 404);
          }
          return c.json({ ticker: stock.ticker, company: stock.company, ...day });
        }
        return c.json(stock);
      }

      return c.json({
        stocks: result.data.stocks.map((s) => ({
          ticker: s.ticker, company: s.company,
          latest_close: s.history[s.history.length - 1].close,
          date_range: { from: s.history[0].date, to: s.history[s.history.length - 1].date },
        })),
      });
    });

    // GET /:matchId/news
    sandbox.get("/:matchId/news", async (c) => {
      const startTime = Date.now();
      const matchId = c.req.param("matchId");
      const result = await getMatchAndData(matchId);

      if (!result) {
        return errorEnvelope(c, "Match not found or expired", 404, "The sands have swallowed this arena.");
      }

      const topic = c.req.query("topic");
      const search = c.req.query("search");
      await logApiCall(matchId, result.match.apiCallLog, "GET",
        `/sandbox/${matchId}/news${topic ? `?topic=${topic}` : ""}${search ? `${topic ? "&" : "?"}search=${search}` : ""}`,
        200, startTime);

      let articles = result.data.news;
      if (topic) {
        articles = articles.filter((a) => a.topic.toLowerCase() === topic.toLowerCase());
      }
      if (search) {
        const s = search.toLowerCase();
        articles = articles.filter((a) =>
          a.headline.toLowerCase().includes(s) ||
          a.summary.toLowerCase().includes(s) ||
          a.mentions.some((m) => m.toLowerCase().includes(s)),
        );
      }
      return c.json({ articles, total: articles.length });
    });

    return sandbox;
  },
};
