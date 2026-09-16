"use strict";

/**
 * Dispatcher = CHI claim job, khong xu ly (khong goi pdf-worker). Tach rieng khoi
 * worker-convert (services xu ly thuc su) de dam bao 1 module loi khong keo theo
 * ca he thong: neu worker-convert crash/OOM giua chung mot job "doc" (vd PDF qua
 * lon, bug code convert), tien trinh claim job nay VAN chay binh thuong, job moi
 * van duoc dua vao hang doi; Docker chi restart container worker-convert, khong
 * anh huong claim loop hay cac job khac dang cho.
 *
 * Postgres bang `jobs` la outbox ben vung (nguon su that ve trang thai); Redis/BullMQ
 * chi la hang doi thuc thi (retry/backoff/concurrency) - ARCHITECTURE.md muc 1.
 *
 * Vong doi 1 job: queued (API tao) -> processing (dispatcher claim, worker-convert
 * dang xu ly) -> done | failed.
 *
 * Reconciler chay theo chu ky (khong chi luc khoi dong): job con ket "processing"
 * qua lau (vd worker-convert bi kill giua chung, khong kip bao loi) duoc dua ve
 * lai "queued" de duoc claim lai - dung "Sau restart, reconciler dua job dang do
 * tro lai hang doi" (ARCHITECTURE.md muc 1), ke ca khi CHINH dispatcher khong bi
 * restart (truoc day chi chay 1 lan luc start, la 1 khe ho da sua o day).
 */

const { Pool } = require("pg");
const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const DATABASE_URL = requireEnv("DATABASE_URL");
const REDIS_URL = requireEnv("REDIS_URL");

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 2000);
const RECONCILE_INTERVAL_MS = Number(process.env.RECONCILE_INTERVAL_MS ?? 60000);
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

async function main() {
  await reconcileStuckJobs();

  // Tu tao instance ioredis rieng thay vi de BullMQ tu require('ioredis') noi bo -
  // tranh loi resolve module trong moi truong nay (xem ghi chu lich su trong git log).
  const queueConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue(QUEUE_NAME, { connection: queueConnection });

  console.log(`Dispatcher (claimer) dang chay. poll=${POLL_INTERVAL_MS}ms reconcile=${RECONCILE_INTERVAL_MS}ms`);
  const pollTimer = setInterval(() => {
    pollAndClaim(queue).catch((err) => console.error("[poller] Loi:", err.message));
  }, POLL_INTERVAL_MS);
  const reconcileTimer = setInterval(() => {
    reconcileStuckJobs().catch((err) => console.error("[reconciler] Loi:", err.message));
  }, RECONCILE_INTERVAL_MS);

  const shutdown = async () => {
    console.log("Dang tat dispatcher...");
    clearInterval(pollTimer);
    clearInterval(reconcileTimer);
    await queue.close();
    queueConnection.disconnect();
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
