require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { init, pool } = require('./db');
const { createUser, getUserByEmail } = require('./repositories/users');
const { createLeave } = require('./repositories/leaves');

// ย้ายข้อมูลจาก db.json (lowdb) เดิม เข้า Postgres ครั้งเดียว รันได้ซ้ำอย่างปลอดภัย (ข้ามรายการที่มีอยู่แล้ว)
async function main() {
  const dbPath = path.join(__dirname, 'db.json');
  if (!fs.existsSync(dbPath)) {
    console.log('ไม่พบไฟล์ db.json ไม่มีอะไรต้อง migrate');
    return;
  }
  const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  await init();

  let userCount = 0;
  for (const u of data.users || []) {
    const existing = await getUserByEmail(u.email);
    if (existing) {
      console.log(`ข้ามผู้ใช้ ${u.email} (มีอยู่แล้วใน Postgres)`);
      continue;
    }
    await createUser({
      id: u.id,
      name: u.name,
      email: u.email,
      passwordHash: u.passwordHash,
      role: u.role,
      quotas: u.quotas || {},
      createdAt: u.createdAt || new Date().toISOString(),
    });
    userCount++;
  }

  let leaveCount = 0;
  for (const l of data.leaves || []) {
    try {
      await createLeave({
        id: l.id,
        userId: l.userId,
        startDate: l.startDate,
        endDate: l.endDate,
        type: l.type,
        reason: l.reason || '',
        extraEmails: l.extraEmails || [],
        status: l.status,
        createdAt: l.createdAt,
        decidedBy: l.decidedBy || null,
        decidedAt: l.decidedAt || null,
        googleEventId: l.googleEventId || null,
        googleSynced: !!l.googleSynced,
      });
      leaveCount++;
    } catch (e) {
      if (e.code === '23505') {
        console.log(`ข้ามคำขอลา ${l.id} (มีอยู่แล้วใน Postgres)`);
      } else {
        throw e;
      }
    }
  }

  console.log(`ย้ายข้อมูลสำเร็จ: ${userCount} ผู้ใช้ใหม่, ${leaveCount} คำขอลาใหม่`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
