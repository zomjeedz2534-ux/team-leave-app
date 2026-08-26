const { ELEVATED_ROLES } = require('../constants');

function requireLogin(req, res, next) {
  if (!req.session.user) {
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(401).json({ error: 'ยังไม่ได้เข้าสู่ระบบ' });
    }
    return res.redirect('/login');
  }
  next();
}

// Director / Manager / Senior — approving leave and managing the team.
function requireElevated(req, res, next) {
  if (!req.session.user || !ELEVATED_ROLES.includes(req.session.user.role)) {
    if (req.originalUrl.startsWith('/api/') || req.originalUrl.startsWith('/auth/')) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์ดำเนินการนี้' });
    }
    return res.status(403).send('ไม่มีสิทธิ์ดำเนินการนี้');
  }
  next();
}

module.exports = { requireLogin, requireElevated };
