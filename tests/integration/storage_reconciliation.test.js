"use strict";

// This test runs inside worker-convert. It proves that maintenance never deletes a
// DB-referenced attempt, removes only an old unreferenced attempt, and persists
// logical/physical accounting for the tenant.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Pool } = require("pg");
const { reconcileStorage, pool: reconcilerPool } = require("/app/src/storage-reconciler.js");
const worker = require("/app/src/index.js");

const root = path.resolve(process.env.STORAGE_ROOT);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
let passed = 0;

function check(label, condition) {
  assert.ok(condition, label);
  passed += 1;
  console.log(`PASS ${label}`);
}

async function adminTx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.is_system_admin','true',true)");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const bookId = randomUUID();
  const revisionId = randomUUID();
  const quotaRevisionId = randomUUID();
  const quotaJobId = randomUUID();
  const quotaLeaseToken = randomUUID();
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  const keepPrefix = `${tenantId}/${bookId}/${revisionId}/attempts/keep-attempt`;
  const orphanPrefix = `${tenantId}/${bookId}/${revisionId}/attempts/orphan-attempt`;
  const keepFile = path.join(root, keepPrefix, "pages/page.webp");
  const orphanDirectory = path.join(root, orphanPrefix);

  try {
    await adminTx(async (client) => {
      await client.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'unused')", [userId, `${userId}@storage.invalid`]);
      await client.query("INSERT INTO tenants(id,name) VALUES($1,'Storage reconciliation test')", [tenantId]);
      await client.query(
        "INSERT INTO books(id,tenant_id,owner_id,title,permalink_slug,permalink_suffix,status) VALUES($1,$2,$3,'Storage','storage',$4,'published')",
        [bookId, tenantId, userId, suffix]
      );
      await client.query(
        "INSERT INTO revisions(id,tenant_id,book_id,revision_number,source_key,checksum,pipeline_version,state) VALUES($1,$2,$3,1,'source.pdf','checksum','v1','ready')",
        [revisionId, tenantId, bookId]
      );
      await client.query("UPDATE books SET published_revision_id=$1 WHERE id=$2", [revisionId, bookId]);
    });

    await fs.mkdir(path.dirname(keepFile), { recursive: true });
    await fs.writeFile(keepFile, "keep-me");
    await fs.mkdir(orphanDirectory, { recursive: true });
    await fs.writeFile(path.join(orphanDirectory, "unused.webp"), "remove-me");
    const stale = new Date(Date.now() - 10_000);
    await fs.utimes(orphanDirectory, stale, stale);

    await adminTx((client) => client.query(
      "INSERT INTO assets(tenant_id,book_id,revision_id,kind,object_key,content_type,bytes) VALUES($1,$2,$3,'page_image',$4,'image/webp',$5)",
      [tenantId, bookId, revisionId, `${keepPrefix}/pages/page.webp`, Buffer.byteLength("keep-me")]
    ));

    const result = await reconcileStorage({ retentionSeconds: 1 });
    check("reconciler acquired the singleton lock and scanned storage", !result.skipped && result.tenantsScanned >= 1);
    check("referenced attempt remains on disk", await fs.stat(keepFile).then(() => true, () => false));
    check("old unreferenced attempt is removed", await fs.stat(orphanDirectory).then(() => false, (err) => err.code === "ENOENT"));
    check("reconciler reports one removed path", result.deletedPaths >= 1 && result.deletedBytes >= Buffer.byteLength("remove-me"));

    const usage = await adminTx((client) => client.query("SELECT source_bytes,logical_bytes,physical_bytes,unattributed_bytes FROM tenant_storage_usage WHERE tenant_id=$1", [tenantId]));
    check(
      "logical and physical usage are persisted without negative unattributed bytes",
      usage.rows.length === 1 && Number(usage.rows[0].logical_bytes) === Buffer.byteLength("keep-me") &&
        Number(usage.rows[0].physical_bytes) >= Number(usage.rows[0].logical_bytes) && Number(usage.rows[0].unattributed_bytes) >= 0
    );
    const run = await adminTx((client) => client.query("SELECT status FROM storage_reconciliation_runs ORDER BY id DESC LIMIT 1"));
    check("maintenance run is recorded as succeeded", run.rows[0]?.status === "succeeded");

    const quotaOutput = `${tenantId}/${bookId}/${quotaRevisionId}/attempts/${quotaLeaseToken}`;
    await fs.mkdir(path.join(root, quotaOutput, "pages"), { recursive: true });
    await fs.writeFile(path.join(root, quotaOutput, "pages/page-001-reading.webp"), "rendered-over-quota");
    await adminTx(async (client) => {
      // Existing logical asset is 7 bytes. The rendered file + manifest cannot fit in
      // this 8-byte tenant cap, so the worker must fail the job and remove only its
      // private attempt output after committing that terminal state.
      await client.query("UPDATE tenants SET quotas=$2::jsonb WHERE id=$1", [tenantId, JSON.stringify({ storage_bytes: 8 })]);
      await client.query(
        "INSERT INTO revisions(id,tenant_id,book_id,revision_number,source_key,checksum,pipeline_version,state) VALUES($1,$2,$3,2,'source-2.pdf','checksum-2','v1','converting')",
        [quotaRevisionId, tenantId, bookId]
      );
      await client.query(
        `INSERT INTO jobs(id,tenant_id,book_id,revision_id,idempotency_key,state,dispatch_generation,lease_token,lease_expires_at)
         VALUES($1,$2,$3,$4,$5,'processing',1,$6,now()+interval '60 seconds')`,
        [quotaJobId, tenantId, bookId, quotaRevisionId, quotaJobId, quotaLeaseToken]
      );
    });
    const quotaResult = await worker.finalizeSuccess(
      { job_id: quotaJobId, tenant_id: tenantId, book_id: bookId, revision_id: quotaRevisionId, lease_token: quotaLeaseToken },
      quotaOutput,
      { n_pages: 1, pages: [{ page: 1, images: { reading: "pages/page-001-reading.webp" } }] }
    );
    check("worker rejects derived output that would exceed tenant storage quota", quotaResult === false);
    const quotaState = await adminTx((client) => client.query(
      "SELECT (SELECT state FROM jobs WHERE id=$1) AS job_state, (SELECT state FROM revisions WHERE id=$2) AS revision_state, (SELECT count(*) FROM assets WHERE revision_id=$2) AS assets",
      [quotaJobId, quotaRevisionId]
    ));
    check(
      "quota rejection is terminal and leaves no derived asset row",
      quotaState.rows[0].job_state === "failed" && quotaState.rows[0].revision_state === "failed" && Number(quotaState.rows[0].assets) === 0
    );
    check("quota rejection removes only its unreferenced attempt output", await fs.stat(path.join(root, quotaOutput)).then(() => false, (err) => err.code === "ENOENT"));
    console.log(`STORAGE RECONCILIATION: ${passed} PASS`);
  } finally {
    await adminTx(async (client) => {
      await client.query("UPDATE books SET published_revision_id=NULL WHERE id=$1", [bookId]);
      await client.query("DELETE FROM jobs WHERE tenant_id=$1", [tenantId]);
      await client.query("DELETE FROM assets WHERE tenant_id=$1", [tenantId]);
      await client.query("DELETE FROM revisions WHERE tenant_id=$1", [tenantId]);
      await client.query("DELETE FROM books WHERE id=$1", [bookId]);
      await client.query("DELETE FROM tenants WHERE id=$1", [tenantId]);
      await client.query("DELETE FROM users WHERE id=$1", [userId]);
    }).catch(() => undefined);
    await fs.rm(path.join(root, tenantId), { recursive: true, force: true });
    await pool.end();
    await worker.pool.end();
    await reconcilerPool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
