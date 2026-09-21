-- Logical asset accounting is authoritative for quota admission. Physical bytes are
-- measured by the reconciler because local object storage can also contain safe-to-
-- retain failed attempts while a transaction outcome is uncertain.
CREATE TABLE tenant_storage_usage (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  source_bytes bigint NOT NULL DEFAULT 0 CHECK (source_bytes >= 0),
  logical_bytes bigint NOT NULL DEFAULT 0 CHECK (logical_bytes >= 0),
  physical_bytes bigint NOT NULL DEFAULT 0 CHECK (physical_bytes >= 0),
  unattributed_bytes bigint NOT NULL DEFAULT 0 CHECK (unattributed_bytes >= 0),
  reconciled_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE storage_reconciliation_runs (
  id bigserial PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'skipped')),
  tenants_scanned integer NOT NULL DEFAULT 0 CHECK (tenants_scanned >= 0),
  deleted_paths integer NOT NULL DEFAULT 0 CHECK (deleted_paths >= 0),
  deleted_bytes bigint NOT NULL DEFAULT 0 CHECK (deleted_bytes >= 0),
  error text
);
CREATE INDEX idx_storage_reconciliation_runs_finished ON storage_reconciliation_runs (finished_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_storage_usage, storage_reconciliation_runs TO app_user;
GRANT USAGE, SELECT ON SEQUENCE storage_reconciliation_runs_id_seq TO app_user;

ALTER TABLE tenant_storage_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_storage_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_storage_usage_admin_all ON tenant_storage_usage
  USING (current_setting('app.is_system_admin', true)::boolean IS TRUE)
  WITH CHECK (current_setting('app.is_system_admin', true)::boolean IS TRUE);

ALTER TABLE storage_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_reconciliation_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY storage_reconciliation_runs_admin_all ON storage_reconciliation_runs
  USING (current_setting('app.is_system_admin', true)::boolean IS TRUE)
  WITH CHECK (current_setting('app.is_system_admin', true)::boolean IS TRUE);

-- Keep the existing function name so upload admission remains one narrowly scoped
-- SECURITY DEFINER call. Add logical_bytes without trusting a periodically refreshed
-- physical scan for a transactional quota decision.
DROP FUNCTION upload_tenant_budget(uuid);
CREATE FUNCTION upload_tenant_budget(p_tenant uuid)
RETURNS TABLE (quotas jsonb, source_bytes bigint, logical_bytes bigint, pending_jobs bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT t.quotas,
   (SELECT COALESCE(SUM(a.bytes),0)::bigint FROM assets a WHERE a.tenant_id=t.id AND a.kind='source_pdf'),
   (SELECT COALESCE(SUM(a.bytes),0)::bigint FROM assets a WHERE a.tenant_id=t.id),
   (SELECT count(*) FROM jobs j WHERE j.tenant_id=t.id AND j.state IN ('queued','processing'))
 FROM tenants t WHERE t.id=p_tenant
 AND p_tenant=nullif(current_setting('app.tenant_id',true),'')::uuid
$$;
REVOKE ALL ON FUNCTION upload_tenant_budget(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upload_tenant_budget(uuid) TO app_user;
