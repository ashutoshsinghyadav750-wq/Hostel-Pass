/**
 * Registered student accounts (localStorage)
 */
const USERS_KEY = 'hostelStudents_v1';

function normalizeRoll(r) {
  return String(r || '').trim().toUpperCase().replace(/\s+/g, '');
}

function getUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

function findStudentByRoll(roll) {
  const key = normalizeRoll(roll);
  if (!key) return null;
  return getUsers().find((u) => u.rollNumber === key) || null;
}

function addUserRecord(record) {
  const users = getUsers();
  users.push(record);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

window.HostelUsers = {
  USERS_KEY,
  normalizeRoll,
  getUsers,
  findStudentByRoll,
  addUserRecord,
};
