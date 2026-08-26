const express = require('express');
const router = express.Router();
const { requireLogin, requireElevated } = require('../middleware/auth');
const googleCal = require('../services/googleCalendar');

router.get('/', requireLogin, requireElevated, (req, res) => {
  try {
    res.redirect(googleCal.getAuthUrl());
  } catch (e) {
    res.redirect('/?google=error&msg=' + encodeURIComponent(e.message));
  }
});

router.get('/callback', requireLogin, requireElevated, async (req, res) => {
  if (req.query.error) return res.redirect('/?google=error');
  try {
    await googleCal.handleCallback(req.query.code);
    res.redirect('/?google=connected');
  } catch (e) {
    res.redirect('/?google=error&msg=' + encodeURIComponent(e.message));
  }
});

router.get('/status', requireLogin, async (req, res) => {
  res.json({ connected: await googleCal.isConnected() });
});

router.post('/disconnect', requireLogin, requireElevated, async (req, res) => {
  await googleCal.disconnect();
  res.json({ ok: true });
});

module.exports = router;
