/**
 * Background campaign sweeper — expires stale campaign sessions and cleans up
 * their Docker containers/networks. Without this, abandoned campaigns leave
 * orphaned Docker networks that exhaust the address pool.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, campaigns, campaignSessions } from "@clawdiators/db";
import { stopMatchContainers, cleanupCampaignVolumes } from "./container-orchestrator.js";
import type { MatchContainerData } from "./container-orchestrator.js";

const SWEEP_INTERVAL_MS = 120_000; // 2 minutes

let sweepTimer: ReturnType<typeof setInterval> | null = null;

async function sweep(): Promise<void> {
  try {
    // Find active sessions that have expired
    const staleSessions = await db.query.campaignSessions.findMany({
      where: and(
        eq(campaignSessions.status, "active"),
        sql`${campaignSessions.expiresAt} < now()`,
      ),
    });

    for (const session of staleSessions) {
      // Stop containers
      const containerData = session.serviceData as unknown as MatchContainerData | null;
      if (containerData) {
        stopMatchContainers(containerData);
      }

      // Mark session expired
      await db
        .update(campaignSessions)
        .set({ status: "expired", completedAt: new Date() })
        .where(eq(campaignSessions.id, session.id))
        .catch(() => {});
    }

    if (staleSessions.length > 0) {
      console.log(`Campaign sweeper: expired ${staleSessions.length} stale session(s)`);
    }

    // Also find campaigns that have been "active" with no session activity for >6 hours
    // These are truly abandoned — clean up their volumes and networks too
    const abandoned = await db.query.campaigns.findMany({
      where: and(
        eq(campaigns.status, "active"),
        sql`COALESCE(${campaigns.lastSessionAt}, ${campaigns.startedAt}) < now() - interval '6 hours'`,
      ),
      columns: { id: true },
    });

    for (const campaign of abandoned) {
      await cleanupCampaignVolumes(campaign.id);
      await db
        .update(campaigns)
        .set({ status: "abandoned", completedAt: new Date() })
        .where(eq(campaigns.id, campaign.id))
        .catch(() => {});
    }

    if (abandoned.length > 0) {
      console.log(`Campaign sweeper: abandoned ${abandoned.length} stale campaign(s)`);
    }
  } catch {
    // Best-effort — don't crash the server
  }
}

export function startCampaignSweeper(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
  sweep().catch((err) => console.error("Campaign sweeper initial sweep failed:", err));
}

export function stopCampaignSweeper(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}
