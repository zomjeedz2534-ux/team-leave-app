const express = require('express');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const router = express.Router();
const { requireElevated } = require('../middleware/auth');
const { DEFAULT_QUOTAS, ROLES } = require('../constants');
const { remainingForUser } = require('../services/leaveCalc');
const { getAllUsers, getUserById, getUserByEmail, createUser, updateUser } = require('../repositories/users');

const ROLE_KEYS = ROLES.map((r) => r.key);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/', async (req, res) => {
  const users = await getAllUsers();
  const withBalance = await Promise.all(
    users.map(async (u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      quotas: u.quotas,
      remaining: await remainingForUser(u.id),
    }))
  );
  res.json(withBalance);
});

router.post('/', requireElevated, async (req, res) => {
  const { name, email, password, role, quotas } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'กรอกข้อมูลให้ครบ' });
  if (password.length < 6) return res.status(400).json({ error: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร' });
  const emailNorm = email.trim().toLowerCase();
  if (await getUserByEmail(emailNorm)) {
    return res.status(400).json({ error: 'อีเมลนี้ถูกใช้แล้ว' });
  }
  const user = {
    id: nanoid(10),
    name: name.trim(),
    email: emailNorm,
    passwordHash: bcrypt.hashSync(password, 10),
    role: ROLE_KEYS.includes(role) ? role : 'junior',
    quotas: { ...DEFAULT_QUOTAS, ...(quotas || {}) },
    createdAt: new Date().toISOString(),
  };
  await createUser(user);
  res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

router.patch('/me', async (req, res) => {
  const { name, email } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'กรุณากรอกชื่อ' });
  const emailNorm = (email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(emailNorm)) return res.status(400).json({ error: 'อีเมลไม่ถูกต้อง' });
  const existing = await getUserByEmail(emailNorm);
  if (existing && existing.id !== req.session.user.id) {
    return res.status(400).json({ error: 'อีเมลนี้ถูกใช้โดยผู้ใช้อื่นแล้ว' });
  }
  const nameTrimmed = name.trim();
  await updateUser(req.session.user.id, { name: nameTrimmed, email: emailNorm });
  req.session.user.name = nameTrimmed;
  req.session.user.email = emailNorm;
  res.json({ ok: true, name: nameTrimmed, email: emailNorm });
});

router.patch('/:id', requireElevated, async (req, res) => {
  const user = await getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  const patch = {};
  if (req.body.quotas) patch.quotas = { ...user.quotas, ...req.body.quotas };
  if (req.body.role && ROLE_KEYS.includes(req.body.role)) patch.role = req.body.role;
  await updateUser(req.params.id, patch);
  res.json({ ok: true });
});

router.post('/me/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร' });
  }
  const user = await getUserById(req.session.user.id);
  if (!bcrypt.compareSync(currentPassword || '', user.passwordHash)) {
    return res.status(400).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
  }
  await updateUser(user.id, { passwordHash: bcrypt.hashSync(newPassword, 10) });
  res.json({ ok: true });
});

module.exports = router;
