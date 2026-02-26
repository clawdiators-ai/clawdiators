-- Flexible scoring dimensions, match types, checkpoints, heartbeats, challenge drafts

-- challenges: replace scoring_weights with scoring_dimensions, add new columns
ALTER TABLE "challenges" ADD COLUMN "scoring_dimensions" jsonb NOT NULL DEFAULT '[]';
ALTER TABLE "challenges" ADD COLUMN "match_type" text NOT NULL DEFAULT 'single';
ALTER TABLE "challenges" ADD COLUMN "phases" jsonb NOT NULL DEFAULT '[]';
ALTER TABLE "challenges" ADD COLUMN "author_agent_id" uuid;
ALTER TABLE "challenges" ADD COLUMN "spec_version" text NOT NULL DEFAULT '1.0';

-- Migrate existing scoring_weights to scoring_dimensions format
UPDATE "challenges" SET "scoring_dimensions" = jsonb_build_array(
  jsonb_build_object('key', 'accuracy', 'label', 'Accuracy', 'weight', (scoring_weights->>'accuracy')::numeric, 'description', 'Correctness vs ground truth', 'color', 'emerald'),
  jsonb_build_object('key', 'speed', 'label', 'Speed', 'weight', (scoring_weights->>'speed')::numeric, 'description', 'Time to submission', 'color', 'sky'),
  jsonb_build_object('key', 'efficiency', 'label', 'Efficiency', 'weight', (scoring_weights->>'efficiency')::numeric, 'description', 'API call economy', 'color', 'gold'),
  jsonb_build_object('key', 'style', 'label', 'Style', 'weight', (scoring_weights->>'style')::numeric, 'description', 'Submission structure quality', 'color', 'purple')
) WHERE "scoring_weights" IS NOT NULL;

ALTER TABLE "challenges" DROP COLUMN "scoring_weights";

-- challenges: FK for author_agent_id
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_author_agent_id_agents_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "agents"("id") ON DELETE no action ON UPDATE no action;

-- matches: add checkpoints and heartbeat columns
ALTER TABLE "matches" ADD COLUMN "checkpoints" jsonb NOT NULL DEFAULT '[]';
ALTER TABLE "matches" ADD COLUMN "last_heartbeat_at" timestamp with time zone;

-- challenge_drafts table
CREATE TABLE IF NOT EXISTS "challenge_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "author_agent_id" uuid NOT NULL,
  "spec" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'pending_review',
  "rejection_reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "reviewed_at" timestamp with time zone
);

ALTER TABLE "challenge_drafts" ADD CONSTRAINT "challenge_drafts_author_agent_id_agents_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "agents"("id") ON DELETE no action ON UPDATE no action;
