const express = require('express');
const { nanoid } = require('nanoid');
const dayjs = require('dayjs');
const router = express.Router();
const { requireElevated } = require('../middleware/auth');
const {
  LEAVE_TYPES,
  ELEVATED_ROLES,
  canApprove,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_ALLOWED_MIME,
} = require('../constants');
const { countBusinessDays } = require('../services/leaveCalc');
const googleCal = require('../services/googleCalendar');
const { getAllUsers, getUserById } = require('../repositories/users');
const {
  getAllLeaves,
  getLeaveById,
  getLeaveAttachment,
  createLeave,
  updateLeave,
  deleteLeave,
} = require('../repositories/leaves');
const { logAction, getAllHistory } = require('../repositories/history');

function leaveTypeLabel(key) {
  const t = LEAVE_TYPES.find((t) => t.key === key);
  return t ? t.label : key;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmails(raw) {
  if (!raw) return [];
  const list = raw
    .split(/[,;\n]/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
  return [...new Set(list)];
}

// รับไฟล์แนบเป็น data URL (data:<mime>;base64,<data>) แล้วตรวจชนิด/ขนาด
function parseAttachment(dataUrl, filename) {
  if (!dataUrl) return { attachmentData: null, attachmentMime: null, attachmentFilename: null };
  const match = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('ไฟล์แนบไม่ถูกต้อง');
  const [, mime, base64] = match;
  if (!ATTACHMENT_ALLOWED_MIME.includes(mime)) {
    throw new Error('รองรับเฉพาะไฟล์ JPG, PNG, WEBP, HEIC หรือ PDF');
  }
  const approxBytes = Math.ceil((base64.length * 3) / 4);
  if (approxBytes > ATTACHMENT_MAX_BYTES) {
    throw new Error('ไฟล์ใหญ่เกินไป (ไม่เกิน 4MB)');
  }
  return {
    attachmentData: base64,
    attachmentMime: mime,
    attachmentFilename: (filename || 'attachment').toString().slice(0, 200),
  };
}

router.get('/', async (req, res) => {
  const { status, mine } = req.query;
  let leaves = await getAllLeaves();
  if (status) leaves = leaves.filter((l) => l.status === status);
  if (mine === 'true') leaves = leaves.filter((l) => l.userId === req.session.user.id);
  const users = await getAllUsers();
  if (status === 'pending' && mine !== 'true') {
    leaves = leaves.filter((l) => {
      const requester = users.find((u) => u.id === l.userId);
      return requester && canApprove(req.session.user.role, requester.role);
    });
  }
  const enriched = leaves.map((l) => {
    const u = users.find((u) => u.id === l.userId);
    const advanceDays = dayjs(l.startDate).diff(dayjs(l.createdAt), 'day');
    return {
      ...l,
      userName: u ? u.name : 'ไม่ทราบชื่อ',
      typeLabel: leaveTypeLabel(l.type),
      days: countBusinessDays(l.startDate, l.endDate),
      lowAdvanceNotice: l.type === 'vacation' && advanceDays < 30,
    };
  });
  res.json(enriched);
});

router.get('/history', requireElevated, async (req, res) => {
  const history = await getAllHistory();
  res.json(
    history.map((h) => ({
      ...h,
      typeLabel: h.detail && h.detail.type ? leaveTypeLabel(h.detail.type) : null,
    }))
  );
});

router.get('/:id/attachment', async (req, res) => {
  const leave = await getLeaveById(req.params.id);
  if (!leave) return res.status(404).send('ไม่พบคำขอ');
  const isElevated = ELEVATED_ROLES.includes(req.session.user.role);
  if (leave.userId !== req.session.user.id && !isElevated) {
    return res.status(403).send('ไม่มีสิทธิ์');
  }
  const attachment = await getLeaveAttachment(req.params.id);
  if (!attachment) return res.status(404).send('ไม่พบไฟล์แนบ');
  res.setHeader('Content-Type', attachment.mime || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${encodeURIComponent(attachment.filename || 'attachment')}"`
  );
  res.send(Buffer.from(attachment.data, 'base64'));
});

router.post('/', async (req, res) => {
  const { startDate, endDate, type, reason, extraEmails, attachmentDataUrl, attachmentFilename } = req.body;
  if (!startDate || !endDate || !type) return res.status(400).json({ error: 'กรอกข้อมูลให้ครบ' });
  if (dayjs(endDate).isBefore(dayjs(startDate))) {
    return res.status(400).json({ error: 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม' });
  }
  if (!LEAVE_TYPES.find((t) => t.key === type)) return res.status(400).json({ error: 'ประเภทการลาไม่ถูกต้อง' });

  const parsedEmails = parseEmails(extraEmails);
  const invalid = parsedEmails.filter((e) => !EMAIL_RE.test(e));
  if (invalid.length) return res.status(400).json({ error: `อีเมลไม่ถูกต้อง: ${invalid.join(', ')}` });

  let attachment;
  try {
    attachment = parseAttachment(attachmentDataUrl, attachmentFilename);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const leave = {
    id: nanoid(10),
    userId: req.session.user.id,
    startDate,
    endDate,
    type,
    reason: (reason || '').trim(),
    extraEmails: parsedEmails,
    status: 'pending',
    createdAt: new Date().toISOString(),
    decidedBy: null,
    decidedAt: null,
    googleEventId: null,
    googleSynced: false,
    ...attachment,
  };
  await createLeave(leave);
  res.status(201).json(leave);
});

router.patch('/:id', requireElevated, async (req, res) => {
  const leave = await getLeaveById(req.params.id);
  if (!leave) return res.status(404).json({ error: 'ไม่พบคำขอ' });

  const { startDate, endDate, type, reason, extraEmails, attachmentDataUrl, attachmentFilename } = req.body;
  const patch = {};
  const before = { startDate: leave.startDate, endDate: leave.endDate, type: leave.type, reason: leave.reason };

  if (startDate !== undefined) patch.startDate = startDate;
  if (endDate !== undefined) patch.endDate = endDate;
  if (type !== undefined) {
    if (!LEAVE_TYPES.find((t) => t.key === type)) return res.status(400).json({ error: 'ประเภทการลาไม่ถูกต้อง' });
    patch.type = type;
  }
  if (reason !== undefined) patch.reason = reason.trim();
  if (extraEmails !== undefined) {
    const parsedEmails = parseEmails(extraEmails);
    const invalid = parsedEmails.filter((e) => !EMAIL_RE.test(e));
    if (invalid.length) return res.status(400).json({ error: `อีเมลไม่ถูกต้อง: ${invalid.join(', ')}` });
    patch.extraEmails = parsedEmails;
  }
  if (attachmentDataUrl !== undefined) {
    try {
      Object.assign(patch, parseAttachment(attachmentDataUrl, attachmentFilename));
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  const finalStart = patch.startDate || leave.startDate;
  const finalEnd = patch.endDate || leave.endDate;
  if (dayjs(finalEnd).isBefore(dayjs(finalStart))) {
    return res.status(400).json({ error: 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม' });
  }

  await updateLeave(req.params.id, patch);

  let googleError = null;
  if (leave.googleEventId) {
    const updated = { ...leave, ...patch };
    const requester = await getUserById(leave.userId);
    try {
      await googleCal.updateLeaveEvent(leave.googleEventId, updated, requester, req.session.user);
    } catch (e) {
      googleError = e.message;
    }
  }

  const requesterForLog = await getUserById(leave.userId);
  await logAction({
    leaveId: leave.id,
    action: 'edited',
    actorId: req.session.user.id,
    actorName: req.session.user.name,
    targetUserId: leave.userId,
    targetUserName: requesterForLog ? requesterForLog.name : 'ไม่ทราบชื่อ',
    detail: { before, after: { ...before, ...patch, startDate: finalStart, endDate: finalEnd } },
  });

  res.json({ ok: true, googleError });
});

router.delete('/:id', async (req, res) => {
  const leave = await getLeaveById(req.params.id);
  if (!leave) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  const isElevated = ELEVATED_ROLES.includes(req.session.user.role);
  const isOwner = leave.userId === req.session.user.id;
  if (!isElevated && !isOwner) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });

  const deleteReason = (req.body && req.body.reason ? req.body.reason : '').trim();
  if (!deleteReason) return res.status(400).json({ error: 'กรุณาระบุเหตุผลที่ลบคำขอนี้' });

  if (leave.googleEventId) {
    try {
      await googleCal.deleteLeaveEvent(leave.googleEventId);
    } catch (e) {
      // ไม่ block การลบฝั่งระบบแม้ลบใน Google Calendar ไม่สำเร็จ
    }
  }

  const requester = await getUserById(leave.userId);
  await deleteLeave(req.params.id);
  await logAction({
    leaveId: leave.id,
    action: leave.status === 'pending' && isOwner && !isElevated ? 'cancelled' : 'deleted',
    actorId: req.session.user.id,
    actorName: req.session.user.name,
    targetUserId: leave.userId,
    targetUserName: requester ? requester.name : 'ไม่ทราบชื่อ',
    detail: {
      type: leave.type,
      startDate: leave.startDate,
      endDate: leave.endDate,
      previousStatus: leave.status,
      deleteReason,
    },
  });

  res.json({ ok: true });
});

router.post('/:id/approve', requireElevated, async (req, res) => {
  const leave = await getLeaveById(req.params.id);
  if (!leave) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (leave.status !== 'pending') return res.status(400).json({ error: 'คำขอนี้ถูกดำเนินการแล้ว' });

  const requester = await getUserById(leave.userId);
  if (!requester || !canApprove(req.session.user.role, requester.role)) {
    return res.status(403).json({ error: 'ตำแหน่งของคุณไม่มีสิทธิ์อนุมัติคำขอลาของตำแหน่งนี้' });
  }
  const approver = req.session.user;
  let googleEventId = null;
  let googleSynced = false;
  let googleError = null;
  try {
    googleEventId = await googleCal.createLeaveEvent(leave, requester, approver);
    googleSynced = true;
  } catch (e) {
    googleError = e.message;
  }

  await updateLeave(req.params.id, {
    status: 'approved',
    decidedBy: approver.id,
    decidedAt: new Date().toISOString(),
    googleEventId,
    googleSynced,
  });

  await logAction({
    leaveId: leave.id,
    action: 'approved',
    actorId: approver.id,
    actorName: approver.name,
    targetUserId: leave.userId,
    targetUserName: requester.name,
    detail: { type: leave.type, startDate: leave.startDate, endDate: leave.endDate },
  });

  res.json({ ok: true, googleSynced, googleError });
});

router.post('/:id/reject', requireElevated, async (req, res) => {
  const leave = await getLeaveById(req.params.id);
  if (!leave) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (leave.status !== 'pending') return res.status(400).json({ error: 'คำขอนี้ถูกดำเนินการแล้ว' });

  const requester = await getUserById(leave.userId);
  if (!requester || !canApprove(req.session.user.role, requester.role)) {
    return res.status(403).json({ error: 'ตำแหน่งของคุณไม่มีสิทธิ์ปฏิเสธคำขอลาของตำแหน่งนี้' });
  }

  await updateLeave(req.params.id, {
    status: 'rejected',
    decidedBy: req.session.user.id,
    decidedAt: new Date().toISOString(),
  });

  await logAction({
    leaveId: leave.id,
    action: 'rejected',
    actorId: req.session.user.id,
    actorName: req.session.user.name,
    targetUserId: leave.userId,
    targetUserName: requester.name,
    detail: { type: leave.type, startDate: leave.startDate, endDate: leave.endDate },
  });

  res.json({ ok: true });
});

router.post('/:id/sync-google', requireElevated, async (req, res) => {
  const leave = await getLeaveById(req.params.id);
  if (!leave) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (leave.status !== 'approved') return res.status(400).json({ error: 'ซิงก์ได้เฉพาะคำขอที่อนุมัติแล้ว' });

  const requester = await getUserById(leave.userId);
  try {
    const googleEventId = await googleCal.createLeaveEvent(leave, requester, req.session.user);
    await updateLeave(req.params.id, { googleEventId, googleSynced: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
