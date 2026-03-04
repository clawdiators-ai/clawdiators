/**
 * Container Orchestrator
 *
 * Manages containers for "environment" type challenges.
 * Dispatches to one of two backends based on the ORCHESTRATOR env var:
 *
 *   ORCHESTRATOR=docker  (default)
 *     Uses `docker` CLI via execFile. Requires Docker socket access.
 *     Best for: local dev, VPS deployments (Hetzner etc.)
 *
 *   ORCHESTRATOR=fly
 *     Uses Fly Machines REST API. No Docker socket needed.
 *     Best for: Fly.io production deployment (free tier compatible).
 *     Required env: FLY_API_TOKEN, FLY_APP_NAME
 *
 * Public API (same regardless of backend):
 *   launchMatchContainers(matchId, seed, workspaceSpec) → MatchContainerData
 *   stopMatchContainers(containerData)
 *
 * MatchContainerData is stored in matches.serviceData so proxy routes
 * can resolve internal URLs and stop containers at match end.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ServiceSpec, McpServerSpec, WorkspaceSpec } from "@clawdiators/shared";

const execFileAsync = promisify(execFile);

// ── Shared types ──────────────────────────────────────────────────────

export interface RunningService {
  name: string;
  containerId: string;
  containerName: string;
  /** Internal URL reachable from the API process (for proxy forwarding) */
  internalUrl: string;
  hostPort?: number;
}

export interface RunningMcpServer {
  name: string;
  containerId: string;
  containerName: string;
  internalUrl: string;
  hostPort?: number;
  token: string;
}

/** Stored in matches.serviceData. Used by proxy routes and cleanup. */
export interface MatchContainerData {
  services: RunningService[];
  mcpServers: RunningMcpServer[];
  serviceToken: string;
  launchedAt: string;
  /** Which backend launched these — needed to clean up correctly */
  backend: "docker" | "fly";
}

// ── Shared helpers ────────────────────────────────────────────────────

export function generateMatchToken(): string {
  return `mtk_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHttpHealth(
  internalUrl: string,
  path: string,
  intervalSecs: number,
  timeoutSecs: number,
  startDelaySecs: number,
): Promise<void> {
  if (startDelaySecs > 0) await sleep(startDelaySecs * 1000);

  const deadline = Date.now() + timeoutSecs * 1000;
  const url = `${internalUrl}${path}`;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });
      if (res.ok) return;
    } catch {
      // Not ready yet
    }
    await sleep(intervalSecs * 1000);
  }

  throw new Error(`Health check timed out for ${url} after ${timeoutSecs}s`);
}

function resolveEnv(
  specEnv: Record<string, string> | undefined,
  seed: number,
  matchId: string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(specEnv ?? {}).map(([k, v]) => [
      k,
      v.replace(/\{\{seed\}\}/g, String(seed)).replace(/\{\{match_id\}\}/g, matchId),
    ]),
  );
}

function shortMatchId(matchId: string): string {
  return matchId.replace(/-/g, "").slice(0, 8);
}

// ── Backend: Docker ───────────────────────────────────────────────────
//
// Uses `docker run -d` via execFile. Works on:
//   - Local dev (host Docker daemon)
//   - VPS deployments with /var/run/docker.sock mounted into the API container
//
// Network behaviour:
//   - If DOCKER_NETWORK is set, API is assumed to be inside Docker on that
//     network. Containers are reachable by name (no host port needed).
//   - Otherwise, containers publish a random host port and are reached via
//     localhost:<port> — suitable for running the API directly on the host.

async function dockerStart(
  matchId: string,
  serviceName: string,
  image: string,
  containerPort: number,
  env: Record<string, string>,
  resources: { memory?: string; cpus?: number },
): Promise<{ containerId: string; containerName: string; internalUrl: string; hostPort?: number }> {
  const name = `clw-${shortMatchId(matchId)}-${serviceName}`;
  const inDocker = !!process.env.DOCKER_NETWORK;
  const network = process.env.DOCKER_NETWORK ?? "arena";

  const envFlags = Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
  const portFlags = inDocker ? [] : ["-p", `0:${containerPort}`];

  const { stdout } = await execFileAsync("docker", [
    "run", "-d", "--rm",
    "--name", name,
    "--network", network,
    `--memory=${resources.memory ?? "512m"}`,
    `--cpus=${resources.cpus ?? 1}`,
    "--pids-limit=100",
    ...portFlags,
    ...envFlags,
    image,
  ], { timeout: 30_000 });

  const containerId = stdout.trim();

  if (inDocker) {
    return { containerId, containerName: name, internalUrl: `http://${name}:${containerPort}` };
  }

  const { stdout: portRaw } = await execFileAsync(
    "docker", ["port", containerId, String(containerPort)], { timeout: 5_000 },
  );
  const m = portRaw.trim().match(/:(\d+)$/);
  if (!m) throw new Error(`Could not parse host port for ${name}: "${portRaw.trim()}"`);
  const hostPort = parseInt(m[1], 10);
  return { containerId, containerName: name, internalUrl: `http://localhost:${hostPort}`, hostPort };
}

