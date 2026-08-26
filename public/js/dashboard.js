(function () {
  const USER = window.__APP_USER__;
  const LEAVE_TYPES = window.__LEAVE_TYPES__;
  const ROLES = window.__ROLES__;
  const IS_ELEVATED = window.__IS_ELEVATED__;
  const typeMap = Object.fromEntries(LEAVE_TYPES.map((t) => [t.key, t]));

  // ---------- helpers ----------
  function toast(msg, kind) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show' + (kind ? ' ' + kind : '');
    setTimeout(() => el.classList.remove('show'), 3500);
  }

  async function api(url, opts) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) throw new Error((data && data.error) || 'เกิดข้อผิดพลาด');
    return data;
  }

  function statusLabel(s) {
    return { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธแล้ว' }[s] || s;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function attachmentLinkHtml(l) {
    if (!l.hasAttachment) return '';
    return `<span class="sub"><a href="/api/leaves/${l.id}/attachment" target="_blank" rel="noopener">📎 ดูไฟล์แนบ</a></span>`;
  }

  function lowAdvanceNoticeTag(l) {
    if (!l.lowAdvanceNotice) return '';
    return ' <span class="tag status-warn">แจ้งไม่ถึง 30 วัน</span>';
  }

  // บังคับให้กรอกเหตุผลก่อนลบคำขอลาทุกครั้ง คืนค่า null ถ้าผู้ใช้กดยกเลิก
  function promptDeleteReason() {
    let reason = '';
    while (true) {
      reason = window.prompt('กรุณาระบุเหตุผลที่ลบคำขอนี้ (จำเป็นต้องกรอก):', reason || '');
      if (reason === null) return null;
      reason = reason.trim();
      if (reason) return reason;
      window.alert('กรุณาระบุเหตุผล ห้ามเว้นว่าง');
    }
  }

  // ---------- notifications: someone deleted their own already-approved leave ----------
  const NOTIF_SEEN_KEY = 'teamLeaveApp_historyLastSeenAt';
  const toastedHistoryIds = new Set();

  function getHistoryLastSeenAt() {
    let v = localStorage.getItem(NOTIF_SEEN_KEY);
    if (!v) {
      v = new Date().toISOString();
      try { localStorage.setItem(NOTIF_SEEN_KEY, v); } catch (e) {}
    }
    return new Date(v);
  }

  function markHistorySeen() {
    try { localStorage.setItem(NOTIF_SEEN_KEY, new Date().toISOString()); } catch (e) {}
    updateHistoryBadge(0);
  }

  function updateHistoryBadge(n) {
    const badge = document.getElementById('historyBadge');
    if (!badge) return;
    badge.textContent = n;
    badge.style.display = n > 0 ? 'inline-block' : 'none';
  }

  async function checkDeletionNotifications() {
    if (!IS_ELEVATED) return;
    try {
      const history = await api('/api/leaves/history');
      const lastSeen = getHistoryLastSeenAt();
      const notifs = history.filter(
        (h) =>
          h.action === 'deleted' &&
          h.detail &&
          h.detail.previousStatus === 'approved' &&
          h.actorId === h.targetUserId &&
          new Date(h.createdAt) > lastSeen
      );
      notifs.forEach((h) => {
        if (toastedHistoryIds.has(h.id)) return;
        toastedHistoryIds.add(h.id);
        const d = h.detail;
        toast(
          `⚠️ ${h.actorName} ลบคำขอลาที่อนุมัติแล้วของตัวเอง (${h.typeLabel || ''} ${d.startDate} → ${d.endDate})`,
          'error'
        );
      });
      updateHistoryBadge(notifs.length);
    } catch (e) {
      // เงียบไว้ ไม่รบกวนผู้ใช้
    }
  }

  // ---------- tabs ----------
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });

  function activateTab(tab) {
    tabBtns.forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tab));
    if (tab === 'calendar') loadCalendar();
    if (tab === 'request') loadMyLeaves();
    if (tab === 'pending') loadPending();
    if (tab === 'balance') loadBalance();
    if (tab === 'team') { loadGoogleStatus(); loadTeamQuotas(); }
    if (tab === 'history') { loadAllLeaves(); if (IS_ELEVATED) { loadHistoryLog(); markHistorySeen(); } }
  }

  // ---------- legend ----------
  const legend = document.getElementById('legend');
  legend.innerHTML = LEAVE_TYPES.map(
    (t) => `<span><i style="background:${t.color}"></i>${t.label}</span>`
  ).join('');

  // ---------- calendar ----------
  let calendar;
  async function loadCalendar() {
    const leaves = await api('/api/leaves');
    renderUpcoming(leaves);
    const events = leaves
      .filter((l) => l.status !== 'rejected')
      .map((l) => {
        const t = typeMap[l.type] || { color: '#6b7280', label: l.type };
        const endExclusive = new Date(l.endDate);
        endExclusive.setDate(endExclusive.getDate() + 1);
        return {
          title: `${l.userName} · ${t.label}${l.status === 'pending' ? ' (รออนุมัติ)' : ''}`,
          start: l.startDate,
          end: endExclusive.toISOString().slice(0, 10),
          allDay: true,
          backgroundColor: t.color,
          borderColor: t.color,
          textColor: '#fff',
          classNames: l.status === 'pending' ? ['fc-pending'] : [],
        };
      });

    const el = document.getElementById('calendar');
    if (!calendar) {
      calendar = new FullCalendar.Calendar(el, {
        initialView: 'dayGridMonth',
        height: 'auto',
        headerToolbar: { left: 'prev,next today', center: 'title', right: '' },
        locale: 'th',
        titleFormat: { year: 'numeric', month: 'long', calendar: 'gregory' },
        events,
      });
      calendar.render();
    } else {
      calendar.removeAllEvents();
      calendar.addEventSource(events);
    }
  }

  function renderUpcoming(leaves) {
    const box = document.getElementById('upcomingList');
    if (!box) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const upcoming = leaves
      .filter((l) => l.status !== 'rejected' && l.endDate >= todayStr)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 10);
    if (!upcoming.length) {
      box.innerHTML = '<div class="empty">ไม่มีวันลาที่กำลังจะถึง</div>';
      return;
    }
    box.innerHTML = upcoming
      .map((l) => {
        const t = typeMap[l.type] || { color: '#6b7280', label: l.type };
        return `
      <div class="list-item upcoming-item">
        <div class="meta">
          <span class="name"><i class="dot" style="background:${t.color}"></i>${escapeHtml(l.userName)}</span>
          <span class="sub">${t.label} · ${l.startDate} → ${l.endDate}${l.status === 'pending' ? ' (รออนุมัติ)' : ''}</span>
        </div>
      </div>`;
      })
      .join('');
  }

  // ---------- request form ----------
  const leaveForm = document.getElementById('leaveForm');
  const attachmentInput = document.getElementById('attachmentInput');
  const startDateInput = document.getElementById('startDate');
  const leaveTypeSelect = document.getElementById('leaveType');
  const advanceNoticeWarning = document.getElementById('advanceNoticeWarning');

  function updateAdvanceNoticeWarning() {
    if (!advanceNoticeWarning || !startDateInput || !leaveTypeSelect) return;
    const startVal = startDateInput.value;
    if (!startVal || leaveTypeSelect.value !== 'vacation') {
      advanceNoticeWarning.style.display = 'none';
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(startVal + 'T00:00:00');
    const diffDays = Math.round((start - today) / (1000 * 60 * 60 * 24));
    advanceNoticeWarning.style.display = diffDays < 30 ? 'block' : 'none';
  }
  if (startDateInput) startDateInput.addEventListener('change', updateAdvanceNoticeWarning);
  if (leaveTypeSelect) leaveTypeSelect.addEventListener('change', updateAdvanceNoticeWarning);

  leaveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(leaveForm);
    const payload = Object.fromEntries(fd.entries());
    const extraEmailsList = document.getElementById('extraEmailsList');
    if (extraEmailsList) {
      payload.extraEmails = Array.from(extraEmailsList.querySelectorAll('input:checked'))
        .map((cb) => cb.value)
        .join(',');
    }
    const file = attachmentInput && attachmentInput.files[0];
    if (file) {
      if (file.size > 4 * 1024 * 1024) {
        toast('ไฟล์ใหญ่เกินไป (ไม่เกิน 4MB)', 'error');
        return;
      }
      try {
        payload.attachmentDataUrl = await readFileAsDataUrl(file);
        payload.attachmentFilename = file.name;
      } catch (err) {
        toast('อ่านไฟล์แนบไม่สำเร็จ', 'error');
        return;
      }
    }
    try {
      await api('/api/leaves', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      toast('ส่งคำขอลาสำเร็จ', 'success');
      leaveForm.reset();
      updateAdvanceNoticeWarning();
      loadMyLeaves();
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  async function loadMyLeaves() {
    const box = document.getElementById('myLeaveList');
    const leaves = await api('/api/leaves?mine=true');
    if (!leaves.length) {
      box.innerHTML = '<div class="empty">ยังไม่มีคำขอลา</div>';
      return;
    }
    box.innerHTML = leaves
      .map(
        (l) => `
      <div class="list-item">
        <div class="meta">
          <span class="name">${l.typeLabel} <span class="tag status-${l.status}">${statusLabel(l.status)}</span>${lowAdvanceNoticeTag(l)}</span>
          <span class="sub">${l.startDate} → ${l.endDate} (${l.days} วันทำการ)</span>
          ${l.reason ? `<span class="sub">เหตุผล: ${escapeHtml(l.reason)}</span>` : ''}
          ${l.extraEmails && l.extraEmails.length ? `<span class="sub">Tag: ${l.extraEmails.map(escapeHtml).join(', ')}</span>` : ''}
          ${attachmentLinkHtml(l)}
        </div>
        <div class="actions">
          <button class="btn btn-danger btn-sm" data-cancel="${l.id}">ลบ</button>
        </div>
      </div>`
      )
      .join('');
    box.querySelectorAll('[data-cancel]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const reason = promptDeleteReason();
        if (reason === null) return;
        try {
          await api('/api/leaves/' + btn.dataset.cancel, { method: 'DELETE', body: JSON.stringify({ reason }) });
          toast('ลบคำขอแล้ว', 'success');
          loadMyLeaves();
        } catch (e) {
          toast(e.message, 'error');
        }
      })
    );
  }

  // ---------- pending (admin) ----------
  async function loadPending() {
    const box = document.getElementById('pendingList');
    if (!box) return;
    const leaves = await api('/api/leaves?status=pending');
    updatePendingBadge(leaves.length);
    if (!leaves.length) {
      box.innerHTML = '<div class="empty">ไม่มีคำขอที่รออนุมัติ</div>';
      return;
    }
    box.innerHTML = leaves
      .map(
        (l) => `
      <div class="list-item">
        <div class="meta">
          <span class="name">${l.userName} · ${l.typeLabel}${lowAdvanceNoticeTag(l)}</span>
          <span class="sub">${l.startDate} → ${l.endDate} (${l.days} วันทำการ)</span>
          ${l.reason ? `<span class="sub">เหตุผล: ${escapeHtml(l.reason)}</span>` : ''}
          ${l.extraEmails && l.extraEmails.length ? `<span class="sub">Tag: ${l.extraEmails.map(escapeHtml).join(', ')}</span>` : ''}
          ${attachmentLinkHtml(l)}
        </div>
        <div class="actions">
          <button class="btn btn-success btn-sm" data-approve="${l.id}">อนุมัติ</button>
          <button class="btn btn-danger btn-sm" data-reject="${l.id}">ปฏิเสธ</button>
        </div>
      </div>`
      )
      .join('');
    box.querySelectorAll('[data-approve]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const r = await api('/api/leaves/' + btn.dataset.approve + '/approve', { method: 'POST' });
          if (r.googleSynced) toast('อนุมัติแล้ว และเพิ่มลง Google Calendar สำเร็จ', 'success');
          else toast('อนุมัติแล้ว แต่ยังไม่ได้ซิงก์ Google Calendar' + (r.googleError ? ': ' + r.googleError : ''), 'error');
          loadPending();
        } catch (e) {
          toast(e.message, 'error');
          btn.disabled = false;
        }
      })
    );
    box.querySelectorAll('[data-reject]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          await api('/api/leaves/' + btn.dataset.reject + '/reject', { method: 'POST' });
          toast('ปฏิเสธคำขอแล้ว', 'success');
          loadPending();
        } catch (e) {
          toast(e.message, 'error');
        }
      })
    );
  }

  function updatePendingBadge(n) {
    const badge = document.getElementById('pendingBadge');
    if (!badge) return;
    badge.textContent = n;
    badge.style.display = n > 0 ? 'inline-block' : 'none';
  }

  // ---------- balance ----------
  async function loadBalance() {
    const box = document.getElementById('balanceTable');
    const users = await api('/api/users');
    const visibleUsers = IS_ELEVATED ? users : users.filter((u) => u.id === USER.id);
    const cols = LEAVE_TYPES.filter((t) => t.hasQuota);
    let html = '<table><thead><tr><th>ชื่อ</th>';
    cols.forEach((t) => (html += `<th>${t.label} (ใช้/สิทธิ์)</th>`));
    html += '</tr></thead><tbody>';
    visibleUsers.forEach((u) => {
      html += `<tr><td>${u.name}</td>`;
      cols.forEach((t) => {
        const r = u.remaining[t.key] || { used: 0, quota: 0, remaining: 0 };
        const low = r.remaining <= 0;
        html += `<td>${r.used} / ${r.quota} วัน <span class="muted">(เหลือ ${r.remaining < 0 ? 0 : r.remaining})</span></td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    box.innerHTML = html;
  }

  // ---------- team quota management (admin) ----------
  async function loadTeamQuotas() {
    const box = document.getElementById('teamQuotaTable');
    if (!box) return;
    const users = await api('/api/users');
    const cols = LEAVE_TYPES.filter((t) => t.hasQuota);
    let html = '<table><thead><tr><th>ชื่อ</th><th>อีเมล</th><th>บทบาท</th>';
    cols.forEach((t) => (html += `<th>${t.label} (วัน/ปี)</th>`));
    html += '<th></th></tr></thead><tbody>';
    users.forEach((u) => {
      html += `<tr data-user="${u.id}">
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>
          <select data-role>
            ${ROLES.map((r) => `<option value="${r.key}" ${u.role === r.key ? 'selected' : ''}>${r.label}</option>`).join('')}
          </select>
        </td>`;
      cols.forEach((t) => {
        const q = (u.quotas && u.quotas[t.key] != null) ? u.quotas[t.key] : 0;
        html += `<td><input type="number" min="0" step="0.5" data-quota="${t.key}" value="${q}" style="width:80px" /></td>`;
      });
      html += `<td style="display:flex; gap:6px">
          <button class="btn btn-primary btn-sm" data-save-user="${u.id}">บันทึก</button>
          ${u.id !== USER.id ? `<button class="btn btn-danger btn-sm" data-delete-user="${u.id}">ลบ</button>` : ''}
        </td></tr>`;
    });
    html += '</tbody></table>';
    box.innerHTML = html;

    box.querySelectorAll('[data-save-user]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const row = box.querySelector(`tr[data-user="${btn.dataset.saveUser}"]`);
        const quotas = {};
        row.querySelectorAll('[data-quota]').forEach((input) => {
          quotas[input.dataset.quota] = Number(input.value) || 0;
        });
        const role = row.querySelector('[data-role]').value;
        try {
          await api('/api/users/' + btn.dataset.saveUser, {
            method: 'PATCH',
            body: JSON.stringify({ quotas, role }),
          });
          toast('บันทึกสิทธิวันลาแล้ว', 'success');
        } catch (e) {
          toast(e.message, 'error');
        }
      })
    );

    box.querySelectorAll('[data-delete-user]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const row = box.querySelector(`tr[data-user="${btn.dataset.deleteUser}"]`);
        const name = row.querySelector('td').textContent;
        if (!confirm(`ลบ "${name}" ออกจากทีม? ประวัติการลาของคนนี้จะถูกลบไปด้วย และย้อนกลับไม่ได้`)) return;
        try {
          await api('/api/users/' + btn.dataset.deleteUser, { method: 'DELETE' });
          toast('ลบสมาชิกแล้ว', 'success');
          loadTeamQuotas();
        } catch (e) {
          toast(e.message, 'error');
        }
      })
    );
  }

  // ---------- team management ----------
  const addUserForm = document.getElementById('addUserForm');
  if (addUserForm) {
    addUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(addUserForm);
      try {
        await api('/api/users', { method: 'POST', body: JSON.stringify(Object.fromEntries(fd.entries())) });
        toast('เพิ่มสมาชิกทีมสำเร็จ', 'success');
        addUserForm.reset();
        loadTeamQuotas();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  }

  async function loadGoogleStatus() {
    const statusEl = document.getElementById('googleStatus');
    const connectBtn = document.getElementById('connectGoogleBtn');
    const disconnectBtn = document.getElementById('disconnectGoogleBtn');
    if (!statusEl) return;
    try {
      const r = await api('/auth/google/status');
      if (r.connected) {
        statusEl.textContent = '✅ เชื่อมต่อ Google Calendar แล้ว';
        connectBtn.style.display = 'none';
        disconnectBtn.style.display = 'inline-block';
      } else {
        statusEl.textContent = '⚠️ ยังไม่ได้เชื่อมต่อ Google Calendar';
        connectBtn.style.display = 'inline-block';
        disconnectBtn.style.display = 'none';
      }
    } catch (e) {
      statusEl.textContent = 'ไม่สามารถตรวจสอบสถานะได้';
    }
  }
  const disconnectBtn = document.getElementById('disconnectGoogleBtn');
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', async () => {
      await api('/auth/google/disconnect', { method: 'POST' });
      toast('ยกเลิกการเชื่อมต่อ Google Calendar แล้ว', 'success');
      loadGoogleStatus();
    });
  }

  // ---------- history / manage leaves ----------
  async function loadAllLeaves() {
    const box = document.getElementById('allLeaveList');
    if (!box) return;
    const leaves = await api(IS_ELEVATED ? '/api/leaves' : '/api/leaves?mine=true');
    if (!leaves.length) {
      box.innerHTML = '<div class="empty">ยังไม่มีคำขอลา</div>';
      return;
    }
    box.innerHTML = leaves
      .map(
        (l) => `
      <div class="list-item" data-leave-item="${l.id}">
        <div class="view-mode">
          <div class="meta">
            <span class="name">${escapeHtml(l.userName)} · ${l.typeLabel} <span class="tag status-${l.status}">${statusLabel(l.status)}</span>${lowAdvanceNoticeTag(l)}</span>
            <span class="sub">${l.startDate} → ${l.endDate} (${l.days} วันทำการ)</span>
            ${l.reason ? `<span class="sub">เหตุผล: ${escapeHtml(l.reason)}</span>` : ''}
            ${attachmentLinkHtml(l)}
          </div>
          <div class="actions">
            ${IS_ELEVATED ? `<button class="btn btn-ghost btn-sm" data-edit-leave="${l.id}">แก้ไข</button>` : ''}
            <button class="btn btn-danger btn-sm" data-delete-leave="${l.id}">ลบ</button>
          </div>
        </div>
        <div class="edit-mode" style="display:none">
          <div class="edit-grid">
            <label>วันที่เริ่ม<input type="date" data-f="startDate" value="${l.startDate}" /></label>
            <label>วันที่สิ้นสุด<input type="date" data-f="endDate" value="${l.endDate}" /></label>
            <label>ประเภท<select data-f="type">${LEAVE_TYPES.map((t) => `<option value="${t.key}" ${t.key === l.type ? 'selected' : ''}>${t.label}</option>`).join('')}</select></label>
            <label>เหตุผล<input type="text" data-f="reason" value="${escapeHtml(l.reason)}" /></label>
          </div>
          <div class="actions">
            <button class="btn btn-primary btn-sm" data-save-edit="${l.id}">บันทึก</button>
            <button class="btn btn-ghost btn-sm" data-cancel-edit="${l.id}">ยกเลิก</button>
          </div>
        </div>
      </div>`
      )
      .join('');

    box.querySelectorAll('[data-edit-leave]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const item = box.querySelector(`[data-leave-item="${btn.dataset.editLeave}"]`);
        item.querySelector('.view-mode').style.display = 'none';
        item.querySelector('.edit-mode').style.display = 'block';
      })
    );
    box.querySelectorAll('[data-cancel-edit]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const item = box.querySelector(`[data-leave-item="${btn.dataset.cancelEdit}"]`);
        item.querySelector('.edit-mode').style.display = 'none';
        item.querySelector('.view-mode').style.display = 'flex';
      })
    );
    box.querySelectorAll('[data-save-edit]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const id = btn.dataset.saveEdit;
        const item = box.querySelector(`[data-leave-item="${id}"]`);
        const patch = {};
        item.querySelectorAll('[data-f]').forEach((input) => {
          patch[input.dataset.f] = input.value;
        });
        try {
          const r = await api('/api/leaves/' + id, { method: 'PATCH', body: JSON.stringify(patch) });
          if (r.googleError) toast('บันทึกแล้ว แต่อัปเดต Google Calendar ไม่สำเร็จ: ' + r.googleError, 'error');
          else toast('บันทึกการแก้ไขแล้ว', 'success');
          loadAllLeaves();
          if (IS_ELEVATED) loadHistoryLog();
        } catch (e) {
          toast(e.message, 'error');
        }
      })
    );
    box.querySelectorAll('[data-delete-leave]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const reason = promptDeleteReason();
        if (reason === null) return;
        try {
          await api('/api/leaves/' + btn.dataset.deleteLeave, { method: 'DELETE', body: JSON.stringify({ reason }) });
          toast('ลบคำขอลาแล้ว', 'success');
          loadAllLeaves();
          if (IS_ELEVATED) loadHistoryLog();
        } catch (e) {
          toast(e.message, 'error');
        }
      })
    );
  }

  async function loadHistoryLog() {
    const box = document.getElementById('historyLog');
    if (!box) return;
    const history = await api('/api/leaves/history');
    if (!history.length) {
      box.innerHTML = '<div class="empty">ยังไม่มีประวัติการดำเนินการ</div>';
      return;
    }
    const actionLabel = { approved: 'อนุมัติ', rejected: 'ปฏิเสธ', edited: 'แก้ไข', deleted: 'ลบ', cancelled: 'ยกเลิก' };
    const actionTag = { approved: 'approved', rejected: 'rejected', deleted: 'rejected', edited: 'pending', cancelled: 'pending' };
    box.innerHTML = history
      .map((h) => {
        const d = h.detail || {};
        const after = d.after || d;
        const dates = after.startDate ? `${after.startDate} → ${after.endDate || after.startDate}` : '';
        return `
      <div class="list-item">
        <div class="meta">
          <span class="name">${escapeHtml(h.actorName)} <span class="tag status-${actionTag[h.action] || 'pending'}">${actionLabel[h.action] || h.action}</span></span>
          <span class="sub">คำขอลาของ ${escapeHtml(h.targetUserName)}${h.typeLabel ? ' · ' + h.typeLabel : ''}${dates ? ' · ' + dates : ''}</span>
          ${d.deleteReason ? `<span class="sub">เหตุผลที่ลบ: ${escapeHtml(d.deleteReason)}</span>` : ''}
          <span class="sub muted">${new Date(h.createdAt).toLocaleString('th-TH')}</span>
        </div>
      </div>`;
      })
      .join('');
  }

  // ---------- account ----------
  const profileForm = document.getElementById('profileForm');
  if (profileForm) {
    document.getElementById('profileName').value = USER.name;
    document.getElementById('profileEmail').value = USER.email;
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(profileForm);
      try {
        const r = await api('/api/users/me', { method: 'PATCH', body: JSON.stringify(Object.fromEntries(fd.entries())) });
        USER.name = r.name;
        USER.email = r.email;
        const topbarName = document.getElementById('topbarUserName');
        if (topbarName) topbarName.textContent = r.name;
        toast('บันทึกข้อมูลส่วนตัวสำเร็จ', 'success');
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  }

  const passwordForm = document.getElementById('passwordForm');
  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(passwordForm);
    try {
      await api('/api/users/me/password', { method: 'POST', body: JSON.stringify(Object.fromEntries(fd.entries())) });
      toast('เปลี่ยนรหัสผ่านสำเร็จ', 'success');
      passwordForm.reset();
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- auto-refresh (so changes from others show up without pressing F5) ----------
  function currentTab() {
    const active = document.querySelector('.tab-btn.active');
    return active ? active.dataset.tab : null;
  }

  function hasOpenEdit(box) {
    if (!box) return false;
    return Array.from(box.querySelectorAll('.edit-mode')).some((el) => el.style.display !== 'none');
  }

  async function refreshCurrentTab() {
    const tab = currentTab();
    if (document.hidden || !tab) return;
    try {
      if (tab === 'calendar') await loadCalendar();
      if (tab === 'request') await loadMyLeaves();
      if (tab === 'pending') await loadPending();
      if (tab === 'balance') await loadBalance();
      if (tab === 'history') {
        if (!hasOpenEdit(document.getElementById('allLeaveList'))) await loadAllLeaves();
        if (IS_ELEVATED) await loadHistoryLog();
      }
      // เก็บ badge คำขอรออนุมัติให้ทันสมัยแม้ไม่ได้อยู่แท็บนั้น
      if (IS_ELEVATED && tab !== 'pending') {
        const pending = await api('/api/leaves?status=pending');
        updatePendingBadge(pending.length);
      }
    } catch (e) {
      // เงียบไว้ ไม่รบกวนผู้ใช้ด้วย error ของการ refresh พื้นหลัง
    }
  }

  setInterval(refreshCurrentTab, 20000);
  setInterval(checkDeletionNotifications, 20000);

  // ---------- init ----------
  const params = new URLSearchParams(location.search);
  if (params.get('google') === 'connected') toast('เชื่อมต่อ Google Calendar สำเร็จ', 'success');
  if (params.get('google') === 'error') toast('เชื่อมต่อ Google Calendar ไม่สำเร็จ', 'error');
  if (params.has('google')) history.replaceState({}, '', location.pathname);

  loadCalendar();
  if (document.getElementById('pendingList')) loadPending();
  checkDeletionNotifications();
})();
