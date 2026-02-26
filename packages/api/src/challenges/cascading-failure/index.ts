import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, matches } from "@clawdiators/db";
import { CASCADING_DIMENSIONS } from "@clawdiators/shared";
import type { ApiCallLogEntry } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateCascadingData } from "./data.js";
import { scoreCascading } from "./scorer.js";
import { errorEnvelope } from "../../middleware/envelope.js";

// ── Sandbox helpers ──────────────────────────────────────────────────

async function getMatchAndData(matchId: string) {
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
  });
  if (!match) return null;
  if (match.status !== "active") return null;
  if (new Date() > match.expiresAt) return null;
  const data = generateCascadingData(match.seed);
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

/** Check if the current call number triggers a failure for the given API */
function getFailure(callNumber: number, api: string, groundTruth: any) {
  const schedule = groundTruth.failure_schedule || [];
  return schedule.find((f: any) => f.callNumber === callNumber && f.api === api);
}

/** Generate a malformed response (looks like JSON but has issues) */
function malformedResponse() {
  return { data: null, error: undefined, status: "ok", _corrupted: true, values: [NaN, null, ""] };
}

// ── ChallengeModule implementation ───────────────────────────────────

export const cascadingFailureModule: ChallengeModule = {
  slug: "cascading-failure",
  dimensions: CASCADING_DIMENSIONS,

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateCascadingData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
      weather: data.weather,
      stocks: data.stocks,
      news: data.news,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreCascading(input);
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
        return errorEnvelope(c, "Match not found or expired", 404);
      }

      const callNumber = result.match.apiCallLog.length + 1;
      const failure = getFailure(callNumber, "weather", result.data.groundTruth);

      await logApiCall(matchId, result.match.apiCallLog, "GET",
        `/sandbox/${matchId}/weather`, failure ? (failure.type === "500" ? 500 : failure.type === "404" ? 404 : 200) : 200, startTime);

      if (failure) {
        if (failure.type === "500") return c.json({ error: "Internal server error", code: 500 }, 500);
        if (failure.type === "404") return c.json({ error: "Resource not found" }, 404);
        if (failure.type === "malformed") return c.json(malformedResponse());
        if (failure.type === "stale") {
          // Return data from a different date/shifted values
          return c.json({ cities: result.data.weather.map((w: any) => ({ ...w, temperature_c: w.temperature_c + 15, condition: "unknown" })) });
        }
        if (failure.type === "timeout") return c.json({ error: "Request timed out", code: 408 }, 408);
      }

      const city = c.req.query("city");
      if (city) {
        const entry = result.data.weather.find((w: any) => w.city.toLowerCase() === city.toLowerCase());
        if (!entry) return c.json({ error: "City not found" }, 404);
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
        return errorEnvelope(c, "Match not found or expired", 404);
      }

      const callNumber = result.match.apiCallLog.length + 1;
      const failure = getFailure(callNumber, "stocks", result.data.groundTruth);

      await logApiCall(matchId, result.match.apiCallLog, "GET",
        `/sandbox/${matchId}/stocks`, failure ? (failure.type === "500" ? 500 : failure.type === "404" ? 404 : 200) : 200, startTime);

      if (failure) {
        if (failure.type === "500") return c.json({ error: "Internal server error" }, 500);
        if (failure.type === "404") return c.json({ error: "Stock data unavailable" }, 404);
        if (failure.type === "malformed") return c.json(malformedResponse());
        if (failure.type === "stale") {
          // Return truncated history (missing recent days)
          return c.json({
            stocks: result.data.stocks.map((s: any) => ({
              ticker: s.ticker, company: s.company,
              latest_close: s.history[5].close, // old data
              date_range: { from: s.history[0].date, to: s.history[5].date },
            })),
          });
        }
        if (failure.type === "timeout") return c.json({ error: "Request timed out" }, 408);
      }

      const ticker = c.req.query("ticker");
      if (ticker) {
        const stock = result.data.stocks.find((s: any) => s.ticker.toLowerCase() === ticker.toLowerCase());
        if (!stock) return c.json({ error: "Ticker not found" }, 404);
        return c.json(stock);
      }
      return c.json({
        stocks: result.data.stocks.map((s: any) => ({
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
        return errorEnvelope(c, "Match not found or expired", 404);
      }

      const callNumber = result.match.apiCallLog.length + 1;
      const failure = getFailure(callNumber, "news", result.data.groundTruth);

      await logApiCall(matchId, result.match.apiCallLog, "GET",
        `/sandbox/${matchId}/news`, failure ? (failure.type === "500" ? 500 : failure.type === "404" ? 404 : 200) : 200, startTime);

      if (failure) {
        if (failure.type === "500") return c.json({ error: "News service unavailable" }, 500);
        if (failure.type === "404") return c.json({ error: "News feed not found" }, 404);
        if (failure.type === "malformed") return c.json(malformedResponse());
        if (failure.type === "stale") {
          // Return articles with wrong dates
          return c.json({
            articles: result.data.news.slice(0, 3).map((a: any) => ({ ...a, published_date: "2020-01-01" })),
            total: 3,
          });
        }
        if (failure.type === "timeout") return c.json({ error: "Request timed out" }, 408);
      }

      const topic = c.req.query("topic");
      const search = c.req.query("search");
      let articles = result.data.news;
      if (topic) articles = articles.filter((a: any) => a.topic.toLowerCase() === topic.toLowerCase());
      if (search) {
        const s = search.toLowerCase();
        articles = articles.filter((a: any) =>
          a.headline.toLowerCase().includes(s) || a.summary.toLowerCase().includes(s) ||
          a.mentions.some((m: string) => m.toLowerCase().includes(s)));
      }
      return c.json({ articles, total: articles.length });
    });

    return sandbox;
  },
};
