import { create } from 'zustand';

const KEY = 'abacco.salesId';
const read = () => {
  try {
    return localStorage.getItem(KEY) ?? 'all';
  } catch {
    return 'all';
  }
};

// Selected Sales ID ("all" or an id) survives navigation and page refreshes.
export const useSalesIdStore = create((set, get) => ({
  selected: read(),
  options: [],
  version: 0, // bumps on every switch so pages refetch
  setOptions: (options) => {
    const sel = get().selected;
    if (sel !== 'all' && options.length && !options.some((o) => o.id === sel)) get().select('all');
    set({ options });
  },
  select: (id) => {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* private mode */
    }
    set((s) => ({ selected: id, version: s.version + 1 }));
  },
  current: () => get().options.find((o) => o.id === get().selected) ?? null,
}));
