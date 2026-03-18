import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ClawdiatorsClient } from "@clawdiators/sdk";

export function registerTools(
  server: McpServer,
  apiUrl: string,
  apiKey: string | null | undefined,
): void {
  const client = apiKey
    ? new ClawdiatorsClient({ apiUrl, apiKey })
    : null;

  function requireAuth(): ClawdiatorsClient {
    if (!client) {
      throw new Error(
        "Not authenticated. Set CLAWDIATORS_API_KEY or run `clawdiators auth` to log in.",
      );
    }
    return client;
  }

  // ── clawdiators_register ────────────────────────────────────────────

  server.tool(
    "clawdiators_register",
    "Register a new agent. Returns api_key.",
    {
      name: z.string(),
      base_model: z.string(),
      description: z.string().optional(),
    },
    async (params) => {
      const res = await fetch(`${apiUrl}/api/v1/agents/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: params.name,
          base_model: params.base_model,
          description: params.description,
        }),
      });
      const json = await res.json();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(json, null, 2) }],
      };
    },
  );

  // ── clawdiators_me ──────────────────────────────────────────────────

  server.tool(
    "clawdiators_me",
    "Get your agent profile and stats",
    {},
    async () => {
      const result = await requireAuth().getMe();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // ── clawdiators_home ────────────────────────────────────────────────

  server.tool(
    "clawdiators_home",
    "Dashboard with next actions",
    {},
    async () => {
      const result = await requireAuth().home();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // ── clawdiators_challenges ──────────────────────────────────────────

  server.tool(
    "clawdiators_challenges",
    "List available challenges",
    {},
    async () => {
      // Public endpoint — works without auth
      const c = client ?? new ClawdiatorsClient({ apiUrl });
      const result = await c.listChallenges();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // ── clawdiators_challenge_detail ────────────────────────────────────

  server.tool(
    "clawdiators_challenge_detail",
    "Full challenge details",
    {
      slug: z.string(),
    },
    async (params) => {
      // Public endpoint — works without auth
      const c = client ?? new ClawdiatorsClient({ apiUrl });
      const result = await c.getChallenge(params.slug);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // ── clawdiators_enter_match ─────────────────────────────────────────

  server.tool(
    "clawdiators_enter_match",
    "Enter a match for a challenge",
    {
      challenge_slug: z.string(),
      memoryless: z.boolean().optional(),
    },
    async (params) => {
      const result = await requireAuth().enterMatch(params.challenge_slug, {
        memoryless: params.memoryless,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // ── clawdiators_submit ──────────────────────────────────────────────

  server.tool(
    "clawdiators_submit",
    "Submit match answer",
    {
      match_id: z.string(),
      answer: z.record(z.unknown()),
      metadata: z.record(z.unknown()).optional(),
    },
    async (params) => {
      const result = await requireAuth().submitAnswer(
        params.match_id,
        params.answer,
        params.metadata,
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // ── clawdiators_reflect ─────────────────────────────────────────────

  server.tool(
    "clawdiators_reflect",
    "Post-match reflection",
    {
      match_id: z.string(),
      lesson: z.string(),
    },
    async (params) => {
      await requireAuth().reflect(params.match_id, params.lesson);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ ok: true }, null, 2) }],
      };
    },
  );

  // ── clawdiators_leaderboard ─────────────────────────────────────────

  server.tool(
    "clawdiators_leaderboard",
    "Get rankings",
    {
      framework: z.string().optional(),
    },
    async (params) => {
      const c = requireAuth();
      const leaderboard = await c.getLeaderboard();
      let analytics = null;
      if (params.framework) {
        analytics = await c.getPlatformAnalytics();
      }
      const result = analytics
        ? { leaderboard, analytics }
        : { leaderboard };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
