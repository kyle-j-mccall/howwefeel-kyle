# Acceptance Criteria

## Bead: shared-types (hwf-s6x)

Criteria that must pass before this bead is considered complete.

### Package structure

- [ ] `shared/package.json` exists with `name: "howwefeel-kyle-shared"`, `version: "0.1.0"`, `main: "dist/index.js"`, `types: "dist/index.d.ts"`
- [ ] `shared/tsconfig.json` exists with `strict: true`, `declaration: true`, `outDir: "dist"`
- [ ] `shared/src/index.ts` re-exports all public symbols
- [ ] `shared/src/types/emotions.ts`, `models.ts`, and `api.ts` all exist

### Emotion types

- [ ] `EMOTION_FAMILIES` is a `readonly` tuple containing exactly: `yellow`, `red`, `green`, `blue`
- [ ] `EmotionFamily` type is derived from `EMOTION_FAMILIES`
- [ ] `EMOTIONS_BY_FAMILY` covers all four families; each family has exactly 15 entries
- [ ] All emotion labels are uppercase strings with no spaces (matches taxonomy doc)
- [ ] `FAMILY_COLORS` maps each family to its exact hex from `emotion-taxonomy.md`
- [ ] `CONTEXT_TAGS` contains exactly: `Work`, `Family`, `Health`, `Social`, `Money`, `Relationship`, `Other`
- [ ] `ContextTag` type is derived from `CONTEXT_TAGS`

### Model types

- [ ] `EmotionLog` interface has all required fields: `id`, `userId`, `emotionFamily`, `emotionLabel`, `intensity`, `contextTags`, `journalNote`, `photoUri`, `loggedAt`, `syncedAt`, `deviceId`, `createdAt`, `updatedAt`, `deletedAt`
- [ ] `intensity` is typed as `1 | 2 | 3 | 4 | 5`
- [ ] `contextTags` is typed as `readonly ContextTag[]`
- [ ] Nullable fields (`journalNote`, `photoUri`, `syncedAt`, `deletedAt`) are `string | null`
- [ ] `User` interface has all required fields: `id`, `email`, `provider`, `providerId`, `createdAt`, `updatedAt`, `deletedAt`
- [ ] `provider` is typed as `'apple' | 'google'`
- [ ] `SyncPayload` and `SyncResponse` interfaces exist and match the sync protocol

### API types

- [ ] `AuthAppleRequest`, `AuthGoogleRequest`, `AuthResponse` exist
- [ ] `RefreshTokenRequest` exists
- [ ] `GetLogsQuery`, `GetLogsResponse` exist
- [ ] `BulkUpsertLogsRequest`, `BulkUpsertLogsResponse` exist
- [ ] `GetUserResponse`, `ExportDataResponse` exist
- [ ] `HealthResponse` exists
- [ ] `ApiError` interface exists with `error: { code: string; message: string }`

### Build

- [ ] `npm run build` completes with zero TypeScript errors
- [ ] `npm run typecheck` completes with zero errors
- [ ] `dist/` directory is generated containing `.js` and `.d.ts` files
- [ ] `shared/src/index.ts` exports are importable by consumer packages
