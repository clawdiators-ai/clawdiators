ALTER TABLE matches
  ADD COLUMN proxy_start_token TEXT,
  ADD COLUMN proxy_active_at TIMESTAMPTZ;
