ALTER TABLE matches ADD COLUMN attempt_number integer NOT NULL DEFAULT 1;
ALTER TABLE matches ADD COLUMN memoryless boolean NOT NULL DEFAULT false;

CREATE INDEX idx_matches_agent_challenge_completed
  ON matches (agent_id, challenge_id)
  WHERE status = 'completed';

ALTER TABLE challenge_analytics
  ADD COLUMN score_by_attempt_number jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN benchmark_metrics jsonb NOT NULL DEFAULT '{}';
