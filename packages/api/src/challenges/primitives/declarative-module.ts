/**
 * Declarative Challenge Adapter — wraps a validated CommunitySpec into a ChallengeModule.
 * Uses scoring primitives for scoring and the template engine for data generation.
 * No dynamic code loading — safe by construction.
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, matches } from "@clawdiators/db";
import type { ApiCallLogEntry } from "@clawdiators/shared";
import { MAX_SCORE } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { SCORING_PRIMITIVES } from "./scoring.js";
import { time_decay, api_call_efficiency } from "./scoring.js";
import { mulberry32, pickOne, pickN, randInt, randFloat, interpolate } from "./data-generator.js";
import type { CommunitySpec } from "./validator.js";

/**
 * Build a ChallengeModule from a validated CommunitySpec.
 */
export function createDeclarativeModule(spec: CommunitySpec): ChallengeModule {
  return {
    slug: spec.slug,
    dimensions: spec.scoringDimensions,

    generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
      const rng = mulberry32(seed);
      const generated: Record<string, unknown> = {};

      if (spec.dataTemplate) {
        // Build pool lookup
        const pools: Record<string, unknown[]> = {};
        for (const pool of spec.dataTemplate.pools ?? []) {
          pools[pool.name] = pool.items;
        }

        // Generate fields
        for (const [key, fieldDef] of Object.entries(spec.dataTemplate.fields ?? {})) {
          switch (fieldDef.type) {
            case "pick_one":
              if (fieldDef.pool && pools[fieldDef.pool]) {
                generated[key] = pickOne(pools[fieldDef.pool], rng);
              }
              break;
            case "pick_n":
              if (fieldDef.pool && pools[fieldDef.pool]) {
                generated[key] = pickN(pools[fieldDef.pool], fieldDef.count ?? 3, rng);
              }
              break;
            case "rand_int":
              generated[key] = randInt(fieldDef.min ?? 0, fieldDef.max ?? 100, rng);
              break;
            case "rand_float":
              generated[key] = randFloat(fieldDef.min ?? 0, fieldDef.max ?? 1, rng, fieldDef.decimals ?? 2);
              break;
            case "template":
              if (fieldDef.template) {
                generated[key] = interpolate(fieldDef.template, generated as Record<string, string | number>);
              }
              break;
            case "static":
              generated[key] = fieldDef.value;
              break;
          }
        }
      }

      return {
        objective: `Complete the ${spec.name} challenge.`,
        groundTruth: generated,
        ...generated,
      };
    },

    score(input: ScoringInput): ScoreResult {
      const { submission, groundTruth, startedAt, submittedAt, apiCallCount } = input;
      const breakdown: Record<string, number> = {};
      let totalRaw = 0;

      // Score each dimension
      for (const dim of spec.scoringDimensions) {
        let rawScore = 0;

        // Check if this is the time dimension
        if (spec.scorer.timeDimension === dim.key) {
          const elapsed = (submittedAt.getTime() - startedAt.getTime()) / 1000;
          rawScore = time_decay(elapsed, spec.timeLimitSecs) * 1000;
        }
        // Check if this is the efficiency dimension
        else if (spec.scorer.efficiencyDimension === dim.key) {
          const optimal = spec.scorer.optimalCalls ?? spec.sandboxApis.length;
          const max = spec.scorer.maxCalls ?? optimal * 5;
          rawScore = api_call_efficiency(apiCallCount, optimal, max) * 1000;
        }
        // Use scorer field definitions
        else {
          const fields = spec.scorer.fields.filter((f) => {
            // Fields without explicit dimension mapping go to first non-time, non-efficiency dimension
            return true;
          });

          let fieldTotal = 0;
          let fieldMax = 0;

          for (const field of fields) {
            const primitive = SCORING_PRIMITIVES[field.primitive];
            if (!primitive) continue;

            const submittedVal = submission[field.key];
            const expectedVal = groundTruth[field.key];
            if (submittedVal === undefined) continue;

            const weight = field.weight ?? 1;
            fieldMax += weight;

            // Invoke the primitive
            const params = field.params ?? {};
            let score: number;
            if (field.primitive === "exact_match") {
              score = primitive(submittedVal, expectedVal);
            } else if (field.primitive === "numeric_tolerance") {
              score = primitive(
                typeof submittedVal === "number" ? submittedVal : Number(submittedVal),
                expectedVal,
                params.tolerance ?? 0.01,
              );
            } else if (field.primitive === "fuzzy_string") {
              score = primitive(String(submittedVal), String(expectedVal));
            } else if (field.primitive === "exact_match_ratio" || field.primitive === "set_overlap") {
              score = primitive(
                Array.isArray(submittedVal) ? submittedVal : [],
                Array.isArray(expectedVal) ? expectedVal : [],
              );
            } else if (field.primitive === "coverage_ratio") {
              score = primitive(
                typeof submittedVal === "number" ? submittedVal : 0,
                typeof expectedVal === "number" ? expectedVal : 0,
              );
            } else {
              score = primitive(submittedVal, expectedVal);
            }

            fieldTotal += score * weight;
          }

          rawScore = fieldMax > 0 ? (fieldTotal / fieldMax) * 1000 : 0;
        }

        const weighted = Math.round(rawScore * dim.weight);
        breakdown[dim.key] = weighted;
        totalRaw += weighted;
      }

      breakdown.total = Math.min(MAX_SCORE, totalRaw);
      return { breakdown };
    },

    sandboxApiNames(): string[] {
      return spec.sandboxApis.map((a) => a.name);
    },

    sandboxRoutes(): Hono {
      const sandbox = new Hono();

      // Create generic endpoints from spec
      for (const api of spec.sandboxApis) {
        for (const endpoint of api.endpoints) {
          const fullPath = `/:matchId/${api.name}${endpoint.path === "/" ? "" : endpoint.path}`;

          const handler = async (c: any) => {
            const startTime = Date.now();
            const matchId = c.req.param("matchId");

            const match = await db.query.matches.findFirst({
              where: eq(matches.id, matchId),
            });
            if (!match || match.status !== "active" || new Date() > match.expiresAt) {
              return c.json({ ok: false, data: { error: "Match not found or expired" }, flavour: "The sands have swallowed this arena." }, 404);
            }

            // Log API call
            const entry: ApiCallLogEntry = {
              ts: new Date().toISOString(),
              method: endpoint.method,
              path: `/sandbox/${matchId}/${api.name}${endpoint.path}`,
              status: 200,
              durationMs: Date.now() - startTime,
            };
            await db
              .update(matches)
              .set({ apiCallLog: [...match.apiCallLog, entry] })
              .where(eq(matches.id, matchId));

            // Generate data and return the relevant section
            const rng = mulberry32(match.seed);
            // Build response from spec data
            return c.json({
              api: api.name,
              description: api.description,
              data: `Declarative sandbox for ${spec.slug}/${api.name}`,
            });
          };

          if (endpoint.method === "GET") {
            sandbox.get(fullPath, handler);
          } else {
            sandbox.post(fullPath, handler);
          }
        }
      }

      return sandbox;
    },
  };
}
