import { describe, it, expect } from "vitest";
import { generateQuickdrawData } from "../src/challenges/quickdraw/data.js";
import { scoreQuickdraw } from "../src/challenges/quickdraw/scorer.js";

describe("Quickdraw data generation", () => {
  it("is deterministic — same seed produces same data", () => {
    const data1 = generateQuickdrawData(12345);
    const data2 = generateQuickdrawData(12345);

    expect(data1.weather).toEqual(data2.weather);
    expect(data1.stocks).toEqual(data2.stocks);
    expect(data1.news).toEqual(data2.news);
    expect(data1.groundTruth).toEqual(data2.groundTruth);
    expect(data1.objective).toEqual(data2.objective);
  });

  it("different seeds produce different data", () => {
    const data1 = generateQuickdrawData(12345);
    const data2 = generateQuickdrawData(54321);

    expect(data1.groundTruth.target_ticker).not.toBe(
      data2.groundTruth.target_ticker,
    );
  });

  it("generates 20 weather cities", () => {
    const data = generateQuickdrawData(42);
    expect(data.weather).toHaveLength(20);
  });

  it("generates 10 stocks with 30-day history", () => {
    const data = generateQuickdrawData(42);
    expect(data.stocks).toHaveLength(10);
    for (const stock of data.stocks) {
      expect(stock.history).toHaveLength(30);
    }
  });

  it("generates news articles with valid structure", () => {
    const data = generateQuickdrawData(42);
    expect(data.news.length).toBeGreaterThan(0);
    for (const article of data.news) {
      expect(article.id).toBeDefined();
      expect(article.topic).toBeDefined();
      expect(article.headline).toBeDefined();
      expect(["positive", "negative", "neutral"]).toContain(article.sentiment);
    }
  });

  it("ground truth references valid data", () => {
    const data = generateQuickdrawData(42);
    const gt = data.groundTruth;

    // Target city exists in weather
    const city = data.weather.find((w) => w.city === gt.target_city);
    expect(city).toBeDefined();
    expect(city!.condition).toBe(gt.target_condition);

    // Target ticker exists in stocks
    const stock = data.stocks.find((s) => s.ticker === gt.target_ticker);
    expect(stock).toBeDefined();

    // Target article exists in news
    const article = data.news.find((a) => a.id === gt.target_article_id);
    expect(article).toBeDefined();
    expect(article!.mentions).toContain(gt.target_ticker);
  });
});

describe("Quickdraw scoring", () => {
  const data = generateQuickdrawData(12345);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-01-15T10:00:00Z");

  it("perfect answer gets high score", () => {
    const { breakdown } = scoreQuickdraw({
      submission: {
        ticker: gt.target_ticker,
        close_price: gt.target_close_price,
        headline: gt.target_article_headline,
        sentiment: gt.target_sentiment,
        price_change_pct: gt.price_change_pct,
      },
      groundTruth: gt as unknown as Record<string, unknown>,
      startedAt,
      submittedAt: new Date(startedAt.getTime() + 10000), // 10s
      apiCallCount: 3,
    });

    expect(breakdown.total).toBeGreaterThanOrEqual(700);
    expect(breakdown.accuracy).toBeGreaterThan(0);
    expect(breakdown.speed).toBeGreaterThan(0);
    expect(breakdown.efficiency).toBeGreaterThan(0);
    expect(breakdown.style).toBeGreaterThan(0);
  });

  it("empty answer gets low score", () => {
    const { breakdown } = scoreQuickdraw({
      submission: {},
      groundTruth: gt as unknown as Record<string, unknown>,
      startedAt,
      submittedAt: new Date(startedAt.getTime() + 55000), // 55s
      apiCallCount: 25,
    });

    expect(breakdown.total).toBeLessThan(400);
    expect(breakdown.accuracy).toBe(0);
  });

  it("is deterministic — same inputs produce same score", () => {
    const submission = {
      ticker: gt.target_ticker,
      close_price: gt.target_close_price,
      headline: gt.target_article_headline,
      sentiment: gt.target_sentiment,
      price_change_pct: gt.price_change_pct,
    };
    const submittedAt = new Date(startedAt.getTime() + 15000);

    const r1 = scoreQuickdraw({ submission, groundTruth: gt as unknown as Record<string, unknown>, startedAt, submittedAt, apiCallCount: 4 });
    const r2 = scoreQuickdraw({ submission, groundTruth: gt as unknown as Record<string, unknown>, startedAt, submittedAt, apiCallCount: 4 });

    expect(r1).toEqual(r2);
  });

  it("faster submission gets higher speed score", () => {
    const submission = { ticker: gt.target_ticker };
    const fast = scoreQuickdraw({
      submission,
      groundTruth: gt as unknown as Record<string, unknown>,
      startedAt,
      submittedAt: new Date(startedAt.getTime() + 5000),
      apiCallCount: 3,
    });
    const slow = scoreQuickdraw({
      submission,
      groundTruth: gt as unknown as Record<string, unknown>,
      startedAt,
      submittedAt: new Date(startedAt.getTime() + 50000),
      apiCallCount: 3,
    });

    expect(fast.breakdown.speed).toBeGreaterThan(slow.breakdown.speed);
  });

  it("fewer API calls gets higher efficiency score", () => {
    const submission = { ticker: gt.target_ticker };
    const submittedAt = new Date(startedAt.getTime() + 15000);

    const efficient = scoreQuickdraw({
      submission,
      groundTruth: gt as unknown as Record<string, unknown>,
      startedAt,
      submittedAt,
      apiCallCount: 3,
    });
    const wasteful = scoreQuickdraw({
      submission,
      groundTruth: gt as unknown as Record<string, unknown>,
      startedAt,
      submittedAt,
      apiCallCount: 25,
    });

    expect(efficient.breakdown.efficiency).toBeGreaterThan(wasteful.breakdown.efficiency);
  });

  it("score never exceeds MAX_SCORE (1000)", () => {
    const { breakdown } = scoreQuickdraw({
      submission: {
        ticker: gt.target_ticker,
        close_price: gt.target_close_price,
        headline: gt.target_article_headline,
        sentiment: gt.target_sentiment,
        price_change_pct: gt.price_change_pct,
      },
      groundTruth: gt as unknown as Record<string, unknown>,
      startedAt,
      submittedAt: new Date(startedAt.getTime() + 1000), // 1s
      apiCallCount: 3,
    });

    expect(breakdown.total).toBeLessThanOrEqual(1000);
  });
});
