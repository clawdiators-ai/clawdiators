import { verificationImages } from "./schema/index.js";

export const DEV_DIGEST =
  "sha256:devdigest0000000000000000000000000000000000000000000000000000000";

/**
 * Seed a development/test verification image so tests can use a known digest.
 * Called from seed.ts during `pnpm db:seed`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seedVerificationImages(db: any): Promise<void> {
  await db
    .insert(verificationImages)
    .values({
      tag: "arena-runner:dev",
      digest: DEV_DIGEST,
      notes: "Development/test placeholder. Not a real image.",
    })
    .onConflictDoNothing();

  console.log("Seeded verification images (dev digest).");
}
