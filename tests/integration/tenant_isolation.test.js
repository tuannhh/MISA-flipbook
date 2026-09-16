#!/usr/bin/env node
"use strict";

/**
 * Test tich hop THAT chay tren Postgres that (qua Docker Compose), khong mock.
 * Muc tieu: chung minh dieu kien "di tiep" cua P1 trong ROADMAP.md:
 *   "Hai tenant va hai Creator khong doc/sua du lieu quan tri cua nhau."
 *
 * Cach chay (sau khi da `docker compose up -d` va chay migration trong infra/migrations):
 *   DATABASE_URL=postgres://misa_admin:<pw>@127.0.0.1:5432/misa_flipbook \
 *   APP_USER_URL=postgres://app_user:<app_pw>@127.0.0.1:5432/misa_flipbook \
 *   node tenant_isolation.test.js
 *
 * Ket qua PASS/FAIL duoc in that, khong tu gan "pass" khi chua chay.
 */

const { Client } = require("pg");

const BOOTSTRAP_URL = process.env.DATABASE_URL;
const APP_USER_URL = process.env.APP_USER_URL;

if (!BOOTSTRAP_URL || !APP_USER_URL) {
  console.error("Thieu DATABASE_URL hoac APP_USER_URL.");
  process.exit(1);
}

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed += 1;
  } else {
    console.log(`  FAIL: ${label}`);
    failed += 1;
  }
}

async function asActor(pool_url, { tenantId, userId, isAdmin }, fn) {
  const client = new Client({ connectionString: pool_url });
  await client.connect();
  try {
    await client.query("BEGIN");
    if (tenantId !== undefined) {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    }
    if (userId !== undefined) {
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    }
    await client.query("SELECT set_config('app.is_system_admin', $1, true)", [
      isAdmin ? "true" : "false",
    ]);
    const result = await fn(client);
    await client.query("ROLLBACK"); // test read-only ve tac dung phu; INSERT/UPDATE trong scope duoc kiem tra qua RETURNING/rowCount truoc khi rollback
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

async function setupFixtures(bootstrap) {
  const tenantA = await bootstrap.query(
    "INSERT INTO tenants (name) VALUES ('Tenant A - test') RETURNING id"
  );
  const tenantB = await bootstrap.query(
    "INSERT INTO tenants (name) VALUES ('Tenant B - test') RETURNING id"
  );
  const tenantAId = tenantA.rows[0].id;
  const tenantBId = tenantB.rows[0].id;

  const userA1 = await bootstrap.query(
    "INSERT INTO users (email, password_hash) VALUES ('a1@test.local', 'x') RETURNING id"
  );
  const userA2 = await bootstrap.query(
    "INSERT INTO users (email, password_hash) VALUES ('a2@test.local', 'x') RETURNING id"
  );
  const userB1 = await bootstrap.query(
    "INSERT INTO users (email, password_hash) VALUES ('b1@test.local', 'x') RETURNING id"
  );
  const userA1Id = userA1.rows[0].id;
  const userA2Id = userA2.rows[0].id;
  const userB1Id = userB1.rows[0].id;

  await bootstrap.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1,$2,'creator'), ($3,$4,'creator'), ($5,$6,'creator')",
    [tenantAId, userA1Id, tenantAId, userA2Id, tenantBId, userB1Id]
  );

  const bookA1 = await bootstrap.query(
    "INSERT INTO books (tenant_id, owner_id, title, permalink_slug, permalink_suffix) VALUES ($1,$2,'Sach A1','sach-a1','aaaaaaa1') RETURNING id",
    [tenantAId, userA1Id]
  );
  const bookA2 = await bootstrap.query(
    "INSERT INTO books (tenant_id, owner_id, title, permalink_slug, permalink_suffix) VALUES ($1,$2,'Sach A2 (cua A2)','sach-a2','aaaaaaa2') RETURNING id",
    [tenantAId, userA2Id]
  );
  const bookB1 = await bootstrap.query(
    "INSERT INTO books (tenant_id, owner_id, title, permalink_slug, permalink_suffix) VALUES ($1,$2,'Sach B1','sach-b1','bbbbbbb1') RETURNING id",
    [tenantBId, userB1Id]
  );

  const revisionA1 = await bootstrap.query(
    "INSERT INTO revisions (tenant_id, book_id, revision_number, source_key, checksum, pipeline_version, state) VALUES ($1,$2,1,'src/a1/r1.pdf','sha','v1','ready') RETURNING id",
    [tenantAId, bookA1.rows[0].id]
  );

  return {
    tenantAId,
    tenantBId,
    userA1Id,
    userA2Id,
    userB1Id,
    bookA1Id: bookA1.rows[0].id,
    bookA2Id: bookA2.rows[0].id,
    bookB1Id: bookB1.rows[0].id,
    revisionA1Id: revisionA1.rows[0].id,
  };
}

