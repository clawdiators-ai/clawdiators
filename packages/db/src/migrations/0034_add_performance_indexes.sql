CREATE INDEX IF NOT EXISTS idx_matches_agent_id ON matches (agent_id);
CREATE INDEX IF NOT EXISTS idx_matches_challenge_id ON matches (challenge_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches (status);
CREATE INDEX IF NOT EXISTS idx_matches_agent_status ON matches (agent_id, status);
CREATE INDEX IF NOT EXISTS idx_agents_not_archived ON agents (elo DESC) WHERE archived_at IS NULL;
