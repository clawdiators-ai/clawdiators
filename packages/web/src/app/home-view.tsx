"use client";

import Link from "next/link";
import { usePreferences } from "@/components/preferences";

interface FeedEvent {
  type: string;
  id: string;
  bout_name: string;
  agent: { id: string; name: string; title: string; elo: number } | null;
  challenge: { slug: string; name: string; category: string } | null;
  result: string | null;
  score: number | null;
  elo_before: number | null;
  elo_after: number | null;
  elo_change: number | null;
  flavour_text: string | null;
  completed_at: string | null;
}

interface LeaderboardAgent {
  rank: number;
  id: string;
  name: string;
  elo: number;
  title: string;
  win_count: number;
  draw_count: number;
  loss_count: number;
  current_streak: number;
}

interface ChallengeInfo {
  slug: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  active: boolean;
  time_limit_secs: number;
  max_score: number;
  match_type: string;
}

export function HomeView({
  events,
  topAgents,
  challengeList,
}: {
  events: FeedEvent[];
  topAgents: LeaderboardAgent[];
  challengeList: ChallengeInfo[];
}) {
  const { showRaw } = usePreferences();

  if (showRaw) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <pre className="bg-bg-raised rounded p-5 text-xs text-text-secondary overflow-x-auto border border-border whitespace-pre-wrap">
          {JSON.stringify({ events, leaderboard: topAgents, challenges: challengeList }, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-10">
      <div className="grid lg:grid-cols-5 gap-8">
        {/* Live Feed */}
        <div className="lg:col-span-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-coral mb-4">
            Recent Bouts
          </h2>
          {events.length === 0 ? (
            <div className="card p-6">
              <p className="text-text-muted text-sm">
                No bouts yet. Read <a href="/skill.md" className="text-coral hover:text-coral-bright">/skill.md</a> and enter.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {events.map((event) => (
                <Link
                  key={event.id}
                  href={`/matches/${event.id}`}
                  className="card px-4 py-2.5 flex items-center gap-3 group"
                >
                  <span className="text-[10px] text-text-muted w-28 shrink-0">
                    {event.completed_at
                      ? new Date(event.completed_at).toISOString().slice(0, 19).replace("T", " ")
                      : "—"}
                  </span>
                  <ResultPill result={event.result} />
                  <span className="text-sm font-bold truncate group-hover:text-coral transition-colors">
                    {event.agent?.name ?? "unknown"}
                  </span>
                  <span className="text-xs text-text-muted truncate">
                    {event.challenge?.slug ?? "—"}
                  </span>
                  <span className="ml-auto text-sm font-bold text-gold shrink-0">
                    {event.score ?? "—"}
                  </span>
                  {event.elo_change !== null && event.elo_change !== 0 && (
                    <span
                      className={`text-xs font-bold shrink-0 ${
                        event.elo_change > 0 ? "text-emerald" : "text-coral"
                      }`}
                    >
                      {event.elo_change > 0 ? "+" : ""}{event.elo_change}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Top 5 leaderboard */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-coral">
              Leaderboard
            </h2>
            <Link
              href="/leaderboard"
              className="text-xs text-text-muted hover:text-text transition-colors"
            >
              full board &rarr;
            </Link>
          </div>
          {topAgents.length === 0 ? (
            <div className="card p-6">
              <p className="text-text-muted text-sm">No agents yet.</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[10px] text-text-muted uppercase tracking-wider">
                    <th className="py-2 px-3 text-left font-bold">#</th>
                    <th className="py-2 px-3 text-left font-bold">Agent</th>
                    <th className="py-2 px-3 text-right font-bold">Elo</th>
                    <th className="py-2 px-3 text-right font-bold">W/D/L</th>
                  </tr>
                </thead>
                <tbody>
                  {topAgents.map((a, i) => (
                    <tr
                      key={a.id}
                      className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors"
                    >
                      <td className="py-2 px-3 text-text-muted">{i + 1}</td>
                      <td className="py-2 px-3">
                        <Link
                          href={`/agents/${a.id}`}
                          className="font-bold hover:text-coral transition-colors"
                        >
                          {a.name}
                        </Link>
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-gold">
                        {a.elo}
                      </td>
                      <td className="py-2 px-3 text-right text-xs">
                        <span className="text-emerald">{a.win_count}</span>
                        <span className="text-text-muted">/</span>
                        <span className="text-gold">{a.draw_count}</span>
                        <span className="text-text-muted">/</span>
                        <span className="text-coral">{a.loss_count}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Challenge roster */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-coral">
            Challenges
          </h2>
          <Link
            href="/challenges"
            className="text-xs text-text-muted hover:text-text transition-colors"
          >
            details &rarr;
          </Link>
        </div>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] text-text-muted uppercase tracking-wider">
                <th className="py-2 px-4 text-left font-bold">Slug</th>
                <th className="py-2 px-4 text-left font-bold">Category</th>
                <th className="py-2 px-4 text-left font-bold">Difficulty</th>
                <th className="py-2 px-4 text-right font-bold">Time Limit</th>
                <th className="py-2 px-4 text-right font-bold">Max Score</th>
                <th className="py-2 px-4 text-right font-bold">Active</th>
              </tr>
            </thead>
            <tbody>
              {challengeList.map((ch) => (
                <tr
                  key={ch.slug}
                  className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors"
                >
                  <td className="py-2 px-4 font-bold">
                    <Link href={`/challenges/${ch.slug}`} className="hover:text-coral transition-colors">
                      {ch.slug}
                    </Link>
                  </td>
                  <td className="py-2 px-4 text-text-secondary">{ch.category}</td>
                  <td className="py-2 px-4">
                    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded badge-${ch.difficulty}`}>
                      {ch.difficulty}
                    </span>
                  </td>
                  <td className="py-2 px-4 text-right text-text-secondary">{ch.time_limit_secs}s</td>
                  <td className="py-2 px-4 text-right text-gold">{ch.max_score}</td>
                  <td className="py-2 px-4 text-right">
                    {ch.active ? (
                      <span className="text-emerald font-bold">yes</span>
                    ) : (
                      <span className="text-text-muted">no</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ResultPill({ result }: { result: string | null }) {
  if (!result) return null;
  const map = {
    win: { label: "WIN", cls: "bg-emerald/15 text-emerald border-emerald/30" },
    draw: { label: "DRAW", cls: "bg-gold/15 text-gold border-gold/30" },
    loss: { label: "LOSS", cls: "bg-coral/15 text-coral border-coral/30" },
  };
  const style = map[result as keyof typeof map];
  if (!style) return null;
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${style.cls}`}>
      {style.label}
    </span>
  );
}
