(function () {
  const USE_LOGIN = true;
  const loginSection = document.getElementById('login-section');
  const adminSection = document.getElementById('admin-section');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const btnLogout = document.getElementById('btn-logout');
  const tbody = document.querySelector('#requests-table tbody');
  const emptyState = document.getElementById('empty-state');

  function statusClass(status) {
    const s = (status || '').toLowerCase();
    if (s === 'approved') return 'badge--approved';
    if (s === 'rejected') return 'badge--rejected';
    return 'badge--pending';
  }

  function isValidEmail(email) {
    return typeof email === 'string' && /^\S+@\S+\.\S+$/.test(email.trim());
  }

  async function renderTable() {
    const rows = await HostelStorage.getAllRequestsAsync();
    tbody.innerHTML = '';
    if (!rows.length) {
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(r.name)}</td>
        <td><code>${escapeHtml(r.rollNumber)}</code></td>
        <td>${escapeHtml(r.roomNumber)}</td>
        <td title="${escapeHtml(r.reason)}">${escapeHtml(truncate(r.reason, 48))}</td>
        <td><span class="badge ${statusClass(r.status)}">${escapeHtml(r.status || 'Pending')}</span></td>
        <td class="actions-cell">
          <button type="button" class="btn btn--success" data-action="approve" data-id="${escapeHtml(r.id)}">Approve</button>
          <button type="button" class="btn btn--danger" data-action="reject" data-id="${escapeHtml(r.id)}">Reject</button>
          <button type="button" class="btn btn--secondary" data-action="delete" data-id="${escapeHtml(r.id)}">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function escapeHtml(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function truncate(s, n) {
    const str = String(s || '');
    return str.length <= n ? str : str.slice(0, n - 1) + '…';
  }

  async function showAdmin() {
    loginSection.classList.add('hidden');
    adminSection.classList.remove('hidden');
    await renderTable();
    initScannerIfNeeded();
  }

  function showLogin() {
    adminSection.classList.add('hidden');
    loginSection.classList.remove('hidden');
  }

  const notConfiguredBanner = document.getElementById('admin-not-configured');
  let scannerInitialized = false;

  function safeNextPage() {
    const n = new URLSearchParams(window.location.search).get('next');
    if (n === 'scanner' || n === 'scanner.html') return 'scanner';
    return null;
  }

  function scrollToScannerBlock() {
    document.getElementById('admin-scanner')?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }

  function initScannerIfNeeded() {
    if (scannerInitialized || typeof window.initHostelScanner !== 'function') return;
    scannerInitialized = true;
    window.initHostelScanner({
      readerId: 'admin-reader',
      resultOkId: 'admin-scan-result-ok',
      resultInvalidId: 'admin-scan-result-invalid',
      btnStartId: 'admin-btn-start-scan',
      btnStopId: 'admin-btn-stop-scan',
      fieldNameId: 'admin-scan-name',
      fieldRollId: 'admin-scan-roll',
      fieldRoomId: 'admin-scan-room',
      fieldStatusId: 'admin-scan-status',
      fieldIdId: 'admin-scan-id',
    });
  }

  async function initGate() {
    if (!USE_LOGIN) {
      loginSection.classList.add('hidden');
      adminSection.classList.remove('hidden');
      if (btnLogout) btnLogout.classList.add('hidden');
      await renderTable();
      return;
    }
    if (notConfiguredBanner) {
      notConfiguredBanner.classList.toggle('hidden', HostelAuth.isAdminConfigured());
    }
    if (HostelAuth.isAdminLoggedIn()) {
      const next = safeNextPage();
      if (next === 'scanner') {
        window.history.replaceState(null, '', 'admin.html#scanner');
        await showAdmin();
        requestAnimationFrame(scrollToScannerBlock);
        return;
      }
      await showAdmin();
      if (location.hash === '#scanner') {
        requestAnimationFrame(scrollToScannerBlock);
      }
    } else showLogin();
  }

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    loginError.classList.add('hidden');
    const fd = new FormData(loginForm);
    const user = fd.get('username');
    const pass = fd.get('password');
    const res = await HostelAuth.adminLogin(user, pass);
    if (res.ok) {
      const next = safeNextPage();
      if (next === 'scanner') {
        window.history.replaceState(null, '', 'admin.html#scanner');
        await showAdmin();
        requestAnimationFrame(scrollToScannerBlock);
        return;
      }
      await showAdmin();
    } else {
      loginError.textContent = res.message || 'Login failed.';
      loginError.classList.remove('hidden');
    }
  });

  btnLogout.addEventListener('click', function () {
    HostelAuth.adminLogout();
    showLogin();
    loginForm.reset();
  });

  tbody.addEventListener('click', async function (e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    if (!id) return;

    if (action === 'delete') {
      await HostelStorage.deleteRequestAsync(id);
      await renderTable();
      return;
    }

    const status = action === 'approve' ? 'Approved' : 'Rejected';
    const updated = await HostelStorage.updateRequestStatusAsync(id, status);
    if (status === 'Approved' && updated) {
      // Email sent automatically by backend
    }
    await renderTable();
  });

  initGate();
})();
