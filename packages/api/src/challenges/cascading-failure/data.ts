import {
  WEATHER_CITIES,
  WEATHER_CONDITIONS,
  STOCK_TICKERS,
  NEWS_TOPICS,
} from "@clawdiators/shared";
import { mulberry32 } from "../../services/whimsy.js";

export interface CascadingGroundTruth {
  target_city: string;
  target_condition: string;
  target_ticker: string;
  target_close_price: number;
  target_article_headline: string;
  target_sentiment: "positive" | "negative" | "neutral";
  price_change_pct: number;
  // Failure schedule: which API call numbers trigger failures
  failure_schedule: FailureEvent[];
}

export interface FailureEvent {
  callNumber: number; // triggers on the Nth API call overall
  type: "500" | "malformed" | "404" | "stale" | "timeout";
  api: string; // which sandbox API is affected
}

export interface CascadingData {
  weather: any[];
  stocks: any[];
  news: any[];
  groundTruth: CascadingGroundTruth;
  objective: string;
}

const COMPANY_NAMES: Record<string, string> = {
  CLWX: "Clawdian Exchange Corp",
  SOLR: "Solar Reef Industries",
  DPTH: "Depth Dynamics Ltd",
  KRLL: "Krill Logistics Inc",
  REEF: "Reef Capital Holdings",
  TRNT: "Trident Technologies",
  ANCH: "Anchor Systems Group",
  BRNE: "Brine Energy Co",
  PLNK: "Plankton Analytics",
  SHEL: "Shell Corp International",
};

const FAILURE_TYPES: FailureEvent["type"][] = ["500", "malformed", "404", "stale", "timeout"];
const APIS = ["weather", "stocks", "news"];

/**
 * Generate Cascading Failure data. Same underlying data as Quickdraw,
 * but with a deterministic failure schedule injected.
 */
export function generateCascadingData(seed: number): CascadingData {
  const rng = mulberry32(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const randInt = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
  const randFloat = (min: number, max: number) => Math.round((rng() * (max - min) + min) * 100) / 100;

  // === Weather (10 cities — smaller dataset for faster solving) ===
  const weather = WEATHER_CITIES.slice(0, 10).map((city) => ({
    city,
    temperature_c: Math.round(5 + rng() * 30),
    condition: pick(WEATHER_CONDITIONS),
    humidity: randInt(30, 95),
    wind_kph: randInt(0, 60),
  }));

  const targetCityIdx = randInt(0, weather.length - 1);
  const targetCity = weather[targetCityIdx];

  // === Stocks (6 tickers, 15-day history) ===
  const baseDate = new Date("2026-02-01");
  baseDate.setDate(baseDate.getDate() + (seed % 15));

  const stocks = STOCK_TICKERS.slice(0, 6).map((ticker) => {
    const basePrice = randFloat(10, 500);
    const history: any[] = [];
    let prevClose = basePrice;
    for (let d = 0; d < 15; d++) {
      const date = new Date(baseDate);
      date.setDate(date.getDate() - (14 - d));
      const change = randFloat(-0.05, 0.05);
      const open = Math.round(prevClose * (1 + change / 2) * 100) / 100;
      const close = Math.round(prevClose * (1 + change) * 100) / 100;
      const high = Math.round(Math.max(open, close) * (1 + rng() * 0.02) * 100) / 100;
      const low = Math.round(Math.min(open, close) * (1 - rng() * 0.02) * 100) / 100;
      const volume = randInt(100000, 10000000);
      history.push({ date: date.toISOString().split("T")[0], open, high, low, close, volume });
      prevClose = close;
    }
    return { ticker, company: COMPANY_NAMES[ticker] || ticker, history };
  });

  // Find stock with highest close on a target date
  const targetDateIdx = randInt(3, 12);
  const targetDate = stocks[0].history[targetDateIdx].date;
  let highestClose = -1;
  let highestTicker = stocks[0];
  for (const stock of stocks) {
    const day = stock.history[targetDateIdx];
    if (day.close > highestClose) {
      highestClose = day.close;
      highestTicker = stock;
    }
  }

  const prevDay = highestTicker.history[targetDateIdx - 1];
  const targetDay = highestTicker.history[targetDateIdx];
  const priceChangePct = Math.round(((targetDay.close - prevDay.close) / prevDay.close) * 10000) / 100;

  // === News (3 topics × 3 articles + 1 target) ===
  const sentiments: Array<"positive" | "negative" | "neutral"> = ["positive", "negative", "neutral"];
  const topics = NEWS_TOPICS.slice(0, 3);
  const news: any[] = [];

  for (const topic of topics) {
    for (let a = 0; a < 3; a++) {
      news.push({
        id: `art-${seed}-${topic.replace(/\s/g, "")}-${a}`,
        topic,
        headline: `${topic}: ${pick(weather).city} developments impact ${pick(stocks).ticker}`,
        summary: `Analysis of recent ${topic.toLowerCase()} trends.`,
        sentiment: pick(sentiments),
        published_date: targetDate,
        mentions: [pick(weather).city, pick(stocks).ticker],
      });
    }
  }

  // Target article
  const targetSentiment = pick(sentiments);
  const targetArticle = {
    id: `art-${seed}-target`,
    topic: pick(topics),
    headline: `${highestTicker.company} leads amid ${targetCity.city} reports`,
    summary: `${highestTicker.ticker} saw significant activity related to ${targetCity.city}.`,
    sentiment: targetSentiment,
    published_date: targetDate,
    mentions: [targetCity.city, highestTicker.ticker],
  };
  news.splice(randInt(0, news.length), 0, targetArticle);

  // === Failure schedule ===
  // Progressively inject failures: mild at first, then escalating
  const failureSchedule: FailureEvent[] = [
    { callNumber: 3, type: "stale", api: pick(APIS) },     // Early: stale data
    { callNumber: 5, type: "500", api: pick(APIS) },        // Mid: server error
    { callNumber: 7, type: "malformed", api: pick(APIS) },  // Mid: bad JSON
    { callNumber: 9, type: "404", api: pick(APIS) },        // Late: missing resource
    { callNumber: 11, type: "timeout", api: pick(APIS) },   // Late: timeout
    { callNumber: 13, type: "500", api: pick(APIS) },       // Very late: another 500
    { callNumber: 15, type: "malformed", api: pick(APIS) }, // Very late: more corruption
  ];

  // Objective
  const objective = `Under degrading conditions, determine which stock had the highest closing price on the day when ${targetCity.city} experienced ${targetCity.condition}. APIs will progressively fail — expect 500 errors, malformed responses, 404s, and stale data. Report: ticker, close_price, article headline mentioning the stock, sentiment, and price_change_pct. Resilience matters as much as accuracy.`;

  return {
    weather,
    stocks,
    news,
    groundTruth: {
      target_city: targetCity.city,
      target_condition: targetCity.condition,
      target_ticker: highestTicker.ticker,
      target_close_price: highestClose,
      target_article_headline: targetArticle.headline,
      target_sentiment: targetSentiment,
      price_change_pct: priceChangePct,
      failure_schedule: failureSchedule,
    },
    objective,
  };
}
