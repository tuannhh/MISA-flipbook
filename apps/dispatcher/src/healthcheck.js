"use strict";
// Liveness probe: the dispatcher loop writes a heartbeat file each cycle. A stale or
// missing beat means the poll/reconcile loop is hung or dead, so the orchestrator can
// restart it. Kept dependency-free and fast so it is safe as a frequent HEALTHCHECK.
const fs = require("fs");

const FILE = process.env.HEARTBEAT_FILE || "/tmp/dispatcher.heartbeat";
const STALE_MS = Number(process.env.HEARTBEAT_STALE_MS ?? 60000);

try {
  const ts = Number(fs.readFileSync(FILE, "utf8").trim());
  const age = Date.now() - ts;
  if (!Number.isFinite(ts) || age > STALE_MS || age < -STALE_MS) {
    console.error(`unhealthy: heartbeat age ${age}ms exceeds ${STALE_MS}ms`);
    process.exit(1);
  }
  process.exit(0);
} catch (err) {
  console.error(`unhealthy: cannot read heartbeat ${FILE}: ${err.message}`);
  process.exit(1);
}
