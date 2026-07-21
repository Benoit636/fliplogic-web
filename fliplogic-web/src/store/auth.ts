import { create } from 'zustand';
import { setAuthToken, clearAuthToken } from '@/lib/api';

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  dealershipName?: string;
  subscriptionStatus: 'trial' | 'active' | 'cancelled' | 'expired';
  trialEndsAt?: string;
}

interface AuthState {
  authUser: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  hasHydrated: boolean;
  setAuthUser: (user: AuthUser | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  authUser: null,
  token: null,
  isLoading: false,
  error: null,
  hasHydrated: false,

  setAuthUser: (user) => set({ authUser: user }),
  setToken: (token) => set({ token }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  login: (token, user) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('fliplogic_token', token);
      localStorage.setItem('fliplogic_user', JSON.stringify(user));
    }
    setAuthToken(token);
    set({ token, authUser: user, error: null });
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('fliplogic_token');
      localStorage.removeItem('fliplogic_user');
    }
    clearAuthToken();
    set({ authUser: null, token: null, error: null });
  },

  hydrate: () => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('fliplogic_token');
    const userJson = localStorage.getItem('fliplogic_user');
    if (token && userJson) {
      try {
        const user = JSON.parse(userJson) as AuthUser;
        setAuthToken(token);
        set({ token, authUser: user, hasHydrated: true });
      } catch {
        localStorage.removeItem('fliplogic_token');
        localStorage.removeItem('fliplogic_user');
        set({ hasHydrated: true });
      }
    } else {
      set({ hasHydrated: true });
    }
  },
}));
