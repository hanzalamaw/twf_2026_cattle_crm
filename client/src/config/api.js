/**
 * API root from `VITE_API_URL` (e.g. `http://localhost:5000/api`).
 * Paths in code are appended without an extra `/api` segment (e.g. `${API_BASE}/login`).
 */
const raw = import.meta.env.VITE_API_URL;
export const API_BASE = typeof raw === 'string' ? raw.replace(/\/+$/, '') : '';
