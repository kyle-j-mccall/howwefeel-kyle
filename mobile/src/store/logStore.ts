import { create } from 'zustand';
import type { EmotionLog } from 'howwefeel-kyle-shared';
import { MOCK_LOGS } from '../mocks/fixtures';

// Suggest activities after intense red/blue logs (high-energy unpleasant or low-energy unpleasant)
function shouldSuggestActivity(log: EmotionLog): boolean {
  return log.intensity >= 4 && (log.emotionFamily === 'red' || log.emotionFamily === 'blue');
}

interface LogState {
  logs: EmotionLog[];
  pendingActivitySuggestion: boolean;
  addLog: (log: EmotionLog) => void;
  removeLog: (id: string) => void;
  clearActivitySuggestion: () => void;
}

const isMockMode = process.env.EXPO_PUBLIC_MOCK_MODE === 'true';

export const useLogStore = create<LogState>((set) => ({
  logs: isMockMode ? [...MOCK_LOGS] : [],
  pendingActivitySuggestion: false,
  addLog: (log) =>
    set((state) => ({
      logs: [log, ...state.logs],
      pendingActivitySuggestion: shouldSuggestActivity(log),
    })),
  removeLog: (id) =>
    set((state) => ({ logs: state.logs.filter((l) => l.id !== id) })),
  clearActivitySuggestion: () => set({ pendingActivitySuggestion: false }),
}));
