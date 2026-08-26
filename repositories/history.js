const { nanoid } = require('nanoid');
const { pool } = require('../db');

async function logAction({ leaveId, action, actorId, actorName, targetUserId, targetUserName, detail }) {
  await pool.query(
    `INSERT INTO leave_history (id, leave_id, action, actor_id, actor_name, target_user_id, target_user_name, detail, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      nanoid(10),
      leaveId,
      action,
      actorId || null,
      actorName,
      targetUserId || null,
      targetUserName,
      JSON.stringify(detail || {}),
      new Date().toISOString(),
    ]
  );
}

async function getAllHistory() {
  const { rows } = await pool.query('SELECT * FROM leave_history ORDER BY created_at DESC LIMIT 500');
  return rows.map((r) => ({
    id: r.id,
    leaveId: r.leave_id,
    action: r.action,
    actorId: r.actor_id,
    actorName: r.actor_name,
    targetUserId: r.target_user_id,
    targetUserName: r.target_user_name,
    detail: r.detail,
    createdAt: r.created_at.toISOString(),
  }));
}

module.exports = { logAction, getAllHistory };
