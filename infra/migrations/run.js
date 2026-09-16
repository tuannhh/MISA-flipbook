#!/usr/bin/env node
"use strict";

/**
 * Migration runner thuan SQL cho Postgres cua MISA Flipbook.
 *
 * Vi sao khong dung ORM migration tool: RLS policy va role permission can
 * kiem soat chinh xac tung cau lenh (xem infra/migrations/0003_rls_policies.sql),
 * ORM migration generator thuong khong quan ly tot RLS/role.
 *
 * Bien moi truong bat buoc:
 *   DATABASE_URL       - connection string cua role BOOTSTRAP (co quyen tao role/bang,
 *                         vi du postgres superuser trong Docker Compose dev).
 *   APP_DB_PASSWORD    - mat khau se gan cho role runtime "app_user" (role nay
 *                         KHONG phai superuser, KHONG BYPASSRLS - xem ARCHITECTURE.md muc 4).
 *
 * Khong bao gio hardcode mat khau trong file .sql duoc commit vao git.
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATIONS_DIR = __dirname;

async function ensureBootstrap(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const appDbPassword = process.env.APP_DB_PASSWORD;
  if (!appDbPassword) {
    throw new Error(
      "Thieu bien moi truong APP_DB_PASSWORD (mat khau cho role runtime app_user)."
    );
  }

  const { rows } = await client.query(
    "SELECT 1 FROM pg_roles WHERE rolname = 'app_user'"
  );
  // CREATE ROLE / ALTER ROLE ... PASSWORD la DDL, khong nhan bind parameter ($1);
  // phai escape thanh string literal an toan bang escapeLiteral truoc khi noi chuoi SQL.
  const escapedPassword = client.escapeLiteral(appDbPassword);
  if (rows.length === 0) {
    // Can LOGIN de API ket noi duoc. Khong SUPERUSER, khong BYPASSRLS,
    // khong CREATEDB/CREATEROLE.
    await client.query(
      `CREATE ROLE app_user LOGIN PASSWORD ${escapedPassword} NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;`
    );
    console.log("Da tao role app_user.");
  } else {
    await client.query(`ALTER ROLE app_user PASSWORD ${escapedPassword};`);
    console.log("Role app_user da ton tai, cap nhat mat khau.");
  }
}

async function getAppliedMigrations(client) {
  const { rows } = await client.query("SELECT filename FROM schema_migrations");
  return new Set(rows.map((r) => r.filename));
}

async function applyMigration(client, filename) {
  const fullPath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(fullPath, "utf8");
  console.log(`-> Ap dung ${filename} ...`);
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (filename) VALUES ($1)",
      [filename]
    );
    await client.query("COMMIT");
    console.log(`   OK: ${filename}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw new Error(`Migration ${filename} that bai: ${err.message}`);
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Thieu bien moi truong DATABASE_URL.");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await ensureBootstrap(client);
    const applied = await getAppliedMigrations(client);
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }
      await applyMigration(client, file);
      appliedCount += 1;
    }
    if (appliedCount === 0) {
      console.log("Khong co migration moi can ap dung.");
    } else {
      console.log(`Da ap dung ${appliedCount} migration moi.`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("MIGRATION FAILED:", err.message);
  process.exit(1);
});
