import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiPost, apiGet, setAccessToken } from "../lib/api.js";
import type { User } from "@hcc/shared";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,

      login: async (email, password) => {
        const res = await apiPost("/auth/login", { email, password });
        setAccessToken(res.data.accessToken);
        set({ user: res.data.user, isAuthenticated: true });
      },

      register: async (email, password, name) => {
        const res = await apiPost("/auth/register", { email, password, name });
        setAccessToken(res.data.accessToken);
        set({ user: res.data.user, isAuthenticated: true });
      },

      logout: async () => {
        try {
          await apiPost("/auth/logout", {});
        } catch { /* ignore */ }
        setAccessToken(null);
        set({ user: null, isAuthenticated: false });
      },

      checkAuth: async () => {
        try {
          const res = await apiGet("/auth/me");
          set({ user: res.data, isAuthenticated: true, isLoading: false });
        } catch {
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },
    }),
    {
      name: "hcc-auth",
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
