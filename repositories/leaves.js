const { pool } = require('../db');

const SELECT_COLUMNS = `
  id, user_id, to_char(start_date,'YYYY-MM-DD') as start_date, to_char(end_date,'YYYY-MM-DD') as end_date,
  type, reason, extra_emails, status, created_at, decided_by, decided_at, google_event_id, google_synced,
  (attachment_data IS NOT NULL) as has_attachment, attachment_filename
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
    hasAttachment: row.has_attachment,
    attachmentFilename: row.attachment_filename,
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

async function getLeaveAttachment(id) {
  const { rows } = await pool.query(
    'SELECT attachment_data, attachment_mime, attachment_filename FROM leaves WHERE id = $1',
    [id]
  );
  if (!rows[0] || !rows[0].attachment_data) return null;
  return {
    data: rows[0].attachment_data,
    mime: rows[0].attachment_mime,
    filename: rows[0].attachment_filename,
  };
}

async function createLeave(leave) {
  await pool.query(
    `INSERT INTO leaves (
       id, user_id, start_date, end_date, type, reason, extra_emails, status, created_at,
       decided_by, decided_at, google_event_id, google_synced, attachment_data, attachment_mime, attachment_filename
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
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
      leave.attachmentData || null,
      leave.attachmentMime || null,
      leave.attachmentFilename || null,
    ]
  );
  return leave;
}

async function updateLeave(id, patch) {
  const colMap = {
    startDate: 'start_date',
    endDate: 'end_date',
    type: 'type',
    reason: 'reason',
    status: 'status',
    decidedBy: 'decided_by',
    decidedAt: 'decided_at',
    googleEventId: 'google_event_id',
    googleSynced: 'google_synced',
    attachmentData: 'attachment_data',
    attachmentMime: 'attachment_mime',
    attachmentFilename: 'attachment_filename',
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
  if (patch.extraEmails !== undefined) {
    sets.push(`extra_emails = $${i++}`);
    values.push(JSON.stringify(patch.extraEmails));
  }
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
  getLeaveAttachment,
  createLeave,
  updateLeave,
  deleteLeave,
  deleteLeavesByUser,
};