function dockerStop(containerNames: string[]): void {
  for (const name of containerNames) {
    execFileAsync("docker", ["rm", "-f", name], { timeout: 10_000 }).catch(() => {});
  }
}

// ── Backend: Fly Machines ─────────────────────────────────────────────
//
// Uses the Fly Machines REST API to start and stop containers on Fly.io's
// infrastructure. No Docker socket needed — works on Fly.io free tier.
//
// Required env vars:
//   FLY_API_TOKEN   — Fly API token (get with: fly tokens create deploy)
//   FLY_APP_NAME    — Fly app pre-created to host challenge machines
//                     (create once with: fly apps create clawdiators-arena --machines)
//   FLY_REGION      — Preferred region (default: same region as the API, or "iad")
//
// How it works:
//   1. POST /v1/apps/{appName}/machines → creates a machine, returns private IPv6
//   2. Wait for machine state=started via long-poll
//   3. Internal URL is http://[IPv6]:port (reachable via Fly's 6PN private network)
//   4. On cleanup: DELETE /v1/apps/{appName}/machines/{id}?force=true
//
// Images must be pullable by Fly — Docker Hub public images work directly.

const FLY_API_BASE = "https://api.machines.dev";

async function flyRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const token = process.env.FLY_API_TOKEN;
  if (!token) throw new Error("FLY_API_TOKEN is not set. Required for Fly Machines orchestrator.");

  const res = await fetch(`${FLY_API_BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`Fly API ${method} ${path} → ${res.status}: ${text}`);
  }

  return res;
}

async function flyStart(
  matchId: string,
  serviceName: string,
  image: string,
  containerPort: number,
  env: Record<string, string>,
  resources: { memory?: string; cpus?: number },
): Promise<{ containerId: string; containerName: string; internalUrl: string }> {
  const appName = process.env.FLY_APP_NAME;
  if (!appName) throw new Error("FLY_APP_NAME is not set. Required for Fly Machines orchestrator.");

  const region = process.env.FLY_REGION ?? "iad";
  const memoryMb = parseMemoryToMb(resources.memory ?? "512m");
  const cpus = resources.cpus ?? 1;

  const res = await flyRequest("POST", `/v1/apps/${appName}/machines`, {
    name: `clw-${shortMatchId(matchId)}-${serviceName}`,
    region,
    config: {
      image,
      env,
      guest: {
        cpu_kind: "shared",
        cpus,
        memory_mb: memoryMb,
      },
      // Auto-destroy when process exits (equivalent to docker run --rm)
      auto_destroy: true,
    },
  });

  const machine = await res.json() as { id: string; private_ip?: string; instance_id?: string };

  // Wait for the machine to reach "started" state
  await flyRequest(
    "GET",
    `/v1/apps/${appName}/machines/${machine.id}/wait?state=started&timeout=30`,
  );

  // Fetch machine details to get the private IP
  const detailRes = await flyRequest("GET", `/v1/apps/${appName}/machines/${machine.id}`);
  const detail = await detailRes.json() as { private_ip?: string; id: string };

  const privateIp = detail.private_ip;
  if (!privateIp) throw new Error(`No private_ip for Fly machine ${machine.id}`);

  // IPv6 addresses in URLs must be wrapped in brackets
  const internalUrl = `http://[${privateIp}]:${containerPort}`;

  return {
    containerId: machine.id,
    containerName: `clw-${shortMatchId(matchId)}-${serviceName}`,
    internalUrl,
  };
}

