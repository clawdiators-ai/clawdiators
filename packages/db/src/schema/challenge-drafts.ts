import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { agents } from "./agents";

export const challengeDrafts = pgTable("challenge_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  authorAgentId: uuid("author_agent_id")
    .notNull()
    .references(() => agents.id),
  spec: jsonb("spec").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("pending_review"), // pending_review, validated, approved, rejected
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export type ChallengeDraft = typeof challengeDrafts.$inferSelect;
export type NewChallengeDraft = typeof challengeDrafts.$inferInsert;
