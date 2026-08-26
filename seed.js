require('dotenv').config();
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const { DEFAULT_QUOTAS } = require('./constants');
const { init, pool } = require('./db');
const { getUserByEmail, createUser } = require('./repositories/users');

const name = process.env.ADMIN_NAME || 'ผู้ดูแลระบบ';
const email = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
const password = process.env.ADMIN_PASSWORD || 'admin123';

async function main() {
  await init();
  const existing = await getUserByEmail(email);
  if (existing) {
    console.log(`มีผู้ใช้อีเมล ${email} อยู่แล้ว ข้ามการสร้างผู้ดูแลระบบเริ่มต้น`);
  } else {
    await createUser({
      id: nanoid(10),
      name,
      email,
      passwordHash: bcrypt.hashSync(password, 10),
      role: 'director',
      quotas: { ...DEFAULT_QUOTAS },
      createdAt: new Date().toISOString(),
    });
    console.log('สร้างบัญชีผู้ดูแลระบบเริ่มต้นสำเร็จ');
    console.log(`  อีเมล   : ${email}`);
    console.log(`  รหัสผ่าน: ${password}`);
    console.log('*** กรุณาเข้าสู่ระบบแล้วเปลี่ยนรหัสผ่านทันทีในหน้า "บัญชีของฉัน" ***');
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
