import { create } from "zustand";
import { apiFetch } from "./api";

interface User {
  user_id: number;
  name: string;
  email: string;
  role: string;
  hub_id?: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,

  fetchUser: async () => {
    const token = localStorage.getItem("hub_token");
    if (!token) {
      set({ user: null, loading: false });
      return;
    }
    try {
      const data = await apiFetch<User>("/auth/me");
      set({ user: data, loading: false });
    } catch {
      localStorage.removeItem("hub_token");
      set({ user: null, loading: false });
    }
  },

  logout: async () => {
    localStorage.removeItem("hub_token");
    set({ user: null });
  },
}));
