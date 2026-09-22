"use strict";

/**
 * Reconcile local object storage without trusting paths from the filesystem.
 * The database remains the authority: a candidate directory is deleted only when
 * no asset object_key references it and it has exceeded the retention window.
 */
const fs = require("fs/promises");
const path = require("path");
const { Pool } = require("pg");

const STORAGE_ROOT = path.resolve(process.env.STORAGE_ROOT || "/data/storage");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const UUID_DIR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCK_NAME = "misa_flipbook_storage_reconciler_v1";

function configuredPositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function keyFromPath(absolutePath) {
  const relative = path.relative(STORAGE_ROOT, absolutePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Unsafe storage path.");
  return relative.split(path.sep).join("/");
}

async function safeEntries(directory) {
  try {
    return await fs.readdir(directory, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }
}

async function directoryBytes(directory) {
  let bytes = 0;
  for (const entry of await safeEntries(directory)) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      bytes += await directoryBytes(child);
    } else if (entry.isFile()) {
      bytes += (await fs.stat(child)).size;
    }
    // Never follow symlinks. They are neither counted nor removed by this worker.
  }
  return bytes;
}

function isReferenced(prefix, objectKeys) {
  const normalized = `${prefix}/`;
  return objectKeys.some((objectKey) => objectKey === prefix || objectKey.startsWith(normalized));
}

async function removeStaleUnreferenced(directory, objectKeys, cutoffMs) {
  let stat;
  try {
    stat = await fs.lstat(directory);
  } catch (err) {
    if (err && err.code === "ENOENT") return { deletedPaths: 0, deletedBytes: 0 };
    throw err;
  }
  if (!stat.isDirectory() || stat.mtimeMs > cutoffMs || isReferenced(keyFromPath(directory), objectKeys)) {
    return { deletedPaths: 0, deletedBytes: 0 };
  }
  const deletedBytes = await directoryBytes(directory);
  await fs.rm(directory, { recursive: true, force: true });
  return { deletedPaths: 1, deletedBytes };
}

async function cleanupTemporaryRoot(root, cutoffMs) {
  let deletedPaths = 0;
  let deletedBytes = 0;
  for (const entry of await safeEntries(root)) {
    const candidate = path.join(root, entry.name);
    if (!entry.isDirectory()) continue;
    const outcome = await removeStaleUnreferenced(candidate, [], cutoffMs);
    deletedPaths += outcome.deletedPaths;
    deletedBytes += outcome.deletedBytes;
  }
  return { deletedPaths, deletedBytes };
}

async function cleanupBook(bookDirectory, objectKeys, cutoffMs) {
  let deletedPaths = 0;
  let deletedBytes = 0;
  for (const revision of await safeEntries(bookDirectory)) {
    if (!revision.isDirectory() || !UUID_DIR.test(revision.name)) continue;
    const revisionDirectory = path.join(bookDirectory, revision.name);
    for (const folder of ["attempts", "share-thumbnails"]) {
      const container = path.join(revisionDirectory, folder);
      for (const candidate of await safeEntries(container)) {
        if (!candidate.isDirectory()) continue;
        const outcome = await removeStaleUnreferenced(path.join(container, candidate.name), objectKeys, cutoffMs);
        deletedPaths += outcome.deletedPaths;
        deletedBytes += outcome.deletedBytes;
      }
    }
  }
  const thumbnailSource = path.join(bookDirectory, ".thumbnail-source");
  const temporary = await cleanupTemporaryRoot(thumbnailSource, cutoffMs);
  return { deletedPaths: deletedPaths + temporary.deletedPaths, deletedBytes: deletedBytes + temporary.deletedBytes };
}

