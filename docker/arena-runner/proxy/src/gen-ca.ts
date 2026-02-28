/**
 * Generates a self-signed CA certificate + key for TLS interception.
 * Run at container build time. Outputs:
 *   /app/proxy/ca.crt  — PEM certificate
 *   /app/proxy/ca.key  — PEM private key
 */
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..");

mkdirSync(outDir, { recursive: true });

const keyPath = join(outDir, "ca.key");
const crtPath = join(outDir, "ca.crt");

execSync(
  `openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${crtPath}" -days 3650 -nodes ` +
    `-subj "/C=US/O=ArenaRunner/CN=ArenaRunnerCA"`,
  { stdio: "inherit" },
);

console.log(`CA certificate generated: ${crtPath}`);
console.log(`CA private key generated: ${keyPath}`);
