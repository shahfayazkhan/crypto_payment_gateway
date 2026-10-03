export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const TOKEN_KEY = 'pcg_token';

export const getToken = () => (typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY));
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

export async function api(path, { method = 'GET', body, query } = {}) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '' && v !== null)) : '';
  const token = getToken();
  const res = await fetch(`${API_URL}/api${path}${qs}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/login')) {
    setToken(null);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- hard reload clears all client state
    window.location.assign('/login');
  }
  if (!res.ok) {
    const detail = data.details?.map?.((d) => `${d.path}: ${d.message}`).join(', ');
    throw new ApiError(res.status, detail || data.error || `HTTP ${res.status}`, data.details);
  }
  return data;
}
