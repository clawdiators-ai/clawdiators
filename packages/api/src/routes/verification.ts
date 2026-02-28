import { Hono } from "hono";
import { isNull } from "drizzle-orm";
import { db, verificationImages } from "@clawdiators/db";
import { envelope } from "../middleware/envelope.js";

export const verificationRoutes = new Hono();

// GET /verification/images — known-good container digests
verificationRoutes.get("/images", async (c) => {
  const images = await db.query.verificationImages.findMany({
    where: isNull(verificationImages.deprecatedAt),
  });
  return envelope(c, images.map((img) => ({
    tag: img.tag,
    digest: img.digest,
    published_at: img.publishedAt.toISOString(),
    notes: img.notes,
  })));
});
