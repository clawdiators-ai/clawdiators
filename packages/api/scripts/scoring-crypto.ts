#!/usr/bin/env tsx
/**
 * Encrypt/decrypt challenge scoring files (scorer.ts, data.ts).
 *
 * Usage:
 *   SCORING_KEY=<64-char-hex> tsx scoring-crypto.ts encrypt
 *   SCORING_KEY=<64-char-hex> tsx scoring-crypto.ts decrypt
 *   SCORING_KEY=<64-char-hex> tsx scoring-crypto.ts status
 *
 * Format: [16-byte IV][16-byte auth tag][ciphertext]  (AES-256-GCM)
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ALGORITHM = "aes-256-gcm";
const IV_LEN = 16;
const TAG_LEN = 16;
const SCORING_FILES = ["scorer.ts", "data.ts"];
const SKIP_DIRS = new Set(["_template", "community", "primitives"]);

const challengesDir = resolve(import.meta.dirname ?? __dirname, "../src/challenges");

function getKey(required: boolean = true): Buffer | null {
  const hex = process.env.SCORING_KEY;
  if (!hex || hex.length !== 64) {
    if (!required) return null;
    console.error("ERROR: SCORING_KEY env var must be a 64-character hex string (32 bytes).");
    process.exit(1);
  }
  return Buffer.from(hex, "hex");
}

function encrypt(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

function decrypt(blob: Buffer, key: Buffer): Buffer {
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** List challenge directories that should have encrypted scoring files. */
function listChallengeDirs(): string[] {
  return readdirSync(challengesDir)
    .filter((name) => {
      if (SKIP_DIRS.has(name)) return false;
      const full = join(challengesDir, name);
      return statSync(full).isDirectory();
    })
    .sort();
}

type FileStatus = "encrypted" | "decrypted" | "both-synced" | "both-out-of-sync" | "missing";

function getFileStatus(dir: string, file: string, key: Buffer): FileStatus {
  const plainPath = join(challengesDir, dir, file);
  const encPath = `${plainPath}.enc`;
  const hasPlain = existsSync(plainPath);
  const hasEnc = existsSync(encPath);

  if (!hasPlain && !hasEnc) return "missing";
  if (hasPlain && !hasEnc) return "decrypted";
  if (!hasPlain && hasEnc) return "encrypted";

  // Both exist — check if they match
  const plainContent = readFileSync(plainPath);
  const encContent = readFileSync(encPath);
  try {
    const decrypted = decrypt(encContent, key);
    return sha256(decrypted) === sha256(plainContent) ? "both-synced" : "both-out-of-sync";
  } catch {
    return "both-out-of-sync";
  }
}

function doEncrypt() {
  const key = getKey();
  const dirs = listChallengeDirs();
  let count = 0;

  for (const dir of dirs) {
    for (const file of SCORING_FILES) {
      const plainPath = join(challengesDir, dir, file);
      if (!existsSync(plainPath)) continue;

      const encPath = `${plainPath}.enc`;
      const plainContent = readFileSync(plainPath);

      // Skip if .enc exists and matches
      if (existsSync(encPath)) {
        try {
          const existing = decrypt(readFileSync(encPath), key);
          if (sha256(existing) === sha256(plainContent)) {
            continue; // already in sync
          }
        } catch {
          // re-encrypt
        }
      }

      const blob = encrypt(plainContent, key);
      writeFileSync(encPath, blob);
      count++;
      console.log(`  encrypted: ${dir}/${file}`);
    }
  }

  console.log(`\nEncrypted ${count} file(s).`);
}

function doDecrypt() {
  const key = getKey(false);
  if (!key) {
    console.log("SKIP: SCORING_KEY not set, skipping decryption.");
    return;
  }
  const dirs = listChallengeDirs();
  let count = 0;

  for (const dir of dirs) {
    for (const file of SCORING_FILES) {
      const encPath = join(challengesDir, dir, `${file}.enc`);
      if (!existsSync(encPath)) continue;

      const plainPath = join(challengesDir, dir, file);
      const encContent = readFileSync(encPath);

      let decrypted: Buffer;
      try {
        decrypted = decrypt(encContent, key);
      } catch (err) {
        console.error(`  FAILED: ${dir}/${file}.enc — bad key or corrupted file`);
        continue;
      }

      // Skip if plaintext already matches
      if (existsSync(plainPath)) {
        const existing = readFileSync(plainPath);
        if (sha256(existing) === sha256(decrypted)) {
          continue;
        }
      }

      writeFileSync(plainPath, decrypted);
      count++;
      console.log(`  decrypted: ${dir}/${file}`);
    }
  }

  console.log(`\nDecrypted ${count} file(s).`);
}

function doStatus() {
  const key = getKey(false);
  if (!key) {
    console.log("SKIP: SCORING_KEY not set, cannot check scoring file status.");
    return;
  }
  const dirs = listChallengeDirs();

  const symbols: Record<FileStatus, string> = {
    "both-synced": "OK",
    encrypted: "ENC-ONLY",
    decrypted: "PLAIN-ONLY",
    "both-out-of-sync": "OUT-OF-SYNC",
    missing: "MISSING",
  };

  let issues = 0;

  for (const dir of dirs) {
    for (const file of SCORING_FILES) {
      const status = getFileStatus(dir, file, key);
      const label = symbols[status];
      const prefix = status === "both-synced" ? "  " : "! ";
      if (status !== "both-synced") issues++;
      console.log(`${prefix}[${label.padEnd(12)}] ${dir}/${file}`);
    }
  }

  console.log(`\n${issues === 0 ? "All files in sync." : `${issues} file(s) need attention.`}`);
  process.exit(issues > 0 ? 1 : 0);
}

const command = process.argv[2];

switch (command) {
  case "encrypt":
    doEncrypt();
    break;
  case "decrypt":
    doDecrypt();
    break;
  case "status":
    doStatus();
    break;
  default:
    console.error("Usage: scoring-crypto.ts <encrypt|decrypt|status>");
    console.error("  Requires SCORING_KEY env var (64-char hex, 32 bytes).");
    process.exit(1);
}
