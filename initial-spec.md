# PRD: How We Feel — React Native + Node Implementation

## Problem Statement

Build a full-stack mobile application (React Native + Node.js backend) that replicates
and extends the "How We Feel" emotional wellness app. The app helps users develop
emotional granularity by logging feelings using an interactive emotion wheel, journaling,
and reviewing trends over time. The goal is a production-grade, privacy-respecting
system with offline-first mobile behavior and a secure cloud sync backend.

---

## Goals

- Allow users to quickly log their emotional state using a multi-tier emotion wheel UI
- Surface personalized insights from emotional patterns over days, weeks, and months
- Support journaling attached to emotion logs for richer context
- Deliver configurable check-in reminders via push notifications
- Sync data securely across devices with full offline support
- Provide optional evidence-based coping activities and reflections
- Maintain user trust through transparent data handling and local-first architecture

---

## Non-Goals

- Real-time social or sharing features (no feed, no public profiles)
- Therapist/clinical integrations (v1)
- Wearable or HealthKit integrations (v1)
- Web app (mobile only for v1)
- Gamification beyond streaks

---

## User Stories

1. **First-time user** opens the app, completes onboarding, and logs their first emotion in under 60 seconds.
2. **Daily user** receives a push notification reminder, taps it, logs a feeling, optionally adds a journal note, and closes the app in under 90 seconds.
3. **Reflective user** opens the Insights tab to review their emotional pattern over the past 30 days and identifies recurring stressors.
4. **Privacy-conscious user** disables cloud sync and uses the app in fully local mode with no data leaving the device.
5. **Multi-device user** logs in on a new phone and all historical logs sync automatically.
6. **User in distress** sees a contextual suggestion for a breathing exercise or grounding activity after logging a high-intensity negative emotion.

---

## Constraints

- React Native (Expo managed workflow) for iOS and Android
- Node.js + Express (or Fastify) REST API backend
- PostgreSQL for server-side persistence
- Must support fully offline operation; sync resolves conflicts on reconnect
- Push notifications via Expo Push / FCM / APNS
- Auth via Apple Sign-In and Google OAuth (required for App Store)
- All emotion logs encrypted at rest on device (SQLite + SQLCipher) and in transit (TLS)
- GDPR-compliant: full data export and account deletion
- No third-party analytics SDKs that exfiltrate user content

---

## Feature Specification

### 1. Onboarding

- Splash + brief animated intro (3 screens max)
- Auth: Apple Sign-In, Google OAuth, or "continue without account" (local-only mode)
- Notification permission request with clear value framing
- First emotion log prompt immediately after onboarding

### 2. Emotion Logging (Core Loop)

**Emotion Wheel UI**
- Three-tier wheel: core family → nuanced emotion → intensity
- Tier 1: Joy, Sadness, Fear, Anger, Disgust, Surprise, Trust, Anticipation (Plutchik-derived)
- Tier 2: ~48 emotions mapped to families
- Tier 3: Intensity slider (1–5) rendered after emotion selection
- Haptic feedback on selection
- Wheel renders fully offline, no network dependency

**Context tagging** (optional, post-selection)
- Predefined context chips: Work, Family, Health, Social, Money, Relationship, Other
- Free-text journal note (max 1000 chars)
- Photo attachment (stored locally, not synced by default)

**Log entry schema**
```
id, user_id, emotion_family, emotion_label, intensity (1-5),
context_tags[], journal_note, photo_uri, logged_at, synced_at, device_id
```

### 3. Home / Dashboard

- "How are you feeling?" CTA always visible
- Today's log timeline (chronological cards)
- Current streak count
- Weekly mood summary sparkline
- Quick-access to recent journal entries

### 4. Insights

- **Calendar heatmap**: color-coded by dominant emotion family per day
- **Emotion frequency chart**: bar chart by time range (7d / 30d / 90d / all)
- **Intensity trends**: line chart over time per emotion family
- **Time-of-day patterns**: when does the user tend to log specific emotions
- **Top contexts**: which life areas correlate with which emotions
- All charts render from local SQLite; no backend call required

### 5. Journal

- List view of all logs that have a journal note
- Full-text search (local)
- Filter by emotion family, context tag, date range
- Edit and delete entries

### 6. Activities (Coping Suggestions)

