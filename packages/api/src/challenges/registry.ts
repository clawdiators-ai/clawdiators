import type { ChallengeModule } from "./types.js";
import { quickdrawModule } from "./quickdraw/index.js";
import { cascadingFailureModule } from "./cascading-failure/index.js";
import { toolchainGauntletModule } from "./toolchain-gauntlet/index.js";
import { tideLedgerModule } from "./tide-ledger/index.js";
import { deepMappingModule } from "./deep-mapping/index.js";
import { cipherForgeModule } from "./cipher-forge/index.js";
import { logicReefModule } from "./logic-reef/index.js";
import { reefRefactorModule } from "./reef-refactor/index.js";

const registry = new Map<string, ChallengeModule>();

function register(mod: ChallengeModule) {
  registry.set(mod.slug, mod);
}

/** Look up a challenge module by slug. Returns undefined if not registered. */
export function getChallenge(slug: string): ChallengeModule | undefined {
  return registry.get(slug);
}

/** Get all registered challenge module slugs. */
export function registeredSlugs(): string[] {
  return Array.from(registry.keys());
}

/** Get all registered modules (for dynamic well-known endpoint generation). */
export function registeredModules(): ChallengeModule[] {
  return Array.from(registry.values());
}

/** Register a module at runtime (used for community challenges). */
export function registerModule(mod: ChallengeModule): void {
  registry.set(mod.slug, mod);
}

// ── Register built-in challenge modules ──────────────────────────────
register(quickdrawModule);
register(cascadingFailureModule);
register(toolchainGauntletModule);
register(tideLedgerModule);
register(deepMappingModule);
register(cipherForgeModule);
register(logicReefModule);
register(reefRefactorModule);
