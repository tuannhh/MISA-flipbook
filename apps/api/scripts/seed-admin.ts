/**
 * Tao admin dau tien - chi chay 1 lan luc bootstrap he thong, ket noi TRUC TIEP
 * bang role bootstrap (superuser/owner trong Docker Compose dev), KHONG qua API,
 * vi khong the tu cap quyen Admin qua endpoint /admin/* (can da la Admin de goi).
 *
 * Chay: DATABASE_URL=... SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... \
 *       npx ts-node scripts/seed-admin.ts
 */
import { Client } from "pg";
import * as argon2 from "argon2";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!databaseUrl || !email || !password) {
    throw new Error(
      "Can DATABASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD trong bien moi truong."
    );
  }
  if (password.length < 12) {
    throw new Error("Mat khau admin nen toi thieu 12 ky tu.");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const existing = await client.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      console.log(`User ${email} da ton tai (id=${existing.rows[0].id}). Khong tao lai.`);
      return;
    }
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const { rows } = await client.query(
      "INSERT INTO users (email, password_hash, is_system_admin) VALUES ($1,$2,true) RETURNING id",
      [email, passwordHash]
    );
    console.log(`Da tao system admin ${email} (id=${rows[0].id}).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("SEED FAILED:", err.message);
  process.exit(1);
});