async function flyStop(machineIds: string[]): Promise<void> {
  const appName = process.env.FLY_APP_NAME;
  if (!appName) return;

  for (const id of machineIds) {
    flyRequest("DELETE", `/v1/apps/${appName}/machines/${id}?force=true`).catch(() => {});
  }
}

function parseMemoryToMb(mem: string): number {
  const n = parseInt(mem, 10);
  if (mem.toLowerCase().endsWith("g")) return n * 1024;
  return n; // assume mb
}

// ── Public API ────────────────────────────────────────────────────────

function getBackend(): "docker" | "fly" {
  const v = (process.env.ORCHESTRATOR ?? "docker").toLowerCase();
  return v === "fly" ? "fly" : "docker";
}

type StartFn = (
  matchId: string, name: string, image: string, port: number,
  env: Record<string, string>, resources: { memory?: string; cpus?: number },
) => Promise<{ containerId: string; containerName: string; internalUrl: string; hostPort?: number }>;

/**
 * Launch all services and MCP servers declared in a workspaceSpec.
 * Called from the match entry route before returning to the agent.
 */
export async function launchMatchContainers(
  matchId: string,
  seed: number,
  workspaceSpec: Pick<WorkspaceSpec, "services" | "mcpServers">,
): Promise<MatchContainerData> {
  const backend = getBackend();
  const start: StartFn = backend === "fly" ? flyStart : dockerStart;

  const serviceToken = generateMatchToken();
  const services: RunningService[] = [];
  const mcpServers: RunningMcpServer[] = [];

  // Services start sequentially (may have ordering dependencies)
  for (const spec of workspaceSpec.services ?? []) {
    const port = spec.ports[0]?.container ?? 3000;
    const env: Record<string, string> = {
      SEED: String(seed),
      MATCH_ID: matchId,
      SERVICE_TOKEN: serviceToken,
      PORT: String(port),
      ...resolveEnv(spec.env, seed, matchId),
    };

    const result = await start(matchId, spec.name, spec.image, port, env, {
      memory: spec.resources?.memory,
      cpus: spec.resources?.cpus,
    });

    if (spec.healthCheck) {
      const hc = spec.healthCheck;
      await waitForHttpHealth(
        result.internalUrl, hc.path,
        hc.intervalSecs ?? 2, hc.timeoutSecs ?? 45, hc.startDelaySecs ?? 3,
      );
    }

    services.push({ name: spec.name, ...result });
  }

  // MCP servers start in parallel (no inter-dependencies)
  const mcpResults = await Promise.all(
    (workspaceSpec.mcpServers ?? []).map(async (spec) => {
      const mcpToken = generateMatchToken();
      const port = spec.port ?? 3000;
      const env: Record<string, string> = {
        SEED: String(seed),
        MATCH_ID: matchId,
        MCP_TOKEN: mcpToken,
        PORT: String(port),
        ...resolveEnv(spec.env, seed, matchId),
      };

      const result = await start(matchId, spec.name, spec.image, port, env, {
        memory: spec.resourceLimits?.memory,
        cpus: spec.resourceLimits?.cpus,
      });

      await waitForHttpHealth(
        result.internalUrl, "/health", 2, spec.healthCheckTimeoutSecs ?? 30, 2,
      );

      return { name: spec.name, ...result, token: mcpToken };
    }),
  );

  mcpServers.push(...mcpResults);

  return { services, mcpServers, serviceToken, launchedAt: new Date().toISOString(), backend };
}

/**
 * Stop all containers for a match. Best-effort, never throws.
 * Uses whichever backend originally launched them.
 */
export function stopMatchContainers(data: MatchContainerData): void {
  if (data.backend === "fly") {
    const ids = [
      ...data.services.map((s) => s.containerId),
      ...data.mcpServers.map((m) => m.containerId),
    ];
    flyStop(ids);
  } else {
    const names = [
      ...data.services.map((s) => s.containerName),
      ...data.mcpServers.map((m) => m.containerName),
    ];
    dockerStop(names);
  }
}
