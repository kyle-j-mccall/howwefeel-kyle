# API Contract

Base URL: `/api/v1`

All authenticated endpoints require `Authorization: Bearer <jwt>`.

All error responses use the shape:
```json
{ "error": { "code": "ERROR_CODE", "message": "Human-readable description." } }
```

All timestamps are ISO 8601 UTC strings (e.g. `"2026-05-02T18:00:00.000Z"`).

---

## Auth

### POST /auth/apple

Validate Apple identity token and return JWT pair.

**Request**
```typescript
interface AuthAppleRequest {
  identityToken: string;
  deviceId: string;
}
```

**Response 200**
```typescript
interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;     // seconds
  user: User;
}
```

---

### POST /auth/google

Validate Google ID token and return JWT pair.

**Request**
```typescript
interface AuthGoogleRequest {
  idToken: string;
  deviceId: string;
}
```

**Response 200** — same shape as `AuthResponse`

---

### POST /auth/refresh

Exchange a refresh token for a new access token.

**Request**
```typescript
interface RefreshTokenRequest {
  refreshToken: string;
}
```

**Response 200** — same shape as `AuthResponse`

---

### DELETE /auth/session

Invalidate the current session (logout).

**Response 204** — no body

---

## Emotion Logs

### GET /logs

Paginated log fetch. Supports incremental sync via `since` cursor.

**Query params**
```typescript
interface GetLogsQuery {
  since?: string;   // ISO 8601 cursor — return logs with updatedAt > since
  limit?: number;   // default 200, max 500
}
```

**Response 200**
```typescript
interface GetLogsResponse {
  logs: EmotionLog[];
  nextCursor: string | null;  // null when no more pages
  total: number;
}
```

---

### POST /logs

Bulk upsert. Client sends all unsynced logs; server deduplicates by `id`.
Conflict resolution: server `updatedAt` wins when server copy is newer.

**Request**
```typescript
interface BulkUpsertLogsRequest {
  logs: EmotionLog[];
}
```

**Response 200**
```typescript
interface BulkUpsertLogsResponse {
  synced: number;
  conflicts: EmotionLog[];   // server-authoritative versions of conflict rows
  syncedAt: string;
}
```

---

### DELETE /logs/:id

Soft-delete a log. Sets `deletedAt`; propagates to other devices on next sync.

**Response 204** — no body

---

## User

### GET /users/me

Return authenticated user's profile and sync metadata.

**Response 200**
```typescript
interface GetUserResponse {
  user: User;
  lastSyncedAt: string | null;
  logCount: number;
}
```

---

### DELETE /users/me

Queue account deletion. Local data wiped immediately; server-side deletion
completes within ≤ 30 days per GDPR.

**Response 202** — no body

---

### GET /users/me/export

Export all user data as JSON.

**Response 200**
```typescript
interface ExportDataResponse {
  user: User;
  logs: EmotionLog[];
  exportedAt: string;
}
```

---

## Health

### GET /health

Uptime / readiness check. No auth required.

**Response 200**
```typescript
interface HealthResponse {
  status: 'ok';
  timestamp: string;
}
```

---

## Sync Protocol

The client drives incremental sync using the `since` cursor:

1. Client calls `GET /logs?since=<lastSyncedAt>` to pull server-side changes.
2. Client calls `POST /logs` with all locally modified logs since last sync.
3. Server returns `syncedAt`; client stores it for the next `since` cursor.

Conflict resolution: server `updatedAt` is authoritative. If the server copy
is newer, the server version is returned in `conflicts[]` and the client
overwrites its local copy.

See `docs/hwf/sync-protocol.md` for full state-machine details.
