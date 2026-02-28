import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const verificationImages = pgTable("verification_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  tag: text("tag").notNull(),
  digest: text("digest").notNull().unique(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  deprecatedAt: timestamp("deprecated_at", { withTimezone: true }),
  notes: text("notes"),
});

export type VerificationImage = typeof verificationImages.$inferSelect;
export type NewVerificationImage = typeof verificationImages.$inferInsert;
