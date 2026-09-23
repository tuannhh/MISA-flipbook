"use strict";
for (const name of ["DATABASE_URL","REDIS_URL"]) {
  if (!process.env[name]) throw new Error('Missing environment: ' + name);
}
// Durable DB outbox. Redis messages are disposable; generation IDs avoid dedupe
// against terminal/stalled BullMQ messages from an older delivery.
const fs = require("fs");
const { Pool } = require("pg");
const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const pool = new Pool({connectionString:process.env.DATABASE_URL,max:5});
const MAX_ATTEMPTS = Number(process.env.JOB_ATTEMPTS ?? 3);
const HEARTBEAT_FILE = process.env.HEARTBEAT_FILE || "/tmp/dispatcher.heartbeat";
function beat() { try { fs.writeFileSync(HEARTBEAT_FILE, String(Date.now())); } catch {} }
async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.is_system_admin','true',true)");
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (err) { await c.query("ROLLBACK").catch(()=>{}); throw err; }
  finally { c.release(); }
}
async function reconcileStuckJobs() {
  return tx(async c => {
    const {rows} = await c.query(`UPDATE jobs SET
      state=CASE WHEN attempts >= $1 THEN 'failed' ELSE 'queued' END,
      lease_token=NULL, lease_expires_at=NULL, available_at=now(),
      error='Execution lease expired'
      WHERE state='processing' AND COALESCE(lease_expires_at,updated_at+interval '15 minutes')<now()
      RETURNING revision_id,state`, [MAX_ATTEMPTS]);
    for (const row of rows) await c.query(`UPDATE revisions SET state=$2
      WHERE id=$1 AND state IN ('pending','converting')`, [row.revision_id,row.state==='failed'?'failed':'pending']);
    return rows.length;
  });
}
async function pollAndClaim(queue) {
  const rows = await tx(async c => (await c.query(`WITH selected AS (
    SELECT id FROM jobs WHERE state='queued' AND available_at<=now()
    ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED)
    UPDATE jobs j SET state='processing',dispatch_generation=dispatch_generation+1,
      lease_token=NULL,lease_expires_at=now()+interval '120 seconds'
    FROM selected s WHERE j.id=s.id RETURNING j.id,j.dispatch_generation`)).rows);
  for (const row of rows) {
    await queue.add("convert", {jobId:row.id,generation:row.dispatch_generation}, {
      jobId:`${row.id}-${row.dispatch_generation}`,attempts:1,removeOnComplete:500,removeOnFail:500
    });
  }
}
async function main() {
  const connection = new IORedis(process.env.REDIS_URL,{maxRetriesPerRequest:null});
  const queue = new Queue("pdf-conversion",{connection});
  let stopped = false;
  let lastReconcile = 0;
  const shutdown = () => { stopped = true; };
  process.on("SIGTERM",shutdown); process.on("SIGINT",shutdown);
  beat();
  while (!stopped) {
    try {
      if (Date.now()-lastReconcile >= Number(process.env.RECONCILE_INTERVAL_MS ?? 10000)) {
        await reconcileStuckJobs(); lastReconcile=Date.now();
      }
      await pollAndClaim(queue);
    } catch (err) { console.error(`Dispatcher: ${err.message}`); }
    beat();
    await new Promise(r=>setTimeout(r,Number(process.env.POLL_INTERVAL_MS ?? 2000)));
  }
  await queue.close(); connection.disconnect(); await pool.end();
}
if (require.main === module) main().catch(err=>{console.error(err);process.exit(1);});
module.exports = {reconcileStuckJobs,pollAndClaim,pool};
