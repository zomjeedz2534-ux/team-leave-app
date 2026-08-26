const { pool } = require('../db');

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    quotas: row.quotas,
    createdAt: row.created_at.toISOString(),
  };
}

async function getAllUsers() {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY created_at ASC');
  return rows.map(mapUser);
}

async function getUserById(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return mapUser(rows[0]);
}

async function getUserByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return mapUser(rows[0]);
}

async function createUser(user) {
  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, role, quotas, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [user.id, user.name, user.email, user.passwordHash, user.role, JSON.stringify(user.quotas), user.createdAt]
  );
  return user;
}

async function updateUser(id, patch) {
  const sets = [];
  const values = [];
  let i = 1;
  if (patch.name !== undefined) {
    sets.push(`name = $${i++}`);
    values.push(patch.name);
  }
  if (patch.email !== undefined) {
    sets.push(`email = $${i++}`);
    values.push(patch.email);
  }
  if (patch.passwordHash !== undefined) {
    sets.push(`password_hash = $${i++}`);
    values.push(patch.passwordHash);
  }
  if (patch.role !== undefined) {
    sets.push(`role = $${i++}`);
    values.push(patch.role);
  }
  if (patch.quotas !== undefined) {
    sets.push(`quotas = $${i++}`);
    values.push(JSON.stringify(patch.quotas));
  }
  if (!sets.length) return;
  values.push(id);
  await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${i}`, values);
}

module.exports = { getAllUsers, getUserById, getUserByEmail, createUser, updateUser };
