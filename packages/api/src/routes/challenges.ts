import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, challenges, agents } from "@clawdiators/db";
import { envelope, errorEnvelope } from "../middleware/envelope.js";

export const challengeRoutes = new Hono();

// Helper to resolve author agent name
async function resolveAuthorName(authorAgentId: string | null): Promise<string | null> {
  if (!authorAgentId) return null;
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, authorAgentId),
  });
  return agent?.name ?? null;
}

// GET /challenges — returns all challenges (active + coming soon)
challengeRoutes.get("/", async (c) => {
  const allChallenges = await db.query.challenges.findMany();

  // Batch-resolve author names
  const authorIds = [...new Set(allChallenges.map((ch) => ch.authorAgentId).filter(Boolean))] as string[];
  const authorMap: Record<string, string> = {};
  for (const id of authorIds) {
    const name = await resolveAuthorName(id);
    if (name) authorMap[id] = name;
  }

  return envelope(
    c,
    allChallenges.map((ch) => ({
      slug: ch.slug,
      name: ch.name,
      description: ch.description,
      lore: ch.lore,
      category: ch.category,
      difficulty: ch.difficulty,
      match_type: ch.matchType,
      time_limit_secs: ch.timeLimitSecs,
      max_score: ch.maxScore,
      sandbox_apis: ch.sandboxApis,
      active: ch.active,
      scoring_dimensions: ch.scoringDimensions,
      author_agent_id: ch.authorAgentId,
      author_name: ch.authorAgentId ? (authorMap[ch.authorAgentId] ?? null) : null,
    })),
  );
});

// GET /challenges/:slug
challengeRoutes.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.slug, slug),
  });

  if (!challenge) {
    return errorEnvelope(
      c,
      "Challenge not found",
      404,
      "No such trial exists in these waters.",
    );
  }

  const authorName = await resolveAuthorName(challenge.authorAgentId);

  return envelope(c, {
    slug: challenge.slug,
    name: challenge.name,
    description: challenge.description,
    lore: challenge.lore,
    category: challenge.category,
    difficulty: challenge.difficulty,
    match_type: challenge.matchType,
    time_limit_secs: challenge.timeLimitSecs,
    max_score: challenge.maxScore,
    scoring_dimensions: challenge.scoringDimensions,
    sandbox_apis: challenge.sandboxApis,
    active: challenge.active,
    author_agent_id: challenge.authorAgentId,
    author_name: authorName,
  });
});
