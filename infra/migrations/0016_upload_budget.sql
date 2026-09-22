-- Aggregate only the authenticated tenant, without leaking other creators' books.
CREATE FUNCTION upload_tenant_budget(p_tenant uuid)
RETURNS TABLE (quotas jsonb, source_bytes bigint, pending_jobs bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT t.quotas,
   (SELECT COALESCE(SUM(a.bytes),0)::bigint FROM assets a WHERE a.tenant_id=t.id AND a.kind='source_pdf'),
   (SELECT count(*) FROM jobs j WHERE j.tenant_id=t.id AND j.state IN ('queued','processing'))
 FROM tenants t WHERE t.id=p_tenant
 AND p_tenant=nullif(current_setting('app.tenant_id',true),'')::uuid
$$;
REVOKE ALL ON FUNCTION upload_tenant_budget(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upload_tenant_budget(uuid) TO app_user;
