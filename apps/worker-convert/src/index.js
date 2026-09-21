"use strict";
for (const name of ["DATABASE_URL","REDIS_URL","STORAGE_ROOT","PDF_WORKER_URL","INTERNAL_API_TOKEN"]) {
  if (!process.env[name]) throw new Error('Missing environment: ' + name);
}
const { randomUUID } = require("crypto");
const path = require("path");
const fs = require("fs/promises");
const { Pool } = require("pg");
const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const STORAGE_ROOT = path.resolve(process.env.STORAGE_ROOT);
const LEASE_SECONDS = Number(process.env.JOB_LEASE_SECONDS ?? 60);
const MAX_ATTEMPTS = Number(process.env.JOB_ATTEMPTS ?? 3);
const HTTP_TIMEOUT_MS = (Number(process.env.PDF_TIMEOUT_SECONDS ?? 600) + 30) * 1000;
if (!(LEASE_SECONDS >= 15 && MAX_ATTEMPTS >= 1)) throw new Error("Invalid job limits");

async function withAdminTx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.is_system_admin', 'true', true)");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally { client.release(); }
}

async function claimAttempt(jobId, generation) {
  return withAdminTx(async client => {
    const token = randomUUID();
    const { rows } = await client.query(`
      UPDATE jobs SET lease_token=$3, lease_expires_at=now()+$4*interval '1 second',
        attempts=attempts+1, updated_at=now()
      WHERE id=$1 AND dispatch_generation=$2 AND state='processing'
        AND lease_token IS NULL AND lease_expires_at > now()
      RETURNING id AS job_id, tenant_id, book_id, revision_id, attempts, lease_token`,
      [jobId, generation, token, LEASE_SECONDS]);
    if (!rows.length) return null;
    const ctx = rows[0];
    const rev = await client.query(`UPDATE revisions SET state='converting'
      WHERE id=$1 AND state IN ('pending','converting','failed')
      RETURNING source_key,pipeline_version`, [ctx.revision_id]);
    if (!rev.rows.length) {
      // A previously completed revision is never re-rendered or overwritten.
      await client.query("UPDATE jobs SET state='done', progress=100, lease_token=NULL, lease_expires_at=NULL WHERE id=$1", [jobId]);
      return null;
    }
    return { ...ctx, ...rev.rows[0] };
  });
}

async function heartbeat(ctx) {
  return withAdminTx(async client => {
    const result = await client.query(`UPDATE jobs SET lease_expires_at=now()+$3*interval '1 second'
      WHERE id=$1 AND lease_token=$2 AND state='processing' AND lease_expires_at>now()`,
      [ctx.job_id, ctx.lease_token, LEASE_SECONDS]);
    return result.rowCount === 1;
  });
}

async function lockOwnedJob(client, ctx) {
  const result = await client.query(`SELECT id FROM jobs WHERE id=$1 AND state='processing'
    AND lease_token=$2 AND lease_expires_at>now() FOR UPDATE`, [ctx.job_id, ctx.lease_token]);
  return result.rowCount === 1;
}

