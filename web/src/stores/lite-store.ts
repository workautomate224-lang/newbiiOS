import { create } from "zustand";

interface LiteStore {
  query: string;
  isLoading: boolean;
  setQuery: (q: string) => void;
  setLoading: (l: boolean) => void;
}

export const useLiteStore = create<LiteStore>((set) => ({
  query: "",
  isLoading: false,
  setQuery: (query) => set({ query }),
  setLoading: (isLoading) => set({ isLoading }),
}));
