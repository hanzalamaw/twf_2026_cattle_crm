/** Base URL for API requests; set `VITE_API_URL` in `.env` (trailing slashes are stripped). */
const raw = import.meta.env.VITE_API_URL;
export const API_BASE = typeof raw === 'string' ? raw.replace(/\/+$/, '') : '';
