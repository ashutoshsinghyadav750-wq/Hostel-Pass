/**
 * Admin + student authentication (sessionStorage sessions, localStorage accounts)
 *
 * Admin: no public default password. Authorized setup uses admin-setup.html + HOSTEL_SETUP_KEY (change in this file).
 * Real deployments should use a backend — front-end secrets are visible in source.
 */
const AUTH_SESSION_KEY = 'hostelAdminSession_v1';
const STUDENT_SESSION_KEY = 'hostelStudentSession_v1';
const ADMIN_CONFIG_KEY = 'hostelAdminConfig_v1';

/**
 * ⚠️ Replace with a long random secret before deployment.
 * Only someone with this key can create or replace the admin account.
 */
const HOSTEL_SETUP_KEY = 'HOSTEL_SETUP_KEY_CHANGE_THIS_BEFORE_USE';

async function hashPassword(plain) {
  if (!globalThis.crypto || !crypto.subtle) {
    throw new Error('Secure context required for passwords (use https or localhost).');
  }
  const enc = new TextEncoder().encode(String(plain));
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getAdminConfig() {
  try {
    const raw = localStorage.getItem(ADMIN_CONFIG_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o.username !== 'string') return null;
    const username = o.username.trim();
    if (typeof o.passwordHash === 'string' && o.passwordHash.length > 0) {
      return { username, passwordHash: o.passwordHash };
    }
    /* Legacy: plain password (migrate on next successful login) */
    if (typeof o.password === 'string') {
      return { username, password: o.password, legacy: true };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function isAdminConfigured() {
  return getAdminConfig() !== null;
}

function isAdminLoggedIn() {
  return sessionStorage.getItem(AUTH_SESSION_KEY) === '1';
}

async function adminLogin(username, password) {
  const u = (username || '').trim();
  const p = password || '';
  const cfg = getAdminConfig();

  if (!cfg) {
    return {
      ok: false,
      message: 'No admin account yet. Authorized personnel must complete setup on the admin-setup page.',
    };
  }

  if (cfg.passwordHash) {
    let h;
    try {
      h = await hashPassword(p);
    } catch (e) {
      return { ok: false, message: e.message || 'Login failed.' };
    }
    if (u === cfg.username && h === cfg.passwordHash) {
      sessionStorage.setItem(AUTH_SESSION_KEY, '1');
      return { ok: true };
    }
  }

  if (cfg.legacy && typeof cfg.password === 'string') {
    if (u === cfg.username && p === cfg.password) {
      sessionStorage.setItem(AUTH_SESSION_KEY, '1');
      try {
        const ph = await hashPassword(p);
        localStorage.setItem(ADMIN_CONFIG_KEY, JSON.stringify({ username: cfg.username, passwordHash: ph }));
      } catch {
        /* keep legacy */
      }
      return { ok: true };
    }
  }

  return { ok: false, message: 'Invalid username or password.' };
}

/**
 * Setup key verify + save admin (hashed). Overwrites existing admin if key is correct.
 */
async function completeAdminSetup(setupKey, username, password) {
  if (String(setupKey || '').trim() !== HOSTEL_SETUP_KEY) {
    return { ok: false, message: 'Invalid setup key. Only authorized personnel should have this value.' };
  }
  const un = String(username || '').trim();
  if (!un) return { ok: false, message: 'Username is required.' };
  if (!password || String(password).length < 8) {
    return { ok: false, message: 'Admin password must be at least 8 characters.' };
  }
  let ph;
  try {
    ph = await hashPassword(password);
  } catch (e) {
    return { ok: false, message: e.message || 'Setup failed.' };
  }
  localStorage.setItem(ADMIN_CONFIG_KEY, JSON.stringify({ username: un, passwordHash: ph }));
  return { ok: true };
}

function clearAdminCredentialsOverride() {
  localStorage.removeItem(ADMIN_CONFIG_KEY);
}

function adminLogout() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}

function isStudentLoggedIn() {
  return !!sessionStorage.getItem(STUDENT_SESSION_KEY);
}

function getStudentSession() {
  try {
    const raw = sessionStorage.getItem(STUDENT_SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (o && typeof o.rollNumber === 'string') return o;
  } catch {
    /* ignore */
  }
  return null;
}

async function studentLogin(rollNumber, password) {
  let h;
  try {
    h = await hashPassword(password);
  } catch (e) {
    return { ok: false, message: e.message || 'Login unavailable on this connection.' };
  }
  const u = HostelUsers.findStudentByRoll(rollNumber);
  if (!u) return { ok: false, message: 'Invalid roll number or password.' };
  if (h !== u.passwordHash)
    return { ok: false, message: 'Invalid roll number or password.' };
  sessionStorage.setItem(
    STUDENT_SESSION_KEY,
    JSON.stringify({ rollNumber: u.rollNumber, name: u.name || '' })
  );
  return { ok: true };
}

async function studentRegister({ name, rollNumber, password }) {
  const roll = HostelUsers.normalizeRoll(rollNumber);
  const n = (name || '').trim();
  if (!roll) return { ok: false, message: 'Enter your roll number.' };
  if (!password || password.length < 6)
    return { ok: false, message: 'Password must be at least 6 characters.' };
  if (HostelUsers.findStudentByRoll(roll))
    return { ok: false, message: 'This roll number is already registered. Log in instead.' };

  let passwordHash;
  try {
    passwordHash = await hashPassword(password);
  } catch (e) {
    return { ok: false, message: e.message || 'Registration unavailable on this connection.' };
  }
  HostelUsers.addUserRecord({
    rollNumber: roll,
    passwordHash,
    name: n,
    createdAt: new Date().toISOString(),
  });
  sessionStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify({ rollNumber: roll, name: n }));
  return { ok: true };
}

function studentLogout() {
  sessionStorage.removeItem(STUDENT_SESSION_KEY);
}

window.HostelAuth = {
  hashPassword,
  AUTH_SESSION_KEY,
  STUDENT_SESSION_KEY,
  isAdminConfigured,
  isAdminLoggedIn,
  adminLogin,
  adminLogout,
  completeAdminSetup,
  clearAdminCredentialsOverride,
  isStudentLoggedIn,
  getStudentSession,
  studentLogin,
  studentRegister,
  studentLogout,
};
