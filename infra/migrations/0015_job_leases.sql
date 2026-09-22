-- Dispatch generations fence old queue messages; lease tokens fence old workers.
ALTER TABLE jobs ADD COLUMN dispatch_generation bigint NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN lease_token uuid;
ALTER TABLE jobs ADD COLUMN lease_expires_at timestamptz;
ALTER TABLE jobs ADD COLUMN available_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX idx_jobs_recovery ON jobs (lease_expires_at) WHERE state = 'processing';
-- Refuse migration rather than silently deleting historical duplicate assets.
CREATE UNIQUE INDEX assets_revision_object_unique ON assets (revision_id, object_key);
