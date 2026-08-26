# ระบบลาพักร้อนของทีม (Team Leave App)

เว็บแอปสำหรับทีม: ปฏิทินวันลา, ฟอร์มขอลา, รายการรออนุมัติ, สรุปวันลาคงเหลือ, ระบบอนุมัติ/ปฏิเสธ และเมื่ออนุมัติแล้วจะสร้าง event ลงใน Google Calendar ของผู้ดูแลระบบโดยอัตโนมัติ พร้อม tag อีเมลผู้ขอลาเป็นผู้เข้าร่วม (attendee)

## 1) ติดตั้งและรันครั้งแรก

```bash
npm install
cp .env.example .env
```

เปิดไฟล์ `.env` แล้วตั้งค่า `SESSION_SECRET` เป็นข้อความสุ่มยาวๆ (ใช้ค่าอะไรก็ได้ที่คาดเดายาก)

สร้างบัญชีผู้ดูแลระบบเริ่มต้น (แก้ `ADMIN_EMAIL` / `ADMIN_PASSWORD` ใน `.env` ก่อนได้ถ้าต้องการ):

```bash
npm run seed
```

รันเซิร์ฟเวอร์:

```bash
npm start
```

เปิดเบราว์เซอร์ไปที่ `http://localhost:3300` แล้วเข้าสู่ระบบด้วยบัญชีที่ seed ไว้ (ค่าเริ่มต้น: `admin@example.com` / `admin123` — **ให้เปลี่ยนรหัสผ่านทันทีที่หน้า "บัญชีของฉัน"**)

จากนั้นผู้ดูแลระบบสามารถเพิ่มสมาชิกทีมคนอื่นได้ที่แท็บ **"จัดการทีม"**

## 2) ตั้งค่า Google Calendar (ทำตามขั้นตอนนี้เอง)

ระบบต้องใช้ OAuth Client ของ Google เพื่อขอสิทธิ์เขียนลงปฏิทินของคุณ ทำตามขั้นตอนนี้ครั้งเดียว:

1. ไปที่ [Google Cloud Console](https://console.cloud.google.com/) แล้วสร้างโปรเจกต์ใหม่ (หรือใช้โปรเจกต์เดิม)
2. เปิดเมนู **APIs & Services > Library** ค้นหา **Google Calendar API** แล้วกด **Enable**
3. ไปที่ **APIs & Services > OAuth consent screen**
   - เลือก User Type เป็น **External** (ถ้าไม่ได้ใช้ Google Workspace องค์กร) หรือ **Internal** (ถ้าใช้ Workspace)
   - กรอกชื่อแอป, อีเมลติดต่อ ฯลฯ ตามที่ระบบขอ
   - ในหน้า **Test users** ให้เพิ่มอีเมล Google ของคุณ (บัญชีที่จะเป็นเจ้าของปฏิทิน) ลงไปด้วย ถ้าแอปยังอยู่ในสถานะ Testing
4. ไปที่ **APIs & Services > Credentials** กด **Create Credentials > OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: เพิ่ม `http://localhost:3300/auth/google/callback`
   - กด Create แล้วจะได้ **Client ID** และ **Client secret**
5. เปิดไฟล์ `.env` แล้วกรอก:
   ```
   GOOGLE_CLIENT_ID=<client id ที่ได้>
   GOOGLE_CLIENT_SECRET=<client secret ที่ได้>
   GOOGLE_REDIRECT_URI=http://localhost:3300/auth/google/callback
   ```
6. รันเซิร์ฟเวอร์ใหม่ (`npm start`) แล้วเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ
7. ไปที่แท็บ **"จัดการทีม" > เชื่อมต่อ Google Calendar** แล้วกดปุ่ม **"เชื่อมต่อ Google Calendar"**
8. ล็อกอินด้วยบัญชี Google ที่ต้องการให้ event ไปลง (ปฏิทินของ "ฉัน") แล้วกด **Allow**

หลังจากนี้ทุกครั้งที่มีการ **อนุมัติ** คำขอลา ระบบจะ:
- สร้าง event แบบ all-day ในปฏิทินหลัก (primary) ของบัญชีที่เชื่อมต่อไว้
- ใส่อีเมลผู้ขอลา (และผู้อนุมัติ ถ้าเป็นคนละอีเมล) เป็น **attendee** ของ event นั้น ทำให้ Google ส่งคำเชิญ/แจ้งเตือนไปยังอีเมลที่เกี่ยวข้องอัตโนมัติ

> หมายเหตุ: ถ้า Google Calendar ยังไม่ได้เชื่อมต่อตอนอนุมัติ ระบบจะยังอนุมัติคำขอให้ตามปกติ แต่จะแจ้งเตือนว่ายังไม่ได้ซิงก์ ผู้ดูแลระบบสามารถเชื่อมต่อภายหลังแล้วกดปุ่ม "ซิงก์" ที่คำขอนั้นเพิ่มได้ (ผ่าน API `/api/leaves/:id/sync-google`)

## โครงสร้างระบบ

- `server.js` — จุดเริ่มต้น Express app
- `db.js` — ฐานข้อมูลไฟล์ JSON (`db.json`) ผ่าน lowdb ไม่ต้องติดตั้งฐานข้อมูลแยก
- `routes/` — เส้นทาง API และหน้าเว็บ (auth, users, leaves, google)
- `services/googleCalendar.js` — การเชื่อมต่อและสร้าง event ผ่าน Google Calendar API
- `services/leaveCalc.js` — คำนวณจำนวนวันลา (วันทำการ) และวันลาคงเหลือ
- `views/` — หน้าเว็บ (EJS)
- `public/` — CSS/JS ฝั่งหน้าบ้าน (ใช้ FullCalendar สำหรับปฏิทิน)

## ข้อจำกัดที่ควรรู้

- ฐานข้อมูลเป็นไฟล์ `db.json` เหมาะสำหรับทีมขนาดเล็ก-กลาง รันบนเครื่องเดียว ถ้าต้องการ deploy จริงจังหรือใช้พร้อมกันหลาย instance ควรย้ายไปใช้ฐานข้อมูลจริง (เช่น PostgreSQL)
- วันลาคงเหลือคำนวณจากวันทำการ (จันทร์–ศุกร์) ไม่ได้หักวันหยุดนักขัตฤกษ์ให้อัตโนมัติ
- session เก็บในหน่วยความจำเซิร์ฟเวอร์ (restart เซิร์ฟเวอร์แล้วต้อง login ใหม่)
