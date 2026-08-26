const { pool } = require('../db');

const SELECT_COLUMNS = `
  id, user_id, to_char(start_date,'YYYY-MM-DD') as start_date, to_char(end_date,'YYYY-MM-DD') as end_date,
  type, reason, extra_emails, status, created_at, decided_by, decided_at, google_event_id, google_synced
`;

function mapLeave(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    startDate: row.start_date,
    endDate: row.end_date,
    type: row.type,
    reason: row.reason || '',
    extraEmails: row.extra_emails || [],
    status: row.status,
    createdAt: row.created_at.toISOString(),
    decidedBy: row.decided_by,
    decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
    googleEventId: row.google_event_id,
    googleSynced: row.google_synced,
  };
}

async function getAllLeaves() {
  const { rows } = await pool.query(`SELECT ${SELECT_COLUMNS} FROM leaves ORDER BY created_at DESC`);
  return rows.map(mapLeave);
}

async function getLeaveById(id) {
  const { rows } = await pool.query(`SELECT ${SELECT_COLUMNS} FROM leaves WHERE id = $1`, [id]);
  return mapLeave(rows[0]);
}

async function getApprovedLeavesForUser(userId) {
  const { rows } = await pool.query(
    `SELECT ${SELECT_COLUMNS} FROM leaves WHERE user_id = $1 AND status = 'approved'`,
    [userId]
  );
  return rows.map(mapLeave);
}

async function createLeave(leave) {
  await pool.query(
    `INSERT INTO leaves (id, user_id, start_date, end_date, type, reason, extra_emails, status, created_at, decided_by, decided_at, google_event_id, google_synced)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      leave.id,
      leave.userId,
      leave.startDate,
      leave.endDate,
      leave.type,
      leave.reason,
      JSON.stringify(leave.extraEmails),
      leave.status,
      leave.createdAt,
      leave.decidedBy,
      leave.decidedAt,
      leave.googleEventId,
      leave.googleSynced,
    ]
  );
  return leave;
}

async function updateLeave(id, patch) {
  const colMap = {
    status: 'status',
    decidedBy: 'decided_by',
    decidedAt: 'decided_at',
    googleEventId: 'google_event_id',
    googleSynced: 'google_synced',
  };
  const sets = [];
  const values = [];
  let i = 1;
  Object.entries(colMap).forEach(([key, col]) => {
    if (patch[key] !== undefined) {
      sets.push(`${col} = $${i++}`);
      values.push(patch[key]);
    }
  });
  if (!sets.length) return;
  values.push(id);
  await pool.query(`UPDATE leaves SET ${sets.join(', ')} WHERE id = $${i}`, values);
}

async function deleteLeave(id) {
  await pool.query('DELETE FROM leaves WHERE id = $1', [id]);
}

async function deleteLeavesByUser(userId) {
  await pool.query('DELETE FROM leaves WHERE user_id = $1', [userId]);
}

module.exports = {
  getAllLeaves,
  getLeaveById,
  getApprovedLeavesForUser,
  createLeave,
  updateLeave,
  deleteLeave,
  deleteLeavesByUser,
};
