/**
 * Hostel Leave Management — localStorage persistence
 */
const STORAGE_KEY = 'hostelLeaveRequests_v1';

function generateRequestId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `HL-${ts}-${rand}`;
}

function getAllRequests() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRequest(request) {
  const all = getAllRequests();
  all.unshift(request);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return request;
}

function findById(id) {
  if (!id || typeof id !== 'string') return null;
  const trimmed = id.trim();
  return getAllRequests().find((r) => r.id === trimmed) || null;
}

function updateRequestStatus(id, status) {
  const all = getAllRequests();
  const i = all.findIndex((r) => r.id === id);
  if (i === -1) return null;
  all[i] = { ...all[i], status, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return all[i];
}

function deleteRequest(id) {
  const all = getAllRequests();
  const newAll = all.filter((r) => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newAll));
  return true;
}

async function deleteRequestAsync(id) {
  if (!BACKEND_URL) {
    return deleteRequest(id);
  }
  try {
    await safeFetch(`${BACKEND_URL.replace(/\/$/, '')}/api/requests/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return true;
  } catch (err) {
    return deleteRequest(id);
  }
}

const BACKEND_URL = window.HOSTEL_BACKEND_URL || '';

async function safeFetch(url, options) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const message = data && data.message ? data.message : `HTTP ${response.status}`;
      throw new Error(message);
    }
    return await response.json();
  } catch (err) {
    console.warn('Backend fetch failed', url, err.message);
    throw err;
  }
}

async function getAllRequestsAsync() {
  if (!BACKEND_URL) return getAllRequests();
  try {
    const result = await safeFetch(`${BACKEND_URL.replace(/\/$/, '')}/api/requests`, { method: 'GET' });
    return Array.isArray(result.requests) ? result.requests : [];
  } catch (err) {
    return getAllRequests();
  }
}

async function saveRequestAsync(request) {
  if (!BACKEND_URL) return saveRequest(request);
  try {
    const result = await safeFetch(`${BACKEND_URL.replace(/\/$/, '')}/api/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (result && result.request) {
      return result.request;
    }
    return saveRequest(request);
  } catch (err) {
    return saveRequest(request);
  }
}

async function updateRequestStatusAsync(id, status) {
  if (!BACKEND_URL) return updateRequestStatus(id, status);
  try {
    const result = await safeFetch(`${BACKEND_URL.replace(/\/$/, '')}/api/requests/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (result && result.request) {
      return result.request;
    }
    return updateRequestStatus(id, status);
  } catch (err) {
    return updateRequestStatus(id, status);
  }
}

window.HostelStorage = {
  STORAGE_KEY,
  generateRequestId,
  getAllRequests,
  saveRequest,
  findById,
  updateRequestStatus,
  deleteRequest,
  // async methods for backend-first operation
  getAllRequestsAsync,
  saveRequestAsync,
  updateRequestStatusAsync,
  deleteRequestAsync,
};
