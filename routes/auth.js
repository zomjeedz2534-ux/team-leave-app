const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getUserByEmail } = require('../repositories/users');

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const emailNorm = (email || '').trim().toLowerCase();
  const user = await getUserByEmail(emailNorm);
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.render('login', { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  }
  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.redirect('/');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
