# PRD: How We Feel — Production-grade React Native + Node.js implementation

> **Status: Draft.** Breadth over polish. Known weak spots are surfaced explicitly in Open Questions rather than papered over. Downstream review legs are expected to push back.

## Problem Statement

Build a production-grade mobile + backend implementation of *How We Feel* — an emotional wellness app rooted in Marc Brackett's Yale RULER framework and the **Mood Meter** (a 2D plane: pleasantness/valence × energy, divided into four colored quadrants with finer-grained labels inside each). Users build emotional granularity through fast daily check-ins, journaling, and pattern insights over time. The system must work offline-first on iOS and Android, sync securely across devices, and protect what is unusually sensitive data — self-reported emotional states with free-text journal context.

Two non-obvious motivations:

1. **RULER-style emotional literacy works only with consistency.** The app must make daily check-ins so frictionless that users actually do them. Friction is the enemy of the therapeutic effect.
2. **Emotional data is mental-health-adjacent.** Treating it like ordinary product telemetry — third-party analytics SDKs, careless logging, default cloud backups — is a trust violation and almost certainly a legal one under GDPR Art. 9 and equivalent regimes. Privacy posture is a feature, not a checkbox.

A starting-point sketch lives at `initial-spec.md`. It is *not* ground truth. It mis-identifies the emotion model (says Plutchik wheel; the real How We Feel uses Mood Meter), under-specifies the emotion taxonomy, omits crisis safeguards, gets sync conflict resolution wrong, leaves streak logic and accessibility undefined, and has no testing/CI/CD/observability story. This PRD reframes the work using the correct emotion model and exposes the gaps as explicit Open Questions.

---

## Goals

- **Granularity.** Help users move from "good/bad" to a precise emotion label they recognize as accurate. The Mood Meter (4 quadrants × intensity bands × labeled cells) is the chosen model.
- **Speed of capture.** First-ever check-in completable in <60s; repeat check-in in <30s; reminder → log → close in <90s.
- **Offline-first.** All core flows (log, view today, browse insights, journal search) work with no network. Sync is opportunistic, not required.
- **Pattern insight.** Calendar heatmap, frequency/intensity trends, time-of-day patterns, context correlations — all rendered locally from on-device data.
- **Cross-device continuity.** Optional, opt-in cloud sync. Users who decline sync stay fully functional.
- **Trust.** Encrypted local store; no third-party analytics SDKs touching user-generated content; full GDPR-grade export and account deletion; transparent privacy posture surfaced in-app, not buried in a policy.
- **Crisis-aware.** When a user logs a high-intensity low-pleasantness emotion (or self-harm-suggestive language in a journal note), surface contextual support — at minimum a coping activity plus a discreet, locale-appropriate crisis hotline link.
- **Accessible.** Meet WCAG 2.1 AA where applicable to mobile: screen reader support, dynamic type, sufficient contrast. Mood Meter color-only encoding must have non-color alternatives.
- **Localization-ready.** Architecture supports i18n and timezone-correct date handling from day one, even if v1 ships English-only.
- **Operationally honest.** Tests, CI/CD, observability, and feature flags are in scope from Phase 0, not retrofitted later.

---

## Non-Goals

- **Social, sharing, or feed features.** No public profiles, no social graph, no comments. v1 is single-user.
- **Therapist / clinical integrations.** Not a medical device, not a therapy substitute. v1 will not target HIPAA workloads.
- **Wearable / HealthKit / Google Fit integrations.** Out of v1.
- **Web app.** Mobile only (iOS + Android via Expo) for v1.
- **Heavy gamification.** Streaks are the only loop. No badges, points, leaderboards, or social comparisons.
- **Real-time / inbound communication.** No chat, no server-pushed notifications beyond locally-scheduled reminders.
- **AI-generated journaling or coaching from user data in v1.** Tempting but imports model-provider data egress, which conflicts with the privacy posture. Reconsider post-launch with on-device or strictly redacted approaches.
- **Password-based accounts.** Apple and Google sign-in only; account-less local mode also supported. Avoids credential storage liability and reduces attack surface.

---

## User Stories / Scenarios

1. **First-time user.** Opens the app, sees a 3-screen intro that explains the Mood Meter (pleasantness × energy, four colored quadrants). Picks a sign-in option (Apple, Google, or "use locally without account"). Grants notifications with clear value framing. Logs a first emotion in <60s.

2. **Daily check-in user.** Receives a scheduled local notification, taps it, lands directly in the Mood Meter. Selects a quadrant, then a specific emotion label, then intensity, optionally adds context tags and a short note. Closes the app. Total time <90s.

3. **Reflective user.** Opens Insights, sees a 30-day calendar heatmap colored by dominant quadrant, a frequency chart of top emotions, and a "your stress correlates with: Work, Money" panel. Drills into a day to see the underlying logs and notes.

