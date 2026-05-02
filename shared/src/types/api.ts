import type { EmotionLog, User } from './models';

export interface AuthAppleRequest {
  identityToken: string;
  deviceId: string;
}

export interface AuthGoogleRequest {
  idToken: string;
  deviceId: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface GetLogsQuery {
  since?: string;
  limit?: number;
}

export interface GetLogsResponse {
  logs: EmotionLog[];
  nextCursor: string | null;
  total: number;
}

export interface BulkUpsertLogsRequest {
  logs: EmotionLog[];
}

export interface BulkUpsertLogsResponse {
  synced: number;
  conflicts: EmotionLog[];
  syncedAt: string;
}

export interface GetUserResponse {
  user: User;
  lastSyncedAt: string | null;
  logCount: number;
}

export interface ExportDataResponse {
  user: User;
  logs: EmotionLog[];
  exportedAt: string;
}

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
