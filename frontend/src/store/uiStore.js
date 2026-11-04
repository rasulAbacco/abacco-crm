import { create } from 'zustand';

let id = 0;
export const useUiStore = create((set) => ({
  sidebarOpen: false,
  collapsed: false,
  toasts: [],
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
  toast: (message, type = 'success') => {
    const t = { id: ++id, message, type };
    set((s) => ({ toasts: [...s.toasts, t] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), type === 'error' ? 7000 : 4000);
  },
  dismiss: (tid) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== tid) })),
}));

export const toast = (m, t) => useUiStore.getState().toast(m, t);
