const { pool } = require('../db');

async function getSetting(key) {
  const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0] ? rows[0].value : null;
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = $2`,
    [key, JSON.stringify(value)]
  );
}

async function deleteSetting(key) {
  await pool.query('DELETE FROM settings WHERE key = $1', [key]);
}

module.exports = { getSetting, setSetting, deleteSetting };
