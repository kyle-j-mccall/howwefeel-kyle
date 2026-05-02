import { create } from 'zustand';

interface CompletedEntry {
  activityId: string;
  completedAt: string;
}

interface ActivityState {
  favorites: string[];
  completedHistory: CompletedEntry[];
  toggleFavorite: (activityId: string) => void;
  markCompleted: (activityId: string) => void;
  isFavorite: (activityId: string) => boolean;
}

const isMockMode = process.env.EXPO_PUBLIC_MOCK_MODE === 'true';

const MOCK_FAVORITES = ['box-breathing', 'grounding-54321'];

export const useActivityStore = create<ActivityState>((set, get) => ({
  favorites: isMockMode ? MOCK_FAVORITES : [],
  completedHistory: [],

  toggleFavorite: (activityId) =>
    set((state) => ({
      favorites: state.favorites.includes(activityId)
        ? state.favorites.filter((id) => id !== activityId)
        : [...state.favorites, activityId],
    })),

  markCompleted: (activityId) =>
    set((state) => ({
      completedHistory: [
        { activityId, completedAt: new Date().toISOString() },
        ...state.completedHistory,
      ],
    })),

  isFavorite: (activityId) => get().favorites.includes(activityId),
}));
