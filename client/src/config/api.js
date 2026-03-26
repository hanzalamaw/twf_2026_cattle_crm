/**
 * API root from `VITE_API_URL`.
 * If a host-only URL is provided (e.g. `http://localhost:5000`), append `/api`.
 * Paths in code are appended without an extra `/api` segment (e.g. `${API_BASE}/login`).
 */
const raw = import.meta.env.VITE_API_URL;
const normalized = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';

let apiBase = normalized;
if (!apiBase) {
  apiBase = '/api';
} else if (!/\/api$/i.test(apiBase)) {
  apiBase = `${apiBase}/api`;
}

export const API_BASE = apiBase;
