import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Types ────────────────────────────────────────────────────────────

export interface CredentialProfile {
  api_url: string;
  api_key: string;
  agent_id: string;
  agent_name: string;
}

export interface CredentialsFile {
  version: 1;
  profiles: Record<string, CredentialProfile>;
  active_profile: string;
}

// ── Paths ────────────────────────────────────────────────────────────

export function getCredentialsDir(): string {
  return join(homedir(), ".config", "clawdiators");
}

export function getCredentialsPath(): string {
  return join(getCredentialsDir(), "credentials.json");
}

// ── Read / Write ─────────────────────────────────────────────────────

export async function loadCredentials(): Promise<CredentialsFile | null> {
  try {
    const raw = await readFile(getCredentialsPath(), "utf-8");
    return JSON.parse(raw) as CredentialsFile;
  } catch {
    return null;
  }
}

export async function saveCredentials(creds: CredentialsFile): Promise<void> {
  const dir = getCredentialsDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(getCredentialsPath(), JSON.stringify(creds, null, 2), {
    mode: 0o600,
  });
}

// ── Profile helpers ──────────────────────────────────────────────────

export async function getActiveProfile(): Promise<CredentialProfile | null> {
  const creds = await loadCredentials();
  if (!creds) return null;
  return creds.profiles[creds.active_profile] ?? null;
}

export async function saveProfile(
  name: string,
  profile: CredentialProfile,
  setActive = true,
): Promise<void> {
  const creds = (await loadCredentials()) ?? {
    version: 1,
    profiles: {},
    active_profile: "default",
  };
  creds.profiles[name] = profile;
  if (setActive) creds.active_profile = name;
  await saveCredentials(creds);
}

export async function switchProfile(name: string): Promise<boolean> {
  const creds = await loadCredentials();
  if (!creds || !creds.profiles[name]) return false;
  creds.active_profile = name;
  await saveCredentials(creds);
  return true;
}

export async function removeProfile(name: string): Promise<boolean> {
  const creds = await loadCredentials();
  if (!creds || !creds.profiles[name]) return false;
  delete creds.profiles[name];
  if (creds.active_profile === name) {
    const remaining = Object.keys(creds.profiles);
    creds.active_profile = remaining[0] ?? "default";
  }
  await saveCredentials(creds);
  return true;
}

/**
 * Resolve API key from multiple sources (priority order):
 * 1. CLAWDIATORS_API_KEY env var
 * 2. --api-key CLI flag
 * 3. Credentials file (active profile)
 */
export async function resolveApiKey(flagValue?: string): Promise<string | null> {
  if (process.env.CLAWDIATORS_API_KEY) return process.env.CLAWDIATORS_API_KEY;
  if (flagValue) return flagValue;
  const profile = await getActiveProfile();
  return profile?.api_key ?? null;
}

/**
 * Resolve API URL from multiple sources (priority order):
 * 1. CLAWDIATORS_API_URL env var
 * 2. Credentials file (active profile)
 * 3. Default localhost
 */
export async function resolveApiUrl(): Promise<string> {
  if (process.env.CLAWDIATORS_API_URL) return process.env.CLAWDIATORS_API_URL;
  const profile = await getActiveProfile();
  return profile?.api_url ?? "http://localhost:3001";
}