- Triggered contextually after logging high-intensity Fear, Anger, or Sadness (intensity ≥ 4)
- Library of ~20 evidence-based micro-activities: box breathing, body scan, grounding 5-4-3-2-1, etc.
- User can favorite activities; favorites surface first
- Activities are bundled assets (no network required)

### 7. Reminders / Notifications

- Configurable check-in schedule: frequency (1–4x/day), time windows, days of week
- Notification deep-links directly into logging flow
- Quiet hours respected
- Scheduled locally via Expo Notifications (no server required for reminders)

### 8. Settings

- Account: profile, sign out, delete account
- Data: export all data as JSON, toggle cloud sync on/off
- Notifications: manage schedule
- Display: dark/light/system theme
- Privacy: view privacy policy, manage biometric lock

### 9. Sync & Conflict Resolution

- Optimistic local writes; background sync when online
- Conflict resolution: last-write-wins by `logged_at` timestamp
- Sync state visible in Settings ("Last synced: X minutes ago")
- Full re-sync on new device login

---

## Backend API (Node.js)

### Auth
- `POST /auth/apple` — validate Apple identity token, return JWT
- `POST /auth/google` — validate Google token, return JWT
- `POST /auth/refresh` — refresh JWT
- `DELETE /auth/session` — logout

### Emotion Logs
- `GET /logs` — paginated log fetch (supports `since` cursor for incremental sync)
- `POST /logs` — bulk upsert (client sends all un-synced logs)
- `DELETE /logs/:id` — soft delete

### User
- `GET /users/me` — profile + sync metadata
- `DELETE /users/me` — account deletion (cascades all data, queued async)
- `GET /users/me/export` — full data export as JSON

### Infrastructure
- Postgres with row-level encryption for journal notes
- Redis for session store and rate limiting
- Bull queue for async jobs (account deletion, export generation)
- Deployed on Railway or Fly.io (single region v1)
- Health check endpoint for uptime monitoring

---

## Data Model (Server)

```sql
users         (id, email, provider, provider_id, created_at, deleted_at)
emotion_logs  (id, user_id, emotion_family, emotion_label, intensity,
               context_tags, journal_note_encrypted, logged_at, synced_at,
               device_id, deleted_at)
devices       (id, user_id, device_name, last_seen_at)
```

---

## Technical Architecture

```
┌─────────────────────────────┐
│  React Native (Expo)        │
│  ├─ Zustand (state)         │
│  ├─ React Query (server sync)│
│  ├─ SQLite + SQLCipher (local)│
│  ├─ React Navigation        │
│  └─ Reanimated 3 (wheel UI) │
└──────────┬──────────────────┘
           │ HTTPS (JWT)
┌──────────▼──────────────────┐
│  Node.js API (Express/Fastify)│
│  ├─ Postgres (primary store) │
│  ├─ Redis (sessions/rate limit)│
│  └─ Bull (job queue)        │
└─────────────────────────────┘
```

---

## Open Questions

1. Should intensity be a slider (continuous) or discrete steps (1–5)?
2. Do we support unauthenticated local-only mode indefinitely, or require account after N days?
3. Should photo attachments ever sync (with user consent)?
4. What is the target App Store launch timeline?
5. Do we need a web admin panel for ops/support in v1?

---

## Rough Implementation Phases

### Phase 0 — Foundation
- Expo project scaffold, navigation shell, design system (theme, typography, colors)
- Local SQLite setup with encryption
- Node.js project scaffold, Postgres schema, auth endpoints

### Phase 1 — Core Loop
- Emotion wheel UI (all three tiers + intensity)
- Log entry creation and local persistence
- Home dashboard (today's logs, streak)

### Phase 2 — Sync
- JWT auth (Apple + Google)
- Sync engine: bulk upsert + incremental pull
- Conflict resolution

### Phase 3 — Insights
- Calendar heatmap
- Frequency and intensity charts
- Time-of-day pattern analysis

### Phase 4 — Journal & Activities
- Journal list, search, filter
- Contextual activity suggestions
- Activity library UI

### Phase 5 — Notifications & Polish
- Configurable reminders
- Deep-link from notification into log flow
- Onboarding flow
- Dark mode, accessibility audit

### Phase 6 — Production Hardening
- GDPR export + deletion
- Rate limiting, abuse protection
- Performance profiling (wheel render, sync speed)
- App Store submission prep