4. **Privacy-conscious user.** Disables cloud sync (or never enabled it). Sees an explicit "this device only" indicator. No data leaves the device. Notifications still work.

5. **Multi-device user.** Signs in on a new phone. Past logs replicate. Verifies sync state in Settings ("Last synced 2m ago, 1,238 entries").

6. **User in distress.** Logs an emotion in the high-energy/low-pleasantness quadrant at high intensity. App surfaces a context-aware coping activity (e.g., box breathing) and a discreet, dismissible localized crisis-hotline link. Free-text content suggesting self-harm escalates the surface (still on-device, still no third-party reporting).

7. **Late logger.** Wants to log a feeling from earlier today, or yesterday. Sets `logged_at` (the felt-time) on the entry. Insights bucket entries by felt-time, not write-time.

8. **Editor.** Realizes they mislabeled an earlier entry. Edits emotion label, intensity, or note. Edit propagates across devices on next sync. An audit trail keeps the prior values (so insights remain reproducible if needed) but is not exposed in the UI by default.

9. **Account deleter.** Requests delete. Local data wiped immediately; server-side deletion queued and confirmed within a hard-deadline (≤ 30 days). Re-auth would create a fresh account, not recover the old one.

10. **Traveler.** Crosses a timezone boundary mid-day. Streak boundary is computed against local calendar day in the user's *current* timezone. App handles DST transitions and timezone changes without breaking streaks or double-counting.

11. **Accessibility user.** Uses VoiceOver / TalkBack. Can complete the full check-in loop (quadrant → emotion → intensity → save). Mood Meter conveys quadrant by label, position, *and* color — never color alone.

---

## Constraints

### Platform & stack

- **Mobile.** React Native via **Expo (managed workflow)** — iOS + Android. Reanimated 3 for Mood Meter interactions; Expo Notifications for local reminders; Expo SecureStore for keys; React Navigation; Zustand or similar for client state; React Query (or equivalent) for server cache.
- **Local storage.** SQLite via Expo SQLite + **SQLCipher** for at-rest encryption. Chosen over AsyncStorage so we can run real local queries for Insights without exporting raw data.
- **Server.** Node.js with **Fastify** (preferred over Express for built-in schema validation and lower overhead). **PostgreSQL** primary store. **Redis** for session and rate-limit state. **BullMQ** for async jobs (deletion, export). TypeScript across both client and server.
- **Auth.** Apple Sign-In and Google OAuth on the client; server validates identity tokens and issues short-lived JWTs with refresh tokens. No password auth in v1.
- **Push.** Expo Push registration for the future, but v1 reminders are scheduled *locally* via Expo Notifications. No server-driven push v1.
- **Hosting.** Single-region (US) v1 on a managed platform (Fly.io or Railway). Multi-region post-v1.

### Data sensitivity & privacy

- Emotion logs and especially journal notes are **mental-health-adjacent personal data**, treated as **GDPR Art. 9 special category** by default.
- **No third-party analytics SDKs that ingest user-generated content.** Crash reporting, if used, must be self-hosted Sentry or a redacted-mode SaaS configured to scrub PII; product analytics, if any, must be anonymous event-only telemetry with no journal text and no emotion content.
- **Encryption.** TLS 1.2+ in transit; SQLCipher at rest on device; row-level encryption for `journal_note` server-side.
- **Key management.** Device-side encryption key derived and stored in the platform secure enclave / keystore (Expo SecureStore wrapper).

### Compliance & ops

- GDPR-grade **data export** (all fields, JSON) and **account deletion** (cascading, queued, hard-delete deadline ≤ 30 days).
- Audit log of admin and sync operations, excluding journal contents.
- App Store / Play Store policy compliance: Apple "Sensitive Health Information" guidance, Google sensitive-data disclosure, both stores' data-collection labels.

### Quality gates (in scope from Phase 0)

- **Testing.** Unit tests on logic-heavy modules (sync engine, emotion-model lookups, streak calc, crisis heuristics). Integration tests on backend endpoints. End-to-end smoke test of the core check-in loop on iOS and Android via Detox or Maestro.
- **CI/CD.** PR pipeline runs lint, typecheck, unit tests, and a build job. Mobile builds via EAS. Deploy to staging on merge to main; promotion to prod is a tagged release. Secrets via the host's secret manager, not committed.
- **Observability.** Backend metrics (latency, error rate, queue depth) via a Prometheus-compatible endpoint; structured logs without journal contents; mobile crash reporting opt-in and PII-scrubbed.
- **Feature flags.** A simple server-driven flag service for gating crisis-detection heuristics, AI features, and risky migrations. **No third-party flag SaaS that ingests user events.**
- **Accessibility.** VoiceOver / TalkBack pass on the core loop; dynamic type honored; color contrast verified; non-color encoding for Mood Meter.

