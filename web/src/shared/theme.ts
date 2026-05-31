export type ThemeMode = 'dark' | 'light' | 'system';

const THEME_KEY = 'amplex:theme';

export const themeOptions: Array<{ value: ThemeMode; label: string; description: string }> = [
  { value: 'dark', label: 'Tema escuro', description: 'Interface escura do Amplex' },
  { value: 'light', label: 'Tema claro', description: 'Interface clara do Amplex' },
  { value: 'system', label: 'Tema do sistema', description: 'Segue o tema atual do OS' },
];

export function getStoredTheme(): ThemeMode {
  const value = window.localStorage.getItem(THEME_KEY);
  return value === 'dark' || value === 'light' || value === 'system' ? value : 'dark';
}

export function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(mode: ThemeMode) {
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  window.localStorage.setItem(THEME_KEY, mode);
}