async function finalizeSuccess(ctx, outputKey, manifest) {
  // Output key belongs exclusively to this lease. No shared derived/ directory.
  if (!Array.isArray(manifest.pages) || manifest.pages.length !== manifest.n_pages) throw new Error("Invalid manifest");
  const manifestKey = `${outputKey}/manifest.json`;
  const outputPath = path.join(STORAGE_ROOT, outputKey);
  const assets = [];
  for (const page of manifest.pages) {
    for (const [variant, rel] of Object.entries(page.images)) {
      const full = path.resolve(outputPath, rel);
      if (!full.startsWith(outputPath + path.sep)) throw new Error("Invalid asset path");
      const stat = await fs.stat(full);
      assets.push([variant === "thumb" ? "thumbnail" : "page_image", `${outputKey}/${rel}`,
        rel.endsWith(".webp") ? "image/webp" : "image/jpeg", stat.size]);
    }
  }
  // Once present, the file is immutable, including duplicate completion calls.
  await fs.writeFile(path.join(STORAGE_ROOT, manifestKey), JSON.stringify(manifest), { flag: "wx" })
    .catch(err => { if (err.code !== "EEXIST") throw err; });
  assets.push(["manifest", manifestKey, "application/json", (await fs.stat(path.join(STORAGE_ROOT, manifestKey))).size]);
  return withAdminTx(async client => {
    if (!await lockOwnedJob(client, ctx)) return false;
    const revision = await client.query(`UPDATE revisions SET state='ready', manifest_key=$2
      WHERE id=$1 AND state='converting' RETURNING id`, [ctx.revision_id, manifestKey]);
    if (!revision.rows.length) throw new Error("Revision no longer converting");
    for (const [kind, key, type, bytes] of assets) {
      await client.query(`INSERT INTO assets (tenant_id,book_id,revision_id,kind,object_key,content_type,bytes)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [ctx.tenant_id,ctx.book_id,ctx.revision_id,kind,key,type,bytes]);
    }
    await client.query(`UPDATE jobs SET state='done',progress=100,error=NULL,
      lease_token=NULL,lease_expires_at=NULL WHERE id=$1`, [ctx.job_id]);
    return true;
  });
}

async function finalizeFailure(ctx, message, permanent = true, busy = false) {
  return withAdminTx(async client => {
    if (!await lockOwnedJob(client, ctx)) return false;
    const terminal = permanent || (!busy && ctx.attempts >= MAX_ATTEMPTS);
    await client.query(`UPDATE revisions SET state=$2 WHERE id=$1 AND state='converting'`,
      [ctx.revision_id, terminal ? "failed" : "pending"]);
    await client.query(`UPDATE jobs SET state=$2,error=$3,lease_token=NULL,lease_expires_at=NULL,
      attempts=attempts-$4,available_at=now()+interval '5 seconds' WHERE id=$1`,
      [ctx.job_id,terminal ? "failed" : "queued",message.slice(0,1000),busy ? 1 : 0]);
    return true;
  });
}

async function processJob(bullJob) {
  const ctx = await claimAttempt(bullJob.data.jobId, bullJob.data.generation);
  if (!ctx) return;
  const outputKey = `${ctx.tenant_id}/${ctx.book_id}/${ctx.revision_id}/attempts/${ctx.lease_token}`;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  let beating = false;
  const timer = setInterval(async () => {
    if (beating) return;
    beating = true;
    try { if (!await heartbeat(ctx)) controller.abort(); }
    catch { controller.abort(); }
    finally { beating = false; }
  }, Math.floor(LEASE_SECONDS * 1000 / 3));
  try {
    const response = await fetch(`${process.env.PDF_WORKER_URL}/internal/convert`, {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type":"application/json", "x-internal-token":process.env.INTERNAL_API_TOKEN },
      body: JSON.stringify({source_key:ctx.source_key,output_key:outputKey,pipeline_version:ctx.pipeline_version})
    });
    if (response.status === 503) {
      await finalizeFailure(ctx, "PDF worker busy; retry scheduled", false, true);
      return;
    }
    if (!response.ok) throw new Error(`pdf-worker HTTP ${response.status}`);
    const result = await response.json();
    if (result.status === "error") await finalizeFailure(ctx, `${result.reason}: ${result.message}`);
    else await finalizeSuccess(ctx, outputKey, result.manifest);
  } catch (err) {
    await finalizeFailure(ctx, `Conversion interrupted: ${err.message}`, false);
  } finally {
    clearTimeout(deadline);
    clearInterval(timer);
    // On DB/network ambiguity keep files; never risk deleting a committed result.
    // Orphan attempt collection requires a separate retention-aware maintenance job.
  }
}

async function main() {
  const connection = new IORedis(process.env.REDIS_URL, {maxRetriesPerRequest:null});
  const worker = new Worker("pdf-conversion", processJob, {connection,concurrency:Number(process.env.CONCURRENCY ?? 2)});
  worker.on("failed", (job, err) => console.error(`Job ${job?.id}: ${err.message}`));
  const shutdown = async () => { await worker.close(); connection.disconnect(); await pool.end(); process.exit(0); };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
if (require.main === module) main().catch(err => { console.error(err); process.exit(1); });
module.exports = { claimAttempt, heartbeat, finalizeSuccess, finalizeFailure, withAdminTx, pool };
