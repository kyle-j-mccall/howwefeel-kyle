# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->


## Build & Test

```bash
# Install all workspace dependencies (run from repo root)
npm install

# Mobile
cd mobile
npx expo start                    # Start dev server
npx expo run:ios                  # Build + run on iOS simulator
npm test                          # Jest unit tests
npm run typecheck                 # tsc --noEmit

# Backend
cd backend
npm run dev                       # Start with ts-node-dev (hot reload)
npm test                          # Jest integration tests
npm run typecheck                 # tsc --noEmit
npm run migrate                   # Run pending Postgres migrations

# Shared types
cd shared
npm run build                     # Compile TypeScript to dist/
npm run typecheck
```

## Architecture Overview

Monorepo: `mobile/` (Expo RN) + `backend/` (Fastify + Node) + `shared/` (TypeScript types).

- **mobile/** — React Native app (iOS + Android). Offline-first with local SQLite (SQLCipher). Zustand for state, React Query for server sync, React Navigation v6, Reanimated 3 for the emotion wheel.
- **backend/** — Fastify REST API. Postgres for persistence, Redis for sessions/rate limiting, BullMQ for async jobs (account deletion, export).
- **shared/** — TypeScript interfaces only. No runtime code. Both mobile and backend import from here. This is the contract layer.

Full architecture: `docs/hwf/architecture.md`
API contract: `docs/hwf/api-contract.md`
Data models: `docs/hwf/data-models.md`
Design system: `docs/hwf/design-system.md`
Emotion taxonomy: `docs/hwf/emotion-taxonomy.md`
Navigation: `docs/hwf/navigation.md`
Sync protocol: `docs/hwf/sync-protocol.md`
Activities: `docs/hwf/activities-library.md`

## Conventions & Patterns

### TypeScript
- Strict mode everywhere (`"strict": true` in tsconfig). No `any`. No `// @ts-ignore`.
- No default exports for components — use named exports.
- Prefer `interface` over `type` for object shapes.
- No `enum` — use `const` objects with `as const`.
- Filename: `PascalCase.tsx` for components, `camelCase.ts` for hooks/utils/services.

### React Native / Mobile
- Functional components only. No class components.
- All hooks prefixed with `use` (e.g., `useEmotionLog`, `useSyncStatus`).
- Import design tokens only via `useTheme()` — never hardcode colors, sizes, or font sizes.
- Screens live in `mobile/src/screens/`, one file per screen.
- Reusable components live in `mobile/src/components/`.
- No inline styles — use `StyleSheet.create()` at the bottom of each file.
- All navigation params typed in `mobile/src/navigation/types.ts`.

### Backend
- All route handlers validate input with Zod before touching the DB.
- All DB queries are in typed functions in `backend/src/db/queries/` — no raw SQL in route handlers.
- All errors returned in `{ error: { code, message } }` format (see api-contract.md).
- JWT verification happens in the `auth` middleware — route handlers trust the decoded user.

### Shared Types
- `shared/` is the source of truth for any type used by both mobile and backend.
- Never duplicate a type — if it's shared, it lives in `shared/`.
- Run `cd shared && npm run build` after any type change before running mobile or backend.

### Agent Boundaries
Each bead owns a specific set of files. Read `docs/hwf/architecture.md` (Agent Boundaries section) before starting work. Do not modify files outside your domain without creating a new bead first.

### Emotion Data
Exact emotion strings, families, and colors are defined in `shared/src/types/emotions.ts` (generated from `docs/hwf/emotion-taxonomy.md`). Never hardcode emotion strings — always import from shared.
