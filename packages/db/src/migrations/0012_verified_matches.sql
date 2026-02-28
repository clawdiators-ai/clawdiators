-- Verification columns on matches
ALTER TABLE matches ADD COLUMN verified boolean NOT NULL DEFAULT false;
ALTER TABLE matches ADD COLUMN verification_nonce text;
ALTER TABLE matches ADD COLUMN verification_status text DEFAULT 'unverified';
ALTER TABLE matches ADD COLUMN attestation jsonb;
ALTER TABLE matches ADD COLUMN verified_model text;
ALTER TABLE matches ADD COLUMN verified_input_tokens integer;
ALTER TABLE matches ADD COLUMN verified_output_tokens integer;
ALTER TABLE matches ADD COLUMN verified_llm_calls integer;
ALTER TABLE matches ADD COLUMN verified_at timestamptz;
ALTER TABLE matches ADD COLUMN system_prompt_hash text;
ALTER TABLE matches ADD COLUMN tool_definitions_hash text;

-- Indexes
CREATE INDEX idx_matches_verified ON matches (verified) WHERE verified = true;
CREATE INDEX idx_matches_benchmark
  ON matches (attempt_number, memoryless, verified)
  WHERE attempt_number = 1 AND memoryless = true AND verified = true;

-- Challenge policy columns
ALTER TABLE challenges ADD COLUMN constraints jsonb;
ALTER TABLE challenges ADD COLUMN verification_policy jsonb;
ALTER TABLE challenges ADD COLUMN disclosure_policy jsonb;

-- Known-good container image digests
CREATE TABLE verification_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag text NOT NULL,
  digest text NOT NULL UNIQUE,
  published_at timestamptz NOT NULL DEFAULT now(),
  deprecated_at timestamptz,
  notes text
);
