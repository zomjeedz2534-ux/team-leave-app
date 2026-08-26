const LEAVE_TYPES = [
  { key: 'vacation', label: 'ลาพักร้อน', color: '#2563eb', hasQuota: true },
  { key: 'sick', label: 'ลาป่วย', color: '#dc2626', hasQuota: true },
  { key: 'personal', label: 'ลากิจ', color: '#d97706', hasQuota: true },
  { key: 'other', label: 'อื่นๆ', color: '#6b7280', hasQuota: false },
];

const DEFAULT_QUOTAS = { vacation: 10, sick: 30, personal: 3 };

const ROLES = [
  { key: 'director', label: 'Director' },
  { key: 'manager', label: 'Manager' },
  { key: 'senior', label: 'Senior' },
  { key: 'junior', label: 'Junior' },
];

// Director / Manager / Senior see everyone's data and can approve leave + manage the team.
// Junior only sees their own leave balance.
const ELEVATED_ROLES = ['director', 'manager', 'senior'];

// Lower number = higher rank.
const ROLE_RANK = { director: 1, manager: 2, senior: 3, junior: 4 };

// An approver must outrank the requester (e.g. only Director/Manager can approve a Senior's leave).
// Director is the top rank, so Directors approve each other's (including their own) leave.
function canApprove(approverRole, requesterRole) {
  if (!ROLE_RANK[approverRole] || !ROLE_RANK[requesterRole]) return false;
  if (ROLE_RANK[approverRole] < ROLE_RANK[requesterRole]) return true;
  if (requesterRole === 'director' && approverRole === 'director') return true;
  return false;
}

// จำกัดขนาดไฟล์แนบ (เก็บเป็น base64 ในฐานข้อมูลโดยตรง ไม่ใช้ storage แยก)
const ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024; // 4MB
const ATTACHMENT_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

module.exports = {
  LEAVE_TYPES,
  DEFAULT_QUOTAS,
  ROLES,
  ELEVATED_ROLES,
  ROLE_RANK,
  canApprove,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_ALLOWED_MIME,
};
