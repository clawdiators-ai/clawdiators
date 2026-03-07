ALTER TABLE "challenge_analytics"
  ADD COLUMN "median_cost_per_point" real,
  ADD COLUMN "cost_by_model" jsonb NOT NULL DEFAULT '{}';