async function reconcileStorage(options = {}) {
  const retentionSeconds = configuredPositiveInt(options.retentionSeconds, configuredPositiveInt(process.env.STORAGE_ORPHAN_RETENTION_SECONDS, 24 * 60 * 60));
  const cutoffMs = (options.now instanceof Date ? options.now.getTime() : Date.now()) - retentionSeconds * 1000;
  const client = await pool.connect();
  let hasLock = false;
  let runId = null;
  try {
    await client.query("SELECT set_config('app.is_system_admin','true',false)");
    const lockResult = await client.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked", [LOCK_NAME]);
    hasLock = lockResult.rows[0].locked === true;
    if (!hasLock) return { skipped: true, reason: "already_running" };

    const run = await client.query("INSERT INTO storage_reconciliation_runs(status) VALUES('running') RETURNING id");
    runId = run.rows[0].id;
    await fs.mkdir(STORAGE_ROOT, { recursive: true });

    const [assetRows, tenantRows] = await Promise.all([
      client.query(`SELECT tenant_id, object_key, bytes, kind FROM assets`),
      client.query(`SELECT id FROM tenants`),
    ]);
    const validTenantIds = new Set(tenantRows.rows.map((row) => row.id));
    const assetKeysByTenant = new Map();
    const logicalByTenant = new Map();
    const sourceByTenant = new Map();
    for (const asset of assetRows.rows) {
      if (!assetKeysByTenant.has(asset.tenant_id)) assetKeysByTenant.set(asset.tenant_id, []);
      assetKeysByTenant.get(asset.tenant_id).push(asset.object_key);
      logicalByTenant.set(asset.tenant_id, (logicalByTenant.get(asset.tenant_id) || 0) + Number(asset.bytes));
      if (asset.kind === "source_pdf") sourceByTenant.set(asset.tenant_id, (sourceByTenant.get(asset.tenant_id) || 0) + Number(asset.bytes));
    }

    let deletedPaths = 0;
    let deletedBytes = 0;
    const uploadCleanup = await cleanupTemporaryRoot(path.join(STORAGE_ROOT, ".uploads"), cutoffMs);
    deletedPaths += uploadCleanup.deletedPaths;
    deletedBytes += uploadCleanup.deletedBytes;

    const physicalByTenant = new Map();
    for (const tenantEntry of await safeEntries(STORAGE_ROOT)) {
      if (!tenantEntry.isDirectory() || !UUID_DIR.test(tenantEntry.name)) continue;
      const tenantId = tenantEntry.name;
      const tenantDirectory = path.join(STORAGE_ROOT, tenantId);
      if (validTenantIds.has(tenantId)) {
        const objectKeys = assetKeysByTenant.get(tenantId) || [];
        for (const book of await safeEntries(tenantDirectory)) {
          if (book.isDirectory() && UUID_DIR.test(book.name)) {
            const outcome = await cleanupBook(path.join(tenantDirectory, book.name), objectKeys, cutoffMs);
            deletedPaths += outcome.deletedPaths;
            deletedBytes += outcome.deletedBytes;
          }
        }
      }
      physicalByTenant.set(tenantId, await directoryBytes(tenantDirectory));
    }

    await client.query("BEGIN");
    try {
      for (const tenant of tenantRows.rows) {
        const logicalBytes = logicalByTenant.get(tenant.id) || 0;
        const physicalBytes = physicalByTenant.get(tenant.id) || 0;
        await client.query(
          `INSERT INTO tenant_storage_usage(tenant_id, source_bytes, logical_bytes, physical_bytes, unattributed_bytes, reconciled_at)
           VALUES($1,$2,$3,$4,$5,now())
           ON CONFLICT (tenant_id) DO UPDATE SET source_bytes=EXCLUDED.source_bytes,
             logical_bytes=EXCLUDED.logical_bytes, physical_bytes=EXCLUDED.physical_bytes,
             unattributed_bytes=EXCLUDED.unattributed_bytes, reconciled_at=EXCLUDED.reconciled_at`,
          [tenant.id, sourceByTenant.get(tenant.id) || 0, logicalBytes, physicalBytes, Math.max(0, physicalBytes - logicalBytes)]
        );
      }
      await client.query(
        `UPDATE storage_reconciliation_runs SET status='succeeded', finished_at=now(), tenants_scanned=$2,
          deleted_paths=$3, deleted_bytes=$4 WHERE id=$1`,
        [runId, tenantRows.rowCount, deletedPaths, deletedBytes]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    }
    return { skipped: false, tenantsScanned: tenantRows.rowCount, deletedPaths, deletedBytes };
  } catch (err) {
    if (runId !== null) {
      await client.query(
        "UPDATE storage_reconciliation_runs SET status='failed', finished_at=now(), error=$2 WHERE id=$1",
        [runId, String(err && err.message ? err.message : err).slice(0, 1000)]
      ).catch(() => undefined);
    }
    throw err;
  } finally {
    if (hasLock) await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [LOCK_NAME]).catch(() => undefined);
    client.release();
  }
}

if (require.main === module) {
  reconcileStorage()
    .then((result) => console.log(JSON.stringify(result)))
    .catch((err) => { console.error(err); process.exitCode = 1; })
    .finally(() => pool.end());
}

module.exports = { reconcileStorage, pool };
