const API = '/amplex/api';

// ── Org context for API path resolution ──
let _slug: string | null = null;

export function setApiOrgSlug(slug: string | null) {
  _slug = slug;
}

export function getApiOrgSlug(): string | null {
  return _slug;
}

/** Resolve path with org prefix: /crm/... → /id/{slug}/crm/... */
function resolveOrgPath(path: string): string {
  if (!_slug) return path;
  if (path.startsWith('/crm/') || path === '/crm') {
    return `/id/${_slug}${path}`;
  }
  if (path.startsWith('/permissions/') || path === '/permissions') {
    return `/id/${_slug}/crm${path}`;
  }
  return path;
}

/** Build full CRM API URL (for window.open, direct fetch, etc.) */
export function crmUrl(path: string): string {
  return `${API}${resolveOrgPath(path)}`;
}

function getCsrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)amplex_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }
  if (options.method && options.method !== 'GET') {
    const csrf = getCsrfToken();
    if (!csrf) {
      throw new Error('CSRF token ausente. Sessão pode ter expirado.');
    }
    headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(`${API}${resolveOrgPath(path)}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401) {
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new Error('Sessão expirada');
  }
  if (res.status === 204) return null as T;
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || data?.error || `Erro ${res.status}`);
  }
  return res.json();
}

export function apiGet<T = unknown>(path: string) {
  return apiFetch<T>(path);
}

export function apiPost<T = unknown>(path: string, body: unknown) {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function apiPut<T = unknown>(path: string, body: unknown) {
  return apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) });
}

export function apiDelete(path: string) {
  return apiFetch(path, { method: 'DELETE' });
}

export async function apiUpload<T = unknown>(path: string, formData: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const csrf = getCsrfToken();
  if (csrf) headers['X-CSRF-Token'] = csrf;

  const res = await fetch(`${API}${resolveOrgPath(path)}`, {
    method: 'POST',
    headers,
    body: formData,
    credentials: 'include',
  });

  if (res.status === 401) {
    if (window.location.pathname !== '/login') window.location.href = '/login';
    throw new Error('Sessão expirada');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || data?.error || `Erro ${res.status}`);
  }
  return res.json();
}

export function apiDownload(path: string, filename: string) {
  return fetch(`${API}${resolveOrgPath(path)}`, { credentials: 'include' })
    .then(r => r.blob())
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });
}
