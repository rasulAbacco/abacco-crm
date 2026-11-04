import { create } from 'zustand';

// The access token lives only in memory; the refresh token is an httpOnly cookie.
export const useAuthStore = create((set) => ({
  accessToken: null,
  user: null,
  status: 'loading', // loading | authenticated | anonymous
  setSession: ({ accessToken, user }) => set({ accessToken, user: user ?? null, status: 'authenticated' }),
  setUser: (user) => set({ user }),
  clear: () => set({ accessToken: null, user: null, status: 'anonymous' }),
}));
