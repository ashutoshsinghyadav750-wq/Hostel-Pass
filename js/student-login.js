(function () {
  const params = new URLSearchParams(window.location.search);
  const nextUrl = params.get('next') || 'index.html';

  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const panelLogin = document.getElementById('panel-login');
  const panelRegister = document.getElementById('panel-register');

  const formLogin = document.getElementById('form-student-login');
  const formRegister = document.getElementById('form-student-register');
  const errLogin = document.getElementById('student-login-error');
  const errRegister = document.getElementById('student-register-error');

  if (HostelAuth.isStudentLoggedIn()) {
    window.location.replace(nextUrl);
    return;
  }

  function showErr(el, err) {
    if (!el) return;
    if (err) {
      el.textContent = err;
      el.classList.remove('hidden');
    } else {
      el.textContent = '';
      el.classList.add('hidden');
    }
  }

  function activateTab(which) {
    const isLogin = which === 'login';
    panelLogin.classList.toggle('hidden', !isLogin);
    panelRegister.classList.toggle('hidden', isLogin);
    tabLogin.classList.toggle('is-active', isLogin);
    tabRegister.classList.toggle('is-active', !isLogin);
    tabLogin.setAttribute('aria-selected', isLogin);
    tabRegister.setAttribute('aria-selected', !isLogin);
    showErr(errLogin, null);
    showErr(errRegister, null);
  }

  tabLogin.addEventListener('click', function () {
    activateTab('login');
  });
  tabRegister.addEventListener('click', function () {
    activateTab('register');
  });

  formLogin.addEventListener('submit', async function (e) {
    e.preventDefault();
    showErr(errLogin, null);
    const fd = new FormData(formLogin);
    const roll = fd.get('rollNumber');
    const pass = fd.get('password');
    const res = await HostelAuth.studentLogin(roll, pass);
    if (res.ok) window.location.replace(nextUrl);
    else showErr(errLogin, res.message || 'Login failed.');
  });

  formRegister.addEventListener('submit', async function (e) {
    e.preventDefault();
    showErr(errRegister, null);
    const fd = new FormData(formRegister);
    const name = fd.get('name');
    const roll = fd.get('rollNumber');
    const pass = fd.get('password');
    const pass2 = fd.get('passwordConfirm');
    if (String(pass) !== String(pass2)) {
      showErr(errRegister, 'Passwords do not match.');
      return;
    }
    const res = await HostelAuth.studentRegister({
      name,
      rollNumber: roll,
      password: pass,
    });
    if (res.ok) window.location.replace(nextUrl);
    else showErr(errRegister, res.message || 'Registration failed.');
  });
})();
