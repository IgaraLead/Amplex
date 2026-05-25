import { create } from 'zustand';
import { apiFetch, setApiOrgSlug } from './api';

const LAST_ORG_SLUG_KEY = 'amplex:last-org-slug';

interface UserOrg {
  id: number;
  slug: string;
  name: string;
  role: string;
}

interface User {
  user_id: number;
  name: string;
  email: string;
  role: string;
  is_super_admin?: boolean;
  force_password_change?: boolean;
  organizations?: UserOrg[];
}

interface AuthState {
  user: User | null;
  loading: boolean;
  currentOrg: UserOrg | null;
  fetchUser: () => Promise<void>;
  setCurrentOrg: (org: UserOrg | null) => void;
  logout: () => Promise<void>;
}

export function getLastOrgSlug() {
  return window.localStorage.getItem(LAST_ORG_SLUG_KEY);
}

export const useAuth = create<AuthState>(set => ({
  user: null,
  loading: true,
  currentOrg: null,

  fetchUser: async () => {
    try {
      const data = await apiFetch<User>('/auth/me');
      set({ user: data, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  setCurrentOrg: org => {
    setApiOrgSlug(org?.slug ?? null);
    if (org) window.localStorage.setItem(LAST_ORG_SLUG_KEY, org.slug);
    set({ currentOrg: org });
  },

  logout: async () => {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
    setApiOrgSlug(null);
    set({ user: null, currentOrg: null });
  },
}));
