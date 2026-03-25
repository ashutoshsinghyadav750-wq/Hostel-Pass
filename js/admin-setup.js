(function () {
  const form = document.getElementById('admin-setup-form');
  const errEl = document.getElementById('setup-error');
  const okEl = document.getElementById('setup-success');
  const statusConfigured = document.getElementById('setup-status-configured');

  if (HostelAuth.isAdminConfigured()) {
    statusConfigured.classList.remove('hidden');
  }

  const fillExampleBtn = document.getElementById('fill-example-btn');
  if (fillExampleBtn) {
    fillExampleBtn.addEventListener('click', function () {
      document.getElementById('setup-key').value = 'HOSTEL_SETUP_KEY_CHANGE_THIS_BEFORE_USE';
      document.getElementById('setup-username').value = 'admin';
      document.getElementById('setup-password').value = 'Hostel@1234';
      document.getElementById('setup-password2').value = 'Hostel@1234';
      errEl.classList.add('hidden');
      okEl.classList.add('hidden');
    });
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errEl.classList.add('hidden');
    okEl.classList.add('hidden');
    const fd = new FormData(form);
    const key = fd.get('setupKey');
    const user = fd.get('username');
    const pass = fd.get('password');
    const pass2 = fd.get('passwordConfirm');
    if (String(pass) !== String(pass2)) {
      errEl.textContent = 'Passwords do not match.';
      errEl.classList.remove('hidden');
      return;
    }
    const res = await HostelAuth.completeAdminSetup(key, user, pass);
    if (res.ok) {
      okEl.textContent = 'Admin account saved. You can sign in from admin.html.';
      okEl.classList.remove('hidden');
      statusConfigured.classList.remove('hidden');
      form.reset();
    } else {
      errEl.textContent = res.message || 'Setup fail.';
      errEl.classList.remove('hidden');
    }
  });
})();
