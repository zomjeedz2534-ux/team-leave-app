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
      google_synced BOOLEAN NOT NULL DEFAULT false
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value JSONB
    );
  `);
}

module.exports = { pool, init };
