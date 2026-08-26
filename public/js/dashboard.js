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
        events,
      });
      calendar.render();
    } else {
      calendar.removeAllEvents();
      calendar.addEventSource(events);
    }
  }

  // ---------- request form ----------
  const leaveForm = document.getElementById('leaveForm');
  leaveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(leaveForm);
    try {
      await api('/api/leaves', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(fd.entries())),
      });
      toast('ส่งคำขอลาสำเร็จ', 'success');
      leaveForm.reset();
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
          <span class="name">${l.typeLabel} <span class="tag status-${l.status}">${statusLabel(l.status)}</span></span>
          <span class="sub">${l.startDate} → ${l.endDate} (${l.days} วันทำการ)</span>
          ${l.reason ? `<span class="sub">เหตุผล: ${escapeHtml(l.reason)}</span>` : ''}
          ${l.extraEmails && l.extraEmails.length ? `<span class="sub">Tag: ${l.extraEmails.map(escapeHtml).join(', ')}</span>` : ''}
        </div>
        <div class="actions">
          ${l.status === 'pending' ? `<button class="btn btn-danger btn-sm" data-cancel="${l.id}">ยกเลิก</button>` : ''}
        </div>
      </div>`
      )
      .join('');
    box.querySelectorAll('[data-cancel]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          await api('/api/leaves/' + btn.dataset.cancel, { method: 'DELETE' });
          toast('ยกเลิกคำขอแล้ว', 'success');
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
          <span class="name">${l.userName} · ${l.typeLabel}</span>
          <span class="sub">${l.startDate} → ${l.endDate} (${l.days} วันทำการ)</span>
          ${l.reason ? `<span class="sub">เหตุผล: ${escapeHtml(l.reason)}</span>` : ''}
          ${l.extraEmails && l.extraEmails.length ? `<span class="sub">Tag: ${l.extraEmails.map(escapeHtml).join(', ')}</span>` : ''}
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

  // ---------- init ----------
  const params = new URLSearchParams(location.search);
  if (params.get('google') === 'connected') toast('เชื่อมต่อ Google Calendar สำเร็จ', 'success');
  if (params.get('google') === 'error') toast('เชื่อมต่อ Google Calendar ไม่สำเร็จ', 'error');
  if (params.has('google')) history.replaceState({}, '', location.pathname);

  loadCalendar();
  if (document.getElementById('pendingList')) loadPending();
})();
