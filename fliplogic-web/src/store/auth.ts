import { create } from 'zustand';
import { User } from 'firebase/auth';

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
  subscriptionStatus: 'trial' | 'active' | 'cancelled' | 'expired';
  trialEndsAt?: string;
}

interface AuthState {
  firebaseUser: User | null;
  authUser: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;

  setFirebaseUser: (user: User | null) => void;
  setAuthUser: (user: AuthUser | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  firebaseUser: null,
  authUser: null,
  token: null,
  isLoading: false,
  error: null,

  setFirebaseUser: (user) => set({ firebaseUser: user }),
  setAuthUser: (user) => set({ authUser: user }),
  setToken: (token) => set({ token }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  logout: () => set({
    firebaseUser: null,
    authUser: null,
    token: null,
    error: null,
  }),
}));
