import type { EmotionFamily, ContextTag } from './emotions';

export interface User {
  id: string;
  email: string;
  provider: 'apple' | 'google';
  providerId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface EmotionLog {
  id: string;
  userId: string;
  emotionFamily: EmotionFamily;
  emotionLabel: string;
  intensity: 1 | 2 | 3 | 4 | 5;
  contextTags: readonly ContextTag[];
  journalNote: string | null;
  photoUri: string | null;
  loggedAt: string;
  syncedAt: string | null;
  deviceId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SyncPayload {
  logs: EmotionLog[];
  deviceId: string;
  lastSyncedAt: string | null;
}

export interface SyncResponse {
  logs: EmotionLog[];
  syncedAt: string;
  nextCursor: string | null;
}
