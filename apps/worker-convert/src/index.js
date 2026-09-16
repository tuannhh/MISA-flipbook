"use strict";

/**
 * worker-convert = tien trinh DUY NHAT thuc su xu ly job (goi pdf-worker qua HTTP,
 * ghi asset/manifest, cap nhat revision/job). Tach khoi apps/dispatcher (chi claim
 * job) de co lo hong loi: neu code xu ly o day co bug/crash (vd PDF qua lon gay OOM,
 * loi khong luong truoc duoc tu pdf-worker), CHI container nay bi Docker restart -
 * dispatcher (claim loop) va api (upload) khong bi anh huong, job dang cho trong
 * hang doi Postgres/Redis khong mat, se duoc worker-convert xu ly tiep sau khi
 * container song lai (BullMQ giu job trong Redis; job da bi kill giua chung se
 * duoc dispatcher's reconciler dua ve 'queued' de claim lai neu can).
 */

const path = require("path");
const fs = require("fs/promises");
const { Pool } = require("pg");
const { Worker } = require("bullmq");
const IORedis = require("ioredis");

const DATABASE_URL = requireEnv("DATABASE_URL");
const REDIS_URL = requireEnv("REDIS_URL");
const PDF_WORKER_URL = requireEnv("PDF_WORKER_URL");
const INTERNAL_API_TOKEN = requireEnv("INTERNAL_API_TOKEN");
const STORAGE_ROOT = path.resolve(requireEnv("STORAGE_ROOT"));

const CONCURRENCY = Number(process.env.CONCURRENCY ?? 2); // ARCHITECTURE.md pilot: 1-2 job dong thoi
const QUEUE_NAME = "pdf-conversion";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Thieu bien moi truong ${name}.`);
  return v;
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });

async function withAdminTx(fn) {
  const client = await pool.connect();
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('app.is_system_admin', 'true', true)");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function fetchJobContext(client, jobId) {
  const { rows } = await client.query(
    `SELECT j.id AS job_id, j.tenant_id, j.book_id, j.revision_id, j.attempts,
            r.source_key, r.pipeline_version
     FROM jobs j
     JOIN revisions r ON r.id = j.revision_id
     WHERE j.id = $1`,
    [jobId]
  );
  return rows[0] ?? null;
}

async function callPdfWorker(sourceKey, outputKey, pipelineVersion) {
  const res = await fetch(`${PDF_WORKER_URL}/internal/convert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-token": INTERNAL_API_TOKEN,
    },
    body: JSON.stringify({ source_key: sourceKey, output_key: outputKey, pipeline_version: pipelineVersion }),
  });
  if (!res.ok) {
    throw new Error(`pdf-worker HTTP ${res.status}`);
  }
  return res.json();
}

async function processJob(bullJob) {
  const { jobId } = bullJob.data;
  const isLastAttempt = bullJob.attemptsMade + 1 >= (bullJob.opts.attempts ?? 1);

  const ctx = await withAdminTx((client) => fetchJobContext(client, jobId));
  if (!ctx) {
    console.warn(`[worker] Job ${jobId} khong con ton tai trong DB, bo qua.`);
    return;
  }

  const outputKey = `${ctx.tenant_id}/${ctx.book_id}/${ctx.revision_id}/derived`;

  try {
    const result = await callPdfWorker(ctx.source_key, outputKey, ctx.pipeline_version);

    if (result.status === "error") {
      // Loi ky vong (mat khau/corrupted/sai chu ky) - KHONG retry, day khong phai loi
      // tam thoi ma la du lieu dau vao khong hop le.
      await finalizeFailure(ctx, `${result.reason}: ${result.message}`);
      return;
    }

    await finalizeSuccess(ctx, outputKey, result.manifest);
  } catch (err) {
    if (isLastAttempt) {
      await finalizeFailure(ctx, `He thong loi sau ${bullJob.attemptsMade + 1} lan thu: ${err.message}`);
    } else {
      console.warn(`[worker] Job ${jobId} loi tam thoi (se retry): ${err.message}`);
      throw err; // cho BullMQ tu retry theo backoff
    }
  }
}

async function finalizeSuccess(ctx, outputKey, manifest) {
  const manifestKey = `${outputKey}/manifest.json`;
  const manifestPath = path.join(STORAGE_ROOT, manifestKey);
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  await withAdminTx(async (client) => {
    await client.query(
      `UPDATE revisions SET state = 'ready', manifest_key = $1 WHERE id = $2`,
      [manifestKey, ctx.revision_id]
    );

    const manifestStat = await fs.stat(manifestPath);
    await client.query(
      `INSERT INTO assets (tenant_id, book_id, revision_id, kind, object_key, content_type, bytes)
       VALUES ($1,$2,$3,'manifest',$4,'application/json',$5)`,
      [ctx.tenant_id, ctx.book_id, ctx.revision_id, manifestKey, manifestStat.size]
    );

    for (const p of manifest.pages) {
      for (const [variant, relPath] of Object.entries(p.images)) {
        const kind = variant === "thumb" ? "thumbnail" : "page_image";
        const contentType = relPath.endsWith(".webp") ? "image/webp" : "image/jpeg";
        const fullPath = path.join(STORAGE_ROOT, outputKey, relPath);
        const stat = await fs.stat(fullPath);
        await client.query(
          `INSERT INTO assets (tenant_id, book_id, revision_id, kind, object_key, content_type, bytes)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [ctx.tenant_id, ctx.book_id, ctx.revision_id, kind, `${outputKey}/${relPath}`, contentType, stat.size]
        );
      }
    }

    await client.query(
      `UPDATE jobs SET state = 'done', progress = 100, error = NULL, attempts = attempts + 1, updated_at = now()
       WHERE id = $1`,
      [ctx.job_id]
    );
  });
  console.log(`[worker] Job ${ctx.job_id} hoan tat (${manifest.n_pages} trang).`);
}

async function finalizeFailure(ctx, errorMessage) {
  await withAdminTx(async (client) => {
    await client.query(`UPDATE revisions SET state = 'failed' WHERE id = $1`, [ctx.revision_id]);
    await client.query(
      `UPDATE jobs SET state = 'failed', error = $1, attempts = attempts + 1, updated_at = now() WHERE id = $2`,
      [errorMessage, ctx.job_id]
    );
  });
  console.warn(`[worker] Job ${ctx.job_id} that bai: ${errorMessage}`);
}

async function main() {
  // Rieng instance ioredis cho Worker (dung lenh block cho job moi) - khong dung
  // chung connection voi bat ky Queue nao (xem ghi chu lich su trong git log).
  const workerConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const worker = new Worker(QUEUE_NAME, processJob, {
    connection: workerConnection,
    concurrency: CONCURRENCY,
  });
  worker.on("failed", (job, err) => {
    console.error(`[bullmq] Job ${job?.id} that bai sau ${job?.attemptsMade} lan thu: ${err.message}`);
  });
  worker.on("completed", (job) => {
    console.log(`[bullmq] Job ${job.id} completed.`);
  });

  console.log(`worker-convert dang chay. concurrency=${CONCURRENCY}`);

  const shutdown = async () => {
    console.log("Dang tat worker-convert...");
    await worker.close();
    workerConnection.disconnect();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("WORKER-CONVERT FAILED:", err);
  process.exit(1);
});
