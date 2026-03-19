"use client";

import { useState, useRef, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";

// ── Score Trend (Interactive) ─────────────────────────────────────

interface ScoreTrendPoint {
  date: string;
  median_score: number;
  match_count: number;
}

export function InteractiveScoreTrendChart({ data }: { data: ScoreTrendPoint[] }) {
  if (data.length < 2) {
    return <div className="text-xs text-text-muted text-center py-8">Not enough data for trend</div>;
  }

  const trending = data[data.length - 1].median_score >= data[0].median_score;
  const color = trending ? "var(--color-emerald)" : "var(--color-coral)";

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="scoreTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.3} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          tickFormatter={(v) => {
            const d = new Date(v);
            return `${d.getMonth() + 1}/${d.getDate()}`;
          }}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
          tickLine={false}
          axisLine={false}
          width={40}
          domain={["auto", "auto"]}
        />
        <RechartsTooltip
          contentStyle={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            fontSize: 11,
            padding: "8px 12px",
            color: "var(--color-text)",
          }}
          labelFormatter={(label) => {
            const d = new Date(String(label));
            return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          }}
          formatter={(value, name) => {
            if (name === "median_score") return [value, "Median Score"];
            if (name === "match_count") return [value, "Matches"];
            return [value, name];
          }}
        />
        <Area
          type="monotone"
          dataKey="median_score"
          stroke={color}
          strokeWidth={2}
          fill="url(#scoreTrendFill)"
          dot={false}
          activeDot={{ r: 4, fill: color, stroke: "var(--color-bg)", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Elo Distribution ──────────────────────────────────────────────

interface EloDistributionProps {
  agents: { elo: number; name: string }[];
}

export function EloDistributionChart({ agents }: EloDistributionProps) {
  if (agents.length < 3) return null;

  // Build histogram buckets
  const elos = agents.map((a) => a.elo);
  const minElo = Math.floor(Math.min(...elos) / 50) * 50;
  const maxElo = Math.ceil(Math.max(...elos) / 50) * 50;
  const bucketSize = Math.max(50, Math.ceil((maxElo - minElo) / 15 / 50) * 50);

  const buckets: { range: string; count: number; min: number; max: number }[] = [];
  for (let lo = minElo; lo < maxElo; lo += bucketSize) {
    const hi = lo + bucketSize;
    const count = elos.filter((e) => e >= lo && e < hi).length;
    buckets.push({ range: `${lo}–${hi}`, count, min: lo, max: hi });
  }

  const medianElo = elos.sort((a, b) => a - b)[Math.floor(elos.length / 2)];

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={buckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.3} vertical={false} />
        <XAxis
          dataKey="range"
          tick={{ fontSize: 9, fill: "var(--color-text-muted)" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
          tickLine={false}
          axisLine={false}
          width={30}
          allowDecimals={false}
        />
        <RechartsTooltip
          contentStyle={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            fontSize: 11,
            padding: "8px 12px",
            color: "var(--color-text)",
          }}
          formatter={(value) => [value, "Agents"]}
          labelFormatter={(label) => `Elo ${label}`}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {buckets.map((bucket, i) => (
            <Cell
              key={i}
              fill={
                medianElo >= bucket.min && medianElo < bucket.max
                  ? "var(--color-gold)"
                  : "var(--color-sky)"
              }
              fillOpacity={
                medianElo >= bucket.min && medianElo < bucket.max ? 0.6 : 0.3
              }
            />
          ))}
        </Bar>
        <ReferenceLine
          x={buckets.find((b) => medianElo >= b.min && medianElo < b.max)?.range}
          stroke="var(--color-gold)"
          strokeDasharray="4 4"
          strokeOpacity={0.7}
          label={{ value: `Median: ${medianElo}`, position: "top", fontSize: 10, fill: "var(--color-gold)" }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Model Comparison Bar Chart ────────────────────────────────────

interface ModelBenchmarkEntry {
  model: string;
  median_score: number;
  mean_score: number;
  p25: number;
  p75: number;
  win_rate: number;
  agent_count: number;
  match_count: number;
}

export function ModelComparisonChart({ models }: { models: ModelBenchmarkEntry[] }) {
  if (models.length === 0) return null;

  const data = models.slice(0, 10).map((m) => ({
    ...m,
    displayName: m.model.length > 20 ? m.model.slice(0, 18) + "…" : m.model,
    winRatePct: Math.round(m.win_rate * 100),
  }));

  return (
    <div className="space-y-4">
      {/* Median Score comparison */}
      <div>
        <p className="text-[10px] text-text-muted mb-2 uppercase tracking-wider font-bold">Score Comparison</p>
        <ResponsiveContainer width="100%" height={data.length * 36 + 20}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.3} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="displayName"
              tick={{ fontSize: 10, fill: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}
              tickLine={false}
              axisLine={false}
              width={130}
            />
            <RechartsTooltip
              contentStyle={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                fontSize: 11,
                padding: "8px 12px",
                color: "var(--color-text)",
              }}
              formatter={(value, name) => {
                if (name === "median_score") return [value, "Median"];
                if (name === "mean_score") return [value, "Mean"];
                return [value, name];
              }}
              labelFormatter={(label) => String(label)}
            />
            <Bar dataKey="median_score" fill="var(--color-emerald)" fillOpacity={0.5} radius={[0, 3, 3, 0]} name="median_score" />
            <Bar dataKey="mean_score" fill="var(--color-sky)" fillOpacity={0.3} radius={[0, 3, 3, 0]} name="mean_score" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Win Rate comparison */}
      <div>
        <p className="text-[10px] text-text-muted mb-2 uppercase tracking-wider font-bold">Win Rate (%)</p>
        <ResponsiveContainer width="100%" height={data.length * 32 + 20}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.3} horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="displayName"
              tick={{ fontSize: 10, fill: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}
              tickLine={false}
              axisLine={false}
              width={130}
            />
            <RechartsTooltip
              contentStyle={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                fontSize: 11,
                padding: "8px 12px",
                color: "var(--color-text)",
              }}
              formatter={(value) => [`${value}%`, "Win Rate"]}
            />
            <Bar dataKey="winRatePct" radius={[0, 3, 3, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.winRatePct >= 50 ? "var(--color-emerald)" : "var(--color-coral)"}
                  fillOpacity={0.5}
                />
              ))}
            </Bar>
            <ReferenceLine x={50} stroke="var(--color-text-muted)" strokeDasharray="4 4" strokeOpacity={0.5} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Enhanced Sparkline with Tooltip ───────────────────────────────

interface SparklineProps {
  data: { ts: string; elo: number }[];
}

export function InteractiveSparkline({ data }: SparklineProps) {
  const [hovered, setHovered] = useState<{ x: number; y: number; elo: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (!data || data.length < 2) {
    return <span className="text-text-muted text-xs">&mdash;</span>;
  }

  const values = data.slice(-12).map((d) => d.elo);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 80;
  const h = 24;

  const pointCoords = values.map((v, i) => ({
    x: (i / (values.length - 1)) * w,
    y: h - ((v - min) / range) * (h - 4) - 2,
    elo: v,
  }));

  const points = pointCoords.map((p) => `${p.x},${p.y}`).join(" ");
  const trending = values[values.length - 1] >= values[0];
  const color = trending ? "var(--color-emerald)" : "var(--color-coral)";

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * w;
      // Find closest point
      let closest = pointCoords[0];
      let minDist = Infinity;
      for (const p of pointCoords) {
        const dist = Math.abs(p.x - mouseX);
        if (dist < minDist) {
          minDist = dist;
          closest = p;
        }
      }
      setHovered(closest);
    },
    [pointCoords]
  );

  return (
    <span className="relative inline-block">
      <svg
        ref={svgRef}
        width={w}
        height={h}
        className="inline-block cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered(null)}
      >
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {hovered && (
          <circle cx={hovered.x} cy={hovered.y} r={3} fill={color} stroke="var(--color-bg)" strokeWidth={1.5} />
        )}
      </svg>
      {hovered && (
        <span
          className="absolute -top-7 left-1/2 -translate-x-1/2 bg-bg-elevated border border-border rounded px-1.5 py-0.5 text-[10px] font-bold text-text whitespace-nowrap z-50 pointer-events-none"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
        >
          {hovered.elo}
        </span>
      )}
    </span>
  );
}

// ── Win/Loss Ratio Donut ──────────────────────────────────────────

interface WinLossDonutProps {
  wins: number;
  draws: number;
  losses: number;
}

// ── Harness Comparison Charts ─────────────────────────────────────

interface HarnessLeaderboardEntry {
  harness_id: string;
  harness_name: string;
  base_framework: string | null;
  avg_elo: number;
  agent_count: number;
  total_wins: number;
  total_matches: number;
  win_rate: number;
}

interface HarnessBenchmarkEntry {
  harness_id: string;
  agent_count: number;
  match_count: number;
  median_score: number;
  mean_score: number;
  win_rate: number;
}

export function HarnessEloComparisonChart({ harnesses }: { harnesses: HarnessLeaderboardEntry[] }) {
  if (harnesses.length === 0) return null;

  const data = harnesses.slice(0, 12).map((h) => ({
    name: h.harness_name.length > 18 ? h.harness_name.slice(0, 16) + "…" : h.harness_name,
    fullName: h.harness_name,
    elo: Math.round(h.avg_elo),
    agents: h.agent_count,
    winRate: h.win_rate,
  }));

  return (
    <ResponsiveContainer width="100%" height={data.length * 36 + 20}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.3} horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 10, fill: "var(--color-purple)", fontFamily: "var(--font-mono)" }}
          tickLine={false}
          axisLine={false}
          width={130}
        />
        <RechartsTooltip
          contentStyle={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            fontSize: 11,
            padding: "8px 12px",
            color: "var(--color-text)",
          }}
          formatter={(value, name) => {
            if (name === "elo") return [value, "Avg Elo"];
            return [value, name];
          }}
          labelFormatter={(_label, payload) => {
            const item = payload?.[0] as { payload?: { fullName?: string } } | undefined;
            return item?.payload?.fullName ?? String(_label);
          }}
        />
        <Bar dataKey="elo" radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill="var(--color-purple)"
              fillOpacity={0.3 + (entry.elo / Math.max(...data.map(d => d.elo))) * 0.4}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HarnessScoreComparisonChart({ benchmarks }: { benchmarks: HarnessBenchmarkEntry[] }) {
  if (benchmarks.length === 0) return null;

  const data = benchmarks.slice(0, 12).map((h) => ({
    name: h.harness_id.length > 18 ? h.harness_id.slice(0, 16) + "…" : h.harness_id,
    fullName: h.harness_id,
    median: h.median_score,
    mean: h.mean_score,
    winRate: Math.round(h.win_rate * 100),
    matches: h.match_count,
  }));

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] text-text-muted mb-2 uppercase tracking-wider font-bold">Median vs Mean Score</p>
        <ResponsiveContainer width="100%" height={data.length * 34 + 20}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.3} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 10, fill: "var(--color-purple)", fontFamily: "var(--font-mono)" }}
              tickLine={false}
              axisLine={false}
              width={130}
            />
            <RechartsTooltip
              contentStyle={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                fontSize: 11,
                padding: "8px 12px",
                color: "var(--color-text)",
              }}
              formatter={(value, name) => {
                if (name === "median") return [value, "Median Score"];
                if (name === "mean") return [value, "Mean Score"];
                return [value, name];
              }}
              labelFormatter={(_label, payload) => {
                const item = payload?.[0] as { payload?: { fullName?: string } } | undefined;
                return item?.payload?.fullName ?? String(_label);
              }
              }
            />
            <Bar dataKey="median" fill="var(--color-purple)" fillOpacity={0.5} radius={[0, 3, 3, 0]} name="median" />
            <Bar dataKey="mean" fill="var(--color-sky)" fillOpacity={0.3} radius={[0, 3, 3, 0]} name="mean" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <p className="text-[10px] text-text-muted mb-2 uppercase tracking-wider font-bold">Win Rate by Harness (%)</p>
        <ResponsiveContainer width="100%" height={data.length * 30 + 20}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.3} horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 10, fill: "var(--color-purple)", fontFamily: "var(--font-mono)" }}
              tickLine={false}
              axisLine={false}
              width={130}
            />
            <RechartsTooltip
              contentStyle={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                fontSize: 11,
                padding: "8px 12px",
                color: "var(--color-text)",
              }}
              formatter={(value) => [`${value}%`, "Win Rate"]}
            />
            <Bar dataKey="winRate" radius={[0, 3, 3, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.winRate >= 50 ? "var(--color-emerald)" : "var(--color-coral)"}
                  fillOpacity={0.5}
                />
              ))}
            </Bar>
            <ReferenceLine x={50} stroke="var(--color-text-muted)" strokeDasharray="4 4" strokeOpacity={0.5} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function WinLossDonut({ wins, draws, losses }: WinLossDonutProps) {
  const total = wins + draws + losses;
  if (total === 0) return null;

  const r = 20;
  const cx = 24;
  const cy = 24;
  const circumference = 2 * Math.PI * r;

  const winPct = wins / total;
  const drawPct = draws / total;

  const winArc = circumference * winPct;
  const drawArc = circumference * drawPct;
  const lossArc = circumference - winArc - drawArc;

  return (
    <svg width={48} height={48} className="inline-block">
      {/* Loss (background) */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-coral)" strokeWidth={5} strokeOpacity={0.4}
        strokeDasharray={`${lossArc} ${circumference - lossArc}`}
        strokeDashoffset={-(winArc + drawArc)}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* Draw */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-gold)" strokeWidth={5} strokeOpacity={0.5}
        strokeDasharray={`${drawArc} ${circumference - drawArc}`}
        strokeDashoffset={-winArc}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* Win */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-emerald)" strokeWidth={5} strokeOpacity={0.6}
        strokeDasharray={`${winArc} ${circumference - winArc}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight="bold" fill="var(--color-text)">
        {Math.round(winPct * 100)}%
      </text>
    </svg>
  );
}
