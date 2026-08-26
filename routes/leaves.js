const express = require('express');
const { nanoid } = require('nanoid');
const dayjs = require('dayjs');
const router = express.Router();
const { requireElevated } = require('../middleware/auth');
const { LEAVE_TYPES, ELEVATED_ROLES, canApprove } = require('../constants');
const { countBusinessDays } = require('../services/leaveCalc');
const googleCal = require('../services/googleCalendar');
const { getAllUsers, getUserById } = require('../repositories/users');
const { getAllLeaves, getLeaveById, createLeave, updateLeave, deleteLeave } = require('../repositories/leaves');

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
    return {
      ...l,
      userName: u ? u.name : 'ไม่ทราบชื่อ',
      typeLabel: leaveTypeLabel(l.type),
      days: countBusinessDays(l.startDate, l.endDate),
    };
  });
  res.json(enriched);
});

router.post('/', async (req, res) => {
  const { startDate, endDate, type, reason, extraEmails } = req.body;
  if (!startDate || !endDate || !type) return res.status(400).json({ error: 'กรอกข้อมูลให้ครบ' });
  if (dayjs(endDate).isBefore(dayjs(startDate))) {
    return res.status(400).json({ error: 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม' });
  }
  if (!LEAVE_TYPES.find((t) => t.key === type)) return res.status(400).json({ error: 'ประเภทการลาไม่ถูกต้อง' });

  const parsedEmails = parseEmails(extraEmails);
  const invalid = parsedEmails.filter((e) => !EMAIL_RE.test(e));
  if (invalid.length) return res.status(400).json({ error: `อีเมลไม่ถูกต้อง: ${invalid.join(', ')}` });

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
  };
  await createLeave(leave);
  res.status(201).json(leave);
});

router.delete('/:id', async (req, res) => {
  const leave = await getLeaveById(req.params.id);
  if (!leave) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (leave.userId !== req.session.user.id && !ELEVATED_ROLES.includes(req.session.user.role)) {
    return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  }
  if (leave.status !== 'pending') return res.status(400).json({ error: 'ยกเลิกได้เฉพาะคำขอที่รออนุมัติ' });
  await deleteLeave(req.params.id);
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
