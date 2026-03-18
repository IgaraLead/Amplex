const API = '/amplex/api';

function getToken(): string | null {
  return localStorage.getItem('hub_token');
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('hub_token');
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new Error('Sessão expirada');
  }
  if (res.status === 204) return null as T;
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `Erro ${res.status}`);
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
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // Do NOT set Content-Type for FormData — browser sets it with boundary

  const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: formData });

  if (res.status === 401) {
    localStorage.removeItem('hub_token');
    if (window.location.pathname !== '/login') window.location.href = '/login';
    throw new Error('Sessão expirada');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `Erro ${res.status}`);
  }
  return res.json();
}

export function apiDownload(path: string, filename: string) {
  const token = getToken();
  return fetch(`${API}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
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
