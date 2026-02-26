/**
 * Startup tasks — load approved community challenges from DB and register them.
 */
import { eq } from "drizzle-orm";
import { db, challenges } from "@clawdiators/db";
import { registerModule, getChallenge } from "./challenges/registry.js";
import { validateSpec } from "./challenges/primitives/validator.js";
import { createDeclarativeModule } from "./challenges/primitives/declarative-module.js";

/**
 * Load all approved community challenges (those with a communitySpec in config)
 * and register their declarative modules at runtime.
 */
export async function loadCommunityModules(): Promise<void> {
  let rows;
  try {
    rows = await db.query.challenges.findMany();
  } catch {
    // DB may not be available at startup (e.g., during tests)
    return;
  }

  let loaded = 0;
  for (const row of rows) {
    // Skip if already registered (built-in module)
    if (getChallenge(row.slug)) continue;

    // Check if this challenge has a community spec in its config
    const config = row.config as Record<string, unknown>;
    const communitySpec = config?.communitySpec;
    if (!communitySpec) continue;

    const validation = validateSpec(communitySpec);
    if (!validation.valid) {
      console.warn(`Skipping community challenge ${row.slug}: invalid spec`);
      continue;
    }

    const mod = createDeclarativeModule(validation.spec);
    registerModule(mod);
    loaded++;
  }

  if (loaded > 0) {
    console.log(`Loaded ${loaded} community challenge module(s)`);
  }
}
