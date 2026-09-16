"use strict";

/**
 * Dieu phoi job chuyen doi PDF.
 *
 * Postgres bang `jobs` la outbox ben vung (nguon su that ve trang thai); Redis/BullMQ
 * chi la hang doi thuc thi (retry/backoff/concurrency) - dung ARCHITECTURE.md muc 1:
 * "PostgreSQL giu job ledger/outbox ben vung, Redis la hang doi, khong la nguon duy nhat."
 *
 * Vong doi 1 job: queued (API tao) -> processing (dispatcher claim + BullMQ dang chay)
 * -> done | failed.
 *
 * Reconciler: khi dispatcher khoi dong, job con ket "processing" qua lau (dispatcher
 * cu bi kill giua chung) duoc dua ve lai "queued" - dung "Sau restart, reconciler dua
 * job dang do tro lai hang doi" (ARCHITECTURE.md muc 1).
 */

const path = require("path");
const fs = require("fs/promises");
const { Pool } = require("pg");
const { Queue, Worker } = require("bullmq");
const IORedis = require("ioredis");

const DATABASE_URL = requireEnv("DATABASE_URL");
const REDIS_URL = requireEnv("REDIS_URL");
const PDF_WORKER_URL = requireEnv("PDF_WORKER_URL");
const INTERNAL_API_TOKEN = requireEnv("INTERNAL_API_TOKEN");
const STORAGE_ROOT = path.resolve(requireEnv("STORAGE_ROOT"));

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 2000);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 2); // ARCHITECTURE.md pilot: 1-2 job dong thoi
const STUCK_JOB_TIMEOUT_MINUTES = Number(process.env.STUCK_JOB_TIMEOUT_MINUTES ?? 15);
const JOB_ATTEMPTS = Number(process.env.JOB_ATTEMPTS ?? 3);
const QUEUE_NAME = "pdf-conversion";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Thieu bien moi truong ${name}.`);
  return v;
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });

/** Chay fn trong 1 transaction voi quyen "he thong" (is_system_admin=true) -
 * dispatcher xu ly job xuyen tenant nen khong gan voi 1 user cu the. */
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

async function reconcileStuckJobs() {
  const recovered = await withAdminTx(async (client) => {
    const { rows } = await client.query(
      `UPDATE jobs SET state = 'queued', updated_at = now()
       WHERE state = 'processing' AND updated_at < now() - ($1 || ' minutes')::interval
       RETURNING id`,
      [STUCK_JOB_TIMEOUT_MINUTES]
    );
    return rows;
  });
  if (recovered.length > 0) {
    console.log(`[reconciler] Dua ${recovered.length} job ket 'processing' qua lau ve lai 'queued'.`);
  }
}

async function pollAndClaim(queue) {
  const claimed = await withAdminTx(async (client) => {
    const { rows } = await client.query(
      `SELECT id FROM jobs WHERE state = 'queued' ORDER BY created_at ASC LIMIT 10 FOR UPDATE SKIP LOCKED`
    );
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    await client.query(`UPDATE jobs SET state = 'processing', updated_at = now() WHERE id = ANY($1)`, [
      ids,
    ]);
    return ids;
  });

  for (const jobId of claimed) {
    await queue.add(
      "convert",
      { jobId },
      {
        jobId, // dedupe: 1 BullMQ job cho 1 jobId Postgres
        attempts: JOB_ATTEMPTS,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 500,
        removeOnFail: 500,
      }
    );
    console.log(`[poller] Da claim va enqueue job ${jobId}.`);
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
  await reconcileStuckJobs();

  // Tu tao instance ioredis cho tung ben (Queue/Worker) thay vi de BullMQ tu
  // require('ioredis') noi bo - tranh loi resolve module trong moi truong nay.
  // Worker va Queue KHONG dung chung 1 connection: Worker dung lenh block (BRPOPLPUSH)
  // de cho job moi, dung chung se lam Queue bi tranh chap/block theo.
  const queueConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const workerConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue(QUEUE_NAME, { connection: queueConnection });
  const worker = new Worker(QUEUE_NAME, processJob, {
    connection: workerConnection,
    concurrency: CONCURRENCY,
  });
  worker.on("failed", (job, err) => {
    console.error(`[bullmq] Job ${job?.id} that bai sau ${job?.attemptsMade} lan thu: ${err.message}`);
  });

  console.log(`Dispatcher dang chay. poll=${POLL_INTERVAL_MS}ms concurrency=${CONCURRENCY}`);
  setInterval(() => {
    pollAndClaim(queue).catch((err) => console.error("[poller] Loi:", err.message));
  }, POLL_INTERVAL_MS);

  const shutdown = async () => {
    console.log("Dang tat dispatcher...");
    await worker.close();
    await queue.close();
    queueConnection.disconnect();
    workerConnection.disconnect();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("DISPATCHER FAILED:", err);
  process.exit(1);
});
