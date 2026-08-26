require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');

const { pool, init } = require('./db');
const { requireLogin } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const leaveRoutes = require('./routes/leaves');
const userRoutes = require('./routes/users');
const googleRoutes = require('./routes/google');
const { LEAVE_TYPES, ROLES, ELEVATED_ROLES } = require('./constants');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8, secure: 'auto' },
  })
);

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

app.use('/', authRoutes);
app.use('/auth/google', googleRoutes);
app.use('/api/leaves', requireLogin, leaveRoutes);
app.use('/api/users', requireLogin, userRoutes);

app.get('/', requireLogin, (req, res) => {
  res.render('dashboard', {
    user: req.session.user,
    leaveTypes: LEAVE_TYPES,
    roles: ROLES,
    isElevated: ELEVATED_ROLES.includes(req.session.user.role),
    roleLabel: (ROLES.find((r) => r.key === req.session.user.role) || {}).label || req.session.user.role,
  });
});

const PORT = process.env.PORT || 3300;

init()
  .then(() => {
    app.listen(PORT, () => console.log(`Team Leave App running at http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error('เชื่อมต่อฐานข้อมูลไม่สำเร็จ:', e.message);
    process.exit(1);
  });
