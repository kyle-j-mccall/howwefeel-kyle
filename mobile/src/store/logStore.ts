import { create } from 'zustand';
import type { EmotionLog } from 'howwefeel-kyle-shared';
import { MOCK_LOGS } from '../mocks/fixtures';

interface LogState {
  logs: EmotionLog[];
  addLog: (log: EmotionLog) => void;
  removeLog: (id: string) => void;
}

const isMockMode = process.env.EXPO_PUBLIC_MOCK_MODE === 'true';

export const useLogStore = create<LogState>((set) => ({
  logs: isMockMode ? [...MOCK_LOGS] : [],
  addLog: (log) => set((state) => ({ logs: [log, ...state.logs] })),
  removeLog: (id) =>
    set((state) => ({ logs: state.logs.filter((l) => l.id !== id) })),
}));
