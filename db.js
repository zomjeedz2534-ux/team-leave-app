const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('ยังไม่ได้ตั้งค่า DATABASE_URL ใน .env (connection string ของ Postgres)');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      quotas JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leaves (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      type TEXT NOT NULL,
      reason TEXT DEFAULT '',
      extra_emails JSONB NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      decided_by TEXT,
      decided_at TIMESTAMPTZ,
      google_event_id TEXT,
      google_synced BOOLEAN NOT NULL DEFAULT false,
      attachment_data TEXT,
      attachment_mime TEXT,
      attachment_filename TEXT,
      previous_status TEXT,
      pending_delete_reason TEXT
    );
  `);
  // เผื่อฐานข้อมูลเก่าที่สร้างตารางไว้แล้วก่อนมีคอลัมน์ไฟล์แนบ
  await pool.query(`ALTER TABLE leaves ADD COLUMN IF NOT EXISTS attachment_data TEXT;`);
  await pool.query(`ALTER TABLE leaves ADD COLUMN IF NOT EXISTS attachment_mime TEXT;`);
  await pool.query(`ALTER TABLE leaves ADD COLUMN IF NOT EXISTS attachment_filename TEXT;`);
  // เผื่อฐานข้อมูลเก่าที่สร้างตารางไว้แล้วก่อนมีระบบขออนุมัติลบคำขอที่อนุมัติแล้ว
  await pool.query(`ALTER TABLE leaves ADD COLUMN IF NOT EXISTS previous_status TEXT;`);
  await pool.query(`ALTER TABLE leaves ADD COLUMN IF NOT EXISTS pending_delete_reason TEXT;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value JSONB
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leave_history (
      id TEXT PRIMARY KEY,
      leave_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_id TEXT,
      actor_name TEXT NOT NULL,
      target_user_id TEXT,
      target_user_name TEXT NOT NULL,
      detail JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

module.exports = { pool, init };
