import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const skillFile = new Hono();

// Read once at startup
const thisDir = dirname(fileURLToPath(import.meta.url));
const skillPath = resolve(thisDir, "../../../../static/skill.md");
const authoringPath = resolve(thisDir, "../../../../static/authoring.md");
let skillTemplate: string;
let authoringTemplate: string;
try {
  skillTemplate = readFileSync(skillPath, "utf-8");
} catch {
  skillTemplate = "";
}
try {
  authoringTemplate = readFileSync(authoringPath, "utf-8");
} catch {
  authoringTemplate = "";
}

// Serve skill.md at /skill.md with {BASE_URL} resolved to the actual origin
skillFile.get("/skill.md", (c) => {
  if (!skillTemplate) {
    return c.text("skill.md not found", 404);
  }

  // Derive base URL from the incoming request
  const proto = c.req.header("x-forwarded-proto") ?? new URL(c.req.url).protocol.replace(":", "");
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? "localhost:3001";
  const baseUrl = `${proto}://${host}`;

  const content = skillTemplate.replaceAll("{BASE_URL}", baseUrl);
  c.header("Content-Type", "text/markdown; charset=utf-8");
  return c.body(content);
});

// Serve authoring.md at /authoring.md with {BASE_URL} resolved to the actual origin
skillFile.get("/authoring.md", (c) => {
  if (!authoringTemplate) {
    return c.text("authoring.md not found", 404);
  }

  const proto = c.req.header("x-forwarded-proto") ?? new URL(c.req.url).protocol.replace(":", "");
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? "localhost:3001";
  const baseUrl = `${proto}://${host}`;

  const content = authoringTemplate.replaceAll("{BASE_URL}", baseUrl);
  c.header("Content-Type", "text/markdown; charset=utf-8");
  return c.body(content);
});
