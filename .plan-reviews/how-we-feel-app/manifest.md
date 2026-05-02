# Plan Review Manifest

| Field | Value |
|---|---|
| Review ID | `how-we-feel-app` |
| Repo root | `/Users/defidavid/gc/.gc/worktrees/how-we-feel/polecats/furiosa` |
| Coordinator agent | `how-we-feel/furiosa` |
| Review target | `how-we-feel/polecat` |
| Formula | `mol-idea-to-plan` |
| Root bead | `hwf-4xf` |

## Problem Statement

Build a production-grade React Native + Node.js implementation of *How We Feel* — an emotional wellness mobile app based on Marc Brackett's Yale RULER framework and Mood Meter (2D valence × energy quadrants). The app helps users build emotional granularity through daily check-ins, journaling, and pattern insights. Targets iOS and Android via Expo, with offline-first SQLite, secure cloud sync, OAuth (Apple/Google), push reminders, and full GDPR compliance.

Stack: React Native (Expo), Node.js + Postgres + Redis, JWT auth, Expo Push for notifications. Privacy: mental-health data sensitivity, no third-party analytics SDKs that exfiltrate user content.

A starting-point sketch lives at `initial-spec.md`. It is not ground truth — it has known gaps the review legs are expected to surface (mistakenly calls the emotion model a Plutchik wheel, hand-waves emotion taxonomy, omits crisis safeguards, gets sync conflict resolution wrong, undefined streak logic, no testing/CI/CD/observability/feature-flag strategy, no accessibility specs, no i18n or timezone handling, missing `updated_at` in data model, photo/biometric/edit-past-log features mentioned but unspecified).

## Artifacts

- `.prd-reviews/how-we-feel-app/prd-draft.md` — initial PRD draft (this step)
- `.prd-reviews/how-we-feel-app/prd-review.md` — synthesized review (later step)
- `.designs/how-we-feel-app/design-doc.md` — baseline design (later step)
- `.plan-reviews/how-we-feel-app/state.env` — pipeline state
- `.plan-reviews/how-we-feel-app/manifest.md` — this file
