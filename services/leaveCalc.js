const dayjs = require('dayjs');
const { LEAVE_TYPES } = require('../constants');
const { getUserById } = require('../repositories/users');
const { getApprovedLeavesForUser } = require('../repositories/leaves');

// นับเฉพาะวันทำการ (จันทร์–ศุกร์) รวมวันเริ่มและวันสิ้นสุด
function countBusinessDays(start, end) {
  let d = dayjs(start);
  const endD = dayjs(end);
  let count = 0;
  while (d.isBefore(endD) || d.isSame(endD, 'day')) {
    const dow = d.day();
    if (dow !== 0 && dow !== 6) count++;
    d = d.add(1, 'day');
  }
  return count;
}

async function remainingForUser(userId) {
  const user = await getUserById(userId);
  if (!user) return {};
  const approved = await getApprovedLeavesForUser(userId);
  const result = {};
  LEAVE_TYPES.forEach((t) => {
    const used = approved
      .filter((l) => l.type === t.key)
      .reduce((sum, l) => sum + countBusinessDays(l.startDate, l.endDate), 0);
    const quota = t.hasQuota ? (user.quotas && user.quotas[t.key] != null ? user.quotas[t.key] : 0) : null;
    result[t.key] = { used, quota, remaining: quota != null ? quota - used : null };
  });
  return result;
}

module.exports = { countBusinessDays, remainingForUser };