### Internationalization, timezones, dates

- Strings externalized via i18n (e.g. `react-i18next`). v1 ships English; copy is translation-ready.
- **All times stored as UTC.** Display localized to device timezone. Streak boundaries computed in the user's *current* timezone with explicit DST and timezone-change handling.
- **All entities carry `created_at`, `updated_at`, `deleted_at`.** Sync conflict resolution uses `updated_at` (write time), not `logged_at` (felt time).

---

## Open Questions

These are deliberately exposed. Many cluster into known weak spots in `initial-spec.md` and should be the spine of the PRD review legs.

### Emotion model

1. **Mood Meter taxonomy.** What is the *exact* set of emotion labels? Brackett's published Mood Meter has ~100 labels distributed across 4 quadrants and intensity bands. Do we license, derive, or curate our own? Where is the canonical list — server seed table, bundled JSON, or both? Versioned how?
2. **Intensity model.** Is intensity a 1–5 ordinal, a continuous slider, or implicit in the chosen Mood Meter cell? Mood Meter cells already encode position; an extra explicit intensity may be redundant or may add useful nuance — needs a UX call.
3. **Quadrant edge cases.** What happens at axis crossings (a feeling at "neutral pleasantness, low energy")? Allow exact axis selections, snap to nearest cell, or force a quadrant?
4. **Multi-emotion logging.** Can a user log two emotions at once? Brackett-style RULER often acknowledges co-occurring feelings; the initial sketch implies one at a time.

### Crisis & safety

5. **Crisis-detection trigger.** What signals trip the safety surface? Quadrant + intensity only, or also a free-text keyword scan? On-device only (privacy-preserving, lower recall) or server-assisted (better recall, larger surface)?
6. **Crisis content per locale.** What numbers and resources do we link to in each locale? Who owns keeping that list current? What if we ship to a market where we don't yet have a vetted hotline?
7. **Self-harm content in journal.** Do we ever surface free-text content to a human (admin, support, ML pipeline)? Default answer should be no; how does that interact with backups, exports, and abuse handling?
8. **Liability framing.** Are we comfortable taking *any* automated safety action (e.g., redirect to a hotline) given that we are not a medical device? Legal/clinical review needed.

### Sync, schema, and data integrity

9. **Conflict resolution.** Last-write-wins by which timestamp? `logged_at` is the *felt time*, not the *write time* — using it for LWW is a bug. Likely answer: device-assigned `updated_at` with server-side reconciliation; vector-clock or hybrid logical clock for offline edits.
10. **Schema evolution.** All entities need `created_at`, `updated_at`, `deleted_at`. The initial sketch is missing `updated_at`. Adopt universally now? What about migration tooling for existing rows?
11. **Editing past logs.** If a user can edit `logged_at`, journal text, or intensity after the fact, how do other devices reconcile? Is there an immutable audit trail per log? Does it ever sync?
12. **Soft delete vs. hard delete.** Soft delete for sync correctness, hard purge after a grace period. Grace period length? GDPR-mandated maximum?
13. **Per-device dedup.** A user re-installs on the same device; same `device_id`? Or new one? How do we avoid orphan records?

### Streaks

14. **Streak definition.** What counts as "a day"? Local calendar day in user's current timezone? What about timezone changes mid-streak? Does multiple-logs-per-day matter, or just one? Any grace period for missed days?
15. **Streak ownership.** Computed locally (fast, but spoofable by clock change) or server-side (authoritative, but offline-friction). Probably local with server-side verification on sync — needs explicit decision.
16. **Streak abuse.** Does it matter if a user manipulates their own streak? It's a personal-motivation feature, so probably not — but worth deciding.

### Privacy & policy

17. **Local-only mode lifetime.** Indefinite, or prompt for an account after N logs / N days? Indefinite is the strongest trust signal but costs us cross-device continuity.
18. **Photo attachments.** Stored on device only, or syncable with explicit consent? Photos massively expand the privacy and storage surface; default off, gated as Phase 2+ opt-in.
19. **Biometric lock.** Required, opt-in, or off by default? Behavior on backgrounding (instant relock vs. timeout)? Fallback when biometrics fail (passcode, account password)?
20. **Data residency.** US-only v1, or do we need EU residency for EU users from day one? Drives infrastructure choices and complicates the privacy posture either way.

### Operational & content

