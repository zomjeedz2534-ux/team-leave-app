const { google } = require('googleapis');
const dayjs = require('dayjs');
const { getSetting, setSetting, deleteSetting } = require('../repositories/settings');
const { LEAVE_TYPES } = require('../constants');

function leaveTypeLabel(key) {
  const t = LEAVE_TYPES.find((t) => t.key === key);
  return t ? t.label : key;
}

function getOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error('ยังไม่ได้ตั้งค่า Google OAuth credentials ใน .env (ดูขั้นตอนใน README.md)');
  }
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
  });
}

async function handleCallback(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  const existing = (await getSetting('googleTokens')) || {};
  const merged = { ...existing, ...tokens };
  await setSetting('googleTokens', merged);
  return merged;
}

async function isConnected() {
  const tokens = await getSetting('googleTokens');
  return !!(tokens && (tokens.refresh_token || tokens.access_token));
}

async function disconnect() {
  await deleteSetting('googleTokens');
}

async function getAuthorizedClient() {
  const tokens = await getSetting('googleTokens');
  if (!tokens) return null;
  const client = getOAuthClient();
  client.setCredentials(tokens);
  client.on('tokens', (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    setSetting('googleTokens', merged).catch(() => {});
  });
  return client;
}

// สร้าง event แบบ all-day ใน Google Calendar หลัก ("ฉัน") แล้ว tag อีเมลที่เกี่ยวข้องเป็น attendee
async function createLeaveEvent(leave, requester, approver) {
  const auth = await getAuthorizedClient();
  if (!auth) throw new Error('ยังไม่ได้เชื่อมต่อ Google Calendar');
  const calendar = google.calendar({ version: 'v3', auth });

  const attendees = [];
  const seen = new Set();
  [requester, approver].forEach((p) => {
    if (p && p.email && !seen.has(p.email)) {
      attendees.push({ email: p.email });
      seen.add(p.email);
    }
  });
  (leave.extraEmails || []).forEach((email) => {
    if (email && !seen.has(email)) {
      attendees.push({ email });
      seen.add(email);
    }
  });

  const event = {
    summary: `ลา: ${requester ? requester.name : ''} (${leaveTypeLabel(leave.type)})`,
    description: leave.reason || '',
    start: { date: leave.startDate },
    end: { date: dayjs(leave.endDate).add(1, 'day').format('YYYY-MM-DD') },
    attendees,
  };

  const result = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: event,
    sendUpdates: 'all',
  });
  return result.data.id;
}

module.exports = { getAuthUrl, handleCallback, isConnected, disconnect, createLeaveEvent };
