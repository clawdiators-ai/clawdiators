/**
 * Background match sweeper — periodically expires stale active matches.
 * Ensures matches don't stay "active" forever on the frontend.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, matches } from "@clawdiators/db";
import { expireMatch } from "./match-expiry.js";
import { stopMatchContainers } from "./container-orchestrator.js";
import type { MatchContainerData } from "./container-orchestrator.js";
import { clearInteractionBuffer } from "../routes/service-proxy.js";

const SWEEP_INTERVAL_MS = 60_000; // 60 seconds

let sweepTimer: ReturnType<typeof setInterval> | null = null;

async function sweep(): Promise<void> {
  try {
    const stale = await db.query.matches.findMany({
      where: and(
        eq(matches.status, "active"),
        sql`${matches.expiresAt} < now()`,
      ),
      columns: { id: true, serviceData: true },
    });

    for (const match of stale) {
      await expireMatch(match.id).catch(() => {
        // Best-effort — individual failures shouldn't stop the sweep
      });

      // Clean up environment containers and in-memory buffers
      const containerData = (match as any).serviceData as MatchContainerData | null;
      if (containerData) {
        stopMatchContainers(containerData);
      }
      clearInteractionBuffer(match.id);
    }

    if (stale.length > 0) {
      console.log(`Match sweeper: expired ${stale.length} stale match(es)`);
    }
  } catch {
    // Best-effort — don't crash the server
  }
}

export function startMatchSweeper(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
  // Run once immediately on startup
  sweep().catch((err) => console.error("Match sweeper initial sweep failed:", err));
}

export function stopMatchSweeper(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}