21. **Reminder model.** Local-scheduled only v1, or server-side scheduler for users who switch devices? Local-only is simpler and more private; server-side handles device-loss gracefully.
22. **Coping activities content.** Fixed bundled library v1, or remotely updatable? Remotely updatable means a content review process and a delivery path.
23. **Admin/support tooling.** Do we need an internal admin panel for support v1? Tempting to defer, but account-deletion verification realistically needs *something*.
24. **Launch timeline.** What is the actual target App Store / Play Store launch date? Drives scope cuts.
25. **Telemetry minimum.** Even with privacy-strict posture, what's the minimum signal we need to see if the app is actually working in the wild? (Crash count, sync error rate, install/uninstall — none of which require user content.)

---

## Rough Approach

*Sequencing, not commitments — review legs are expected to rearrange.*

### Phase 0 — Foundation

- Expo app scaffold; navigation skeleton; theming; design tokens
- Local SQLite + SQLCipher; key derivation flow stored in Expo SecureStore
- Node.js (Fastify) backend scaffold; Postgres schema with `created_at` / `updated_at` / `deleted_at` on all entities; auth endpoint stubs
- CI scaffold (lint, typecheck, unit tests on PR); staging deploy on merge
- Mood Meter taxonomy decision and bundled JSON seed
- Privacy and accessibility checklists drafted; gate criteria for each phase

### Phase 1 — Core check-in loop (offline)

- Mood Meter UI (quadrant pick → emotion label → intensity)
- Log persistence to local SQLite
- Today view; current streak (computed locally in device timezone)
- Accessibility pass on the check-in flow before declaring it done
- Unit tests for emotion-model lookup and streak calculation

### Phase 2 — Sync

- Apple + Google sign-in; server JWT issuance and refresh
- Sync engine (incremental pull by `updated_at` cursor; bulk upsert; deterministic conflict resolution using `updated_at`)
- Decision recorded: server-assigned `updated_at` wins, with explicit handling for conflicting writes
- Edit-past-log flow; soft-delete propagation
- Integration tests for the sync API; end-to-end test of the "two devices, conflict" case

### Phase 3 — Insights

- Calendar heatmap; frequency and intensity charts; time-of-day patterns; context correlations
- Color-blind-safe palette; non-color encoding for the heatmap
- All charts render from local SQLite

### Phase 4 — Journal & crisis-aware activities

- Journal list; full-text search; filter by quadrant / context / date
- Coping activity library (bundled v1)
- Crisis-aware surface: quadrant + intensity heuristic v1; on-device only; localized hotline link; gated behind a feature flag for staged rollout

### Phase 5 — Reminders & polish

- Configurable local reminders; deep link from notification into log flow
- Onboarding flow
- Dark mode, dynamic type, full a11y audit
- i18n scaffold even if shipping en-only

### Phase 6 — Production hardening

- GDPR export and deletion (queued, audited)
- Rate limiting; abuse protection; sensible password-less account-recovery flow (re-auth via OAuth provider only)
- Performance profiling (Mood Meter render, sync round-trip on cold cache, time-to-first-log on cold start)
- App Store / Play Store submission prep, sensitive-data disclosures
- Observability dashboards and alerts

### Cross-cutting (every phase)

- **Tests** added with each feature, not retrofitted
- **Feature flags** wrap any user-visible heuristic — especially crisis detection
- **Privacy review** at the end of each phase against a fixed checklist (no analytics regressions, no plaintext journal egress, no third-party SDK creep)
- **Accessibility review** for any flow added that phase
- **Telemetry review** — is what we collect still strictly the privacy-preserving minimum?

---

## Appendix: Known Gaps in `initial-spec.md` Surfaced Above

Recorded so review legs can verify they're addressed in this draft and the resulting design.

| # | Gap in initial sketch | Where surfaced here |
|---|---|---|
| 1 | Calls the model a Plutchik wheel; it should be Mood Meter (valence × energy) | Problem Statement, Goals, Constraints, Open Q1–4 |
| 2 | Emotion taxonomy hand-waved (~48 emotions, no list) | Open Q1 (taxonomy) |
| 3 | No crisis / self-harm safeguards | Goals (crisis-aware), Story 6, Constraints, Open Q5–8 |
| 4 | Conflict resolution by `logged_at` (felt time, wrong) | Constraints, Open Q9 |
| 5 | Streak logic undefined | Goals (only loop), Constraints, Open Q14–16 |
| 6 | No testing / CI/CD / observability / feature-flag strategy | Constraints (Quality gates), Phase 0 in Rough Approach |
| 7 | No accessibility specs | Goals, Constraints, Story 11, every-phase a11y review |
| 8 | No i18n or timezone handling | Constraints (i18n + timezone block), Story 10 |
| 9 | Data model lacks `updated_at` | Constraints, Open Q9–10 |
| 10 | Photo / biometric / edit-past-log features mentioned but not specified | Open Q11, Q18, Q19; Stories 7–8 |
