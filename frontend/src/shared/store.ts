import { create } from 'zustand';
import { apiFetch, setApiOrgId } from './api';

interface UserOrg {
  id: number;
  hub_org_id: string;
  name: string;
  role: string;
}

interface User {
  user_id: number;
  name: string;
  email: string;
  role: string;
  hub_id?: string;
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
    setApiOrgId(org?.id ?? null);
    set({ currentOrg: org });
  },

  logout: async () => {
    await fetch('/amplex/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(
      () => {}
    );
    setApiOrgId(null);
    set({ user: null, currentOrg: null });
  },
}));
