/**
 * Admin + student authentication (sessionStorage sessions, localStorage accounts)
 *
 * Admin: no public default password. Authorized setup uses admin-setup.html + HOSTEL_SETUP_KEY (change in this file).
 * Real deployments should use a backend — front-end secrets are visible in source.
 */
const AUTH_SESSION_KEY = 'hostelAdminSession_v1';
const STUDENT_SESSION_KEY = 'hostelStudentSession_v1';
const ADMIN_CONFIG_KEY = 'hostelAdminConfig_v1';
const ADMIN_API_KEY_SESSION_KEY = 'hostelAdminApiKey_v1';
function resolveBackendUrl() {
  if (window.HOSTEL_BACKEND_URL) return window.HOSTEL_BACKEND_URL;
  const protocol = window.location.protocol;
  const host = window.location.hostname;
  if (protocol === 'file:') return 'http://localhost:4000';
  if (window.location.port && window.location.port !== '4000') {
    return `${window.location.protocol}//${host}:4000`;
  }
  if (host === 'localhost' || host === '127.0.0.1') {
    return `${window.location.protocol}//${host}:4000`;
  }
  return window.location.origin;
}
const AUTH_BACKEND_URL = resolveBackendUrl();

/**
 * ⚠️ Replace with a long random secret before deployment.
 * Only someone with this key can create or replace the admin account.
 */
const HOSTEL_SETUP_KEY = 'HOSTEL_SETUP_KEY_CHANGE_THIS_BEFORE_USE';

async function hashPassword(plain) {
  const value = String(plain || '');
  if (globalThis.crypto && crypto.subtle) {
    const enc = new TextEncoder().encode(value);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Non-secure context fallback (keeps setup/login working on plain HTTP or LAN test hosts).
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv1a_${(h >>> 0).toString(16)}`;
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
  return sessionStorage.getItem(AUTH_SESSION_KEY) === '1' || !!sessionStorage.getItem(ADMIN_API_KEY_SESSION_KEY);
}

function getAdminApiKey() {
  return sessionStorage.getItem(ADMIN_API_KEY_SESSION_KEY) || '';
}

async function adminLogin(username, password) {
  const u = (username || '').trim();
  const p = password || '';
  let backendError = null;
  const cfg = getAdminConfig();

  // Local setup credentials get priority when configured from admin-setup page.
  if (cfg && cfg.passwordHash) {
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

  if (cfg && cfg.legacy && typeof cfg.password === 'string') {
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

  if (AUTH_BACKEND_URL) {
    try {
      const response = await fetch(`${AUTH_BACKEND_URL.replace(/\/$/, '')}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        backendError = (data && data.message) || 'Invalid username or password.';
      } else if (data && data.ok && data.apiKey) {
        sessionStorage.setItem(AUTH_SESSION_KEY, '1');
        sessionStorage.setItem(ADMIN_API_KEY_SESSION_KEY, data.apiKey);
        return { ok: true };
      } else {
        backendError = 'Backend login did not return an API key.';
      }
    } catch (e) {
      backendError = e.message || 'Backend login failed.';
    }
  }

  if (!cfg) {
    return {
      ok: false,
      message:
        (backendError ? `${backendError} (backend: ${AUTH_BACKEND_URL || 'not-set'})` : '') ||
        'No admin account yet. Authorized personnel must complete setup on the admin-setup page.',
    };
  }

  return {
    ok: false,
    message: backendError
      ? `${backendError} (backend: ${AUTH_BACKEND_URL || 'not-set'})`
      : 'Invalid username or password.',
  };
}

/**
 * Setup key verify + save admin (hashed). Overwrites existing admin if key is correct.
 */
async function completeAdminSetup(setupKey, username, password) {
  const providedKey = String(setupKey || '').trim();
  if (providedKey && providedKey !== HOSTEL_SETUP_KEY) {
    return { ok: false, message: 'Invalid setup key.' };
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
  sessionStorage.removeItem(ADMIN_API_KEY_SESSION_KEY);
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
  getAdminApiKey,
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
