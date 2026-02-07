import { create } from "zustand";

interface OutcomeData {
  name: string;
  probability: number;
  confidence_interval: number[];
  engine_breakdown?: Record<string, number>;
}

interface ResultStore {
  outcomes: OutcomeData[];
  causalGraph: { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> };
  variables: Array<{ name: string; current: number; range: number[]; impact: number }>;
  reasoning: { got_tree: unknown[]; shap_factors: unknown[]; explanation_text: string };
  engines: {
    got?: Record<string, unknown> | null;
    mcts?: Record<string, unknown> | null;
    debate?: Record<string, unknown> | null;
    ensemble?: Record<string, unknown> | null;
  };
  isRerunning: boolean;
  setResult: (data: Partial<ResultStore>) => void;
  setRerunning: (r: boolean) => void;
}

export const useResultStore = create<ResultStore>((set) => ({
  outcomes: [],
  causalGraph: { nodes: [], edges: [] },
  variables: [],
  reasoning: { got_tree: [], shap_factors: [], explanation_text: "" },
  engines: {},
  isRerunning: false,
  setResult: (data) => set(data),
  setRerunning: (isRerunning) => set({ isRerunning }),
}));