async function cleanupFixtures(bootstrap, ids) {
  // revisions -> books la ON DELETE RESTRICT (co y: khong xoa nham revision bat bien),
  // nen phai xoa revisions truoc books trong don dep test.
  await bootstrap.query("DELETE FROM revisions WHERE id = $1", [ids.revisionA1Id]);
  await bootstrap.query("DELETE FROM books WHERE id = ANY($1)", [
    [ids.bookA1Id, ids.bookA2Id, ids.bookB1Id],
  ]);
  await bootstrap.query("DELETE FROM memberships WHERE tenant_id = ANY($1)", [
    [ids.tenantAId, ids.tenantBId],
  ]);
  await bootstrap.query("DELETE FROM users WHERE id = ANY($1)", [
    [ids.userA1Id, ids.userA2Id, ids.userB1Id],
  ]);
  await bootstrap.query("DELETE FROM tenants WHERE id = ANY($1)", [
    [ids.tenantAId, ids.tenantBId],
  ]);
}

async function main() {
  const bootstrap = new Client({ connectionString: BOOTSTRAP_URL });
  await bootstrap.connect();

  let ids;
  try {
    ids = await setupFixtures(bootstrap);
    console.log("Fixtures da tao: 2 tenant, 3 user (2 creator tenant A, 1 creator tenant B), 3 sach, 1 revision.\n");

    console.log("Test 1: Creator A1 chi thay sach cua chinh minh trong tenant A (khong thay sach cua A2 cung tenant).");
    await asActor(APP_USER_URL, { tenantId: ids.tenantAId, userId: ids.userA1Id, isAdmin: false }, async (c) => {
      const r = await c.query("SELECT id FROM books ORDER BY id");
      const seenIds = r.rows.map((row) => row.id);
      check("chi 1 sach thay duoc", seenIds.length === 1);
      check("sach thay duoc la bookA1", seenIds[0] === ids.bookA1Id);
      check("KHONG thay bookA2 (cung tenant, khac owner)", !seenIds.includes(ids.bookA2Id));
    });

    console.log("\nTest 2: Creator A1 khong doc duoc sach cua tenant B (khac tenant).");
    await asActor(APP_USER_URL, { tenantId: ids.tenantAId, userId: ids.userA1Id, isAdmin: false }, async (c) => {
      const r = await c.query("SELECT id FROM books WHERE id = $1", [ids.bookB1Id]);
      check("0 dong tra ve cho sach tenant B", r.rowCount === 0);
    });

    console.log("\nTest 3: Creator A1 KHONG sua duoc sach cua tenant B (thu doi title qua UPDATE truc tiep).");
    await asActor(APP_USER_URL, { tenantId: ids.tenantAId, userId: ids.userA1Id, isAdmin: false }, async (c) => {
      const r = await c.query("UPDATE books SET title = 'HACKED' WHERE id = $1", [ids.bookB1Id]);
      check("0 dong bi anh huong (UPDATE bi RLS chan)", r.rowCount === 0);
    });

    console.log("\nTest 4: Creator A1 KHONG sua duoc sach cua A2 du cung tenant A.");
    await asActor(APP_USER_URL, { tenantId: ids.tenantAId, userId: ids.userA1Id, isAdmin: false }, async (c) => {
      const r = await c.query("UPDATE books SET title = 'HACKED' WHERE id = $1", [ids.bookA2Id]);
      check("0 dong bi anh huong (cung tenant nhung khac owner)", r.rowCount === 0);
    });

    console.log("\nTest 5: Creator A1 KHONG insert duoc sach voi tenant_id gia mao (session la tenant A nhung insert tenant_id=B).");
    await asActor(APP_USER_URL, { tenantId: ids.tenantAId, userId: ids.userA1Id, isAdmin: false }, async (c) => {
      let rlsBlocked = false;
      try {
        await c.query(
          "INSERT INTO books (tenant_id, owner_id, title, permalink_slug, permalink_suffix) VALUES ($1,$2,'gia mao','gia-mao','zzzzzzz1')",
          [ids.tenantBId, ids.userA1Id]
        );
      } catch (err) {
        rlsBlocked = /row-level security/i.test(err.message);
      }
      check("INSERT bi RLS tu choi (tenant_id khong khop session)", rlsBlocked);
    });

    console.log("\nTest 6: Creator A1 KHONG insert duoc sach nhan owner_id la nguoi khac (A2) trong cung tenant.");
    await asActor(APP_USER_URL, { tenantId: ids.tenantAId, userId: ids.userA1Id, isAdmin: false }, async (c) => {
      let rlsBlocked = false;
      try {
        await c.query(
          "INSERT INTO books (tenant_id, owner_id, title, permalink_slug, permalink_suffix) VALUES ($1,$2,'gia mao owner','gia-mao-2','zzzzzzz2')",
          [ids.tenantAId, ids.userA2Id]
        );
      } catch (err) {
        rlsBlocked = /row-level security/i.test(err.message);
      }
      check("INSERT bi RLS tu choi (owner_id khong khop session user)", rlsBlocked);
    });

    console.log("\nTest 7: Revision cua sach A1 chi Creator A1 (chu sach) thay duoc, A2 (cung tenant) va B1 (khac tenant) KHONG thay.");
    await asActor(APP_USER_URL, { tenantId: ids.tenantAId, userId: ids.userA1Id, isAdmin: false }, async (c) => {
      const r = await c.query("SELECT id FROM revisions WHERE id = $1", [ids.revisionA1Id]);
      check("chu so huu (A1) thay duoc revision", r.rowCount === 1);
    });
    await asActor(APP_USER_URL, { tenantId: ids.tenantAId, userId: ids.userA2Id, isAdmin: false }, async (c) => {
      const r = await c.query("SELECT id FROM revisions WHERE id = $1", [ids.revisionA1Id]);
      check("Creator A2 (cung tenant, khac owner) KHONG thay revision", r.rowCount === 0);
    });
    await asActor(APP_USER_URL, { tenantId: ids.tenantBId, userId: ids.userB1Id, isAdmin: false }, async (c) => {
      const r = await c.query("SELECT id FROM revisions WHERE id = $1", [ids.revisionA1Id]);
      check("Creator B1 (khac tenant) KHONG thay revision", r.rowCount === 0);
    });

    console.log("\nTest 8: Admin (is_system_admin=true) thay duoc sach cua CA hai tenant.");
    await asActor(APP_USER_URL, { isAdmin: true }, async (c) => {
      const r = await c.query("SELECT id FROM books WHERE id = ANY($1) ORDER BY id", [
        [ids.bookA1Id, ids.bookA2Id, ids.bookB1Id],
      ]);
      check("Admin thay ca 3 sach xuyen tenant", r.rowCount === 3);
    });

    console.log("\nTest 9: Khong dat session (khong tenant/user/admin) KHONG thay bat ky sach nao (chan mac dinh cho anonymous).");
    await asActor(APP_USER_URL, {}, async (c) => {
      const r = await c.query("SELECT id FROM books WHERE id = ANY($1)", [
        [ids.bookA1Id, ids.bookA2Id, ids.bookB1Id],
      ]);
      check("0 dong cho session khong xac thuc", r.rowCount === 0);
    });
  } finally {
    if (ids) {
      await cleanupFixtures(bootstrap, ids);
      console.log("\nDa don fixtures.");
    }
    await bootstrap.end();
  }

  console.log(`\n=== KET QUA: ${passed} PASS / ${failed} FAIL ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("TEST SCRIPT ERROR:", err);
  process.exit(1);
});
