# Slice 00 — Shared Context (Read First)

> **Read this BEFORE any individual slice.** This document establishes the V1 baseline that every spec slice (`01`–`08`) and every test slice assumes the reader has already loaded. It is intentionally short. The slices that follow assume the V1 decisions, vector inventory, refresh contract, perf baselines, naming conventions, and glossary defined here are already in context.

---

## Project at a glance

**Tribes** is a friendship-activation app. Users import their iOS contacts, "flick" each contact into one or more user-owned **bins** (labels like "Hiking", "Tech support"), then assemble **tribes** (groups defined either statically by a member list or dynamically by a stored bin query) for the purpose of coordinating shared activity.

The persistence layer for V1 is **Elasticsearch only** (4 V1 indices + 1 operational pending-jobs index). V2 adds **ArangoDB** for multi-hop graph traversal and an additive `tribes_canonical_labels` index for canonical concept resolution. V2 is purely additive; no V1 indices are altered or dropped during the V1→V2 migration.

---

## The 9 V1 Decisions (Session 2026-04-27)

| # | Topic | Decision |
|---|---|---|
| 1 | Assignment upsert resurrection | Caller explicitly sets `is_active=True` in update payload; wrapper performs no implicit resurrection. |
| 2 | `assignment_count` drift | V1 accepts rough counts. Verify the count never gates control flow (delete/hide); if it does, escalate. |
| 3 | Cross-index cascade cleanup | Failed cascades logged to `tribes_pending_jobs` index; 5-min sweep retries. |
| 4 | Identity merge | Field-level union rules with `import_idempotency_token` and append-only `merge_audit`. |
| 5 | Bin name conflict | Layered: deterministic `_id` (Safeguard A) + post-write verification with `wait_for` (Safeguard B). |
| 6 | Denormalization strategy V1 | Lexical normalization only (Snowball stemmer). Canonical embedding layer deferred to V2. |
| 7 | Refresh contract | `refresh=False` default; `wait_for` exception list defined for specific writes. |
| 8 | Shard distribution | Keep default `_id`-based routing for V1. Revisit at >10 shards or >50k docs/user. |
| 9 | V2 architecture | ES + ArangoDB. Canonical embedding (`tribes_canonical_labels`) + bounded BFS in ArangoDB. |

---

## V1 Boundary

**In V1 (this spec):**

- 4 V1 indices: `tribes_contacts`, `tribes_bins`, `tribes_assignments`, `tribes_tribes`.
- 1 operational index: `tribes_pending_jobs`.
- Lexical normalization (NFKC + casefold + punct/symbol strip + Snowball stem) for cross-user aggregation.
- Identity resolution via blocking keys + probabilistic scoring.
- Soft-delete on assignments, hard-delete on contacts/bins/tribes (with cascade via pending jobs).
- Cursor pagination via PIT + `search_after`.
- Default `_id`-based routing on all indices.

**Deferred to V2:**

- Community `certaintyWeight` aggregation.
- Agentic bin rule evaluation.
- Vector / semantic similarity search (`dense_vector`).
- Multi-hop graph traversal (ArangoDB).
- Conceptual synonymy across distinct stems (`Hiking` ↔ `Walking`).
- Cross-language matching, multi-word concept clustering.
- Offline sync / conflict resolution.

---

## V1 Vector Field Inventory: NONE

V1 contains **NO `dense_vector` fields**. All four V1 indices (`tribes_contacts`, `tribes_bins`, `tribes_assignments`, `tribes_tribes`) and the operational `tribes_pending_jobs` index use only scalar, keyword, text, nested, date, integer, float, and object field types.

The single `dense_vector` field in the system (`tribes_canonical_labels.embedding`, 768 dims, cosine similarity, HNSW-indexed) belongs to V2 only.

V1 implementations MUST NOT introduce `dense_vector` fields. If vector search is needed earlier than V2 ship, that decision triggers a spec amendment, not an opportunistic addition.

---

## Refresh Contract Summary

**Default.** All production writes use `refresh=False` (ES default).

**What consumers CAN rely on (refresh=False):**
- Write is durable (translog-persisted) on acknowledgment.
- Get-by-ID for the written `_id` returns the current version immediately.
- Subsequent writes to the same `_id` are sequenced correctly.

**What consumers CANNOT rely on (refresh=False):**
- Search queries (terms, match, range) returning the just-written document.
- `hits.total.value` counts reflecting the write.
- Any query used for uniqueness checking or post-write verification.

**Exception list — writes that MUST use `refresh="wait_for"`:**

| Repository Method | Reason |
|---|---|
| `BinRepository.create` / `upsert` | Post-write verification immediately issues a search query. |
| `ContactRepository.import_contact` (merge update) | Identity resolution candidate fetch for chained operations must see merged state. |
| `PendingJobsRepository.create_job` | Sweep job queries by `status=pending`; if not visible, missed on first interval. |
| `BinRepository.rename` (the old-doc delete step in Safeguard A) | Safeguard B's post-write verification on the new doc must see the absence of the old doc. If the delete is not visible to the search, the verification false-positives. |

**All other writes** — assignments create/update, contacts created outside the merge path, bin soft-deletes — use `refresh=False`.

**`refresh=true` (synchronous force) is PROHIBITED in production write paths.** It is a cluster-wide performance hazard. Use `wait_for` when search-visibility is required.

---

## V1 Performance Baselines

These are the V1 launch baselines, measured on the recommended Cloud Run + ES Cloud topology under representative load (1k contacts/user, 50 bins/user, 2k assignments/user). Conservative starting targets; tighten after measurement.

| Operation | p95 Target |
|---|---|
| `get_by_id` (any repository) | < 50 ms |
| Contact search (single term, `fuzziness=AUTO`, edge_ngram prefix) | < 200 ms |
| Cross-user `terms` aggregation on `normalized_name` | < 500 ms |
| Bulk contact import (500 contacts in single `bulk` API call) | < 2 s |
| Tribe member resolution (dynamic, ≤ 2000 contacts/user) | < 300 ms |
| Pending-jobs sweep cycle (process 100 jobs) | < 5 s |

Operations exceeding p95 by 2× in production trigger a perf investigation. Baselines revisited after the first 30 days of production telemetry.

---

## Naming Conventions

**Index names** (all share the `tribes_` prefix; `TRIBES_ES_INDEX_PREFIX` env var overrides for testing):

- `tribes_contacts` — one doc per resolved contact entity.
- `tribes_bins` — one doc per user-owned label.
- `tribes_assignments` — one doc per `(owner, contact, bin)` triple. The join table.
- `tribes_tribes` — one doc per coordination unit (static or dynamic).
- `tribes_pending_jobs` — operational index for cross-index cascade retry.

**Document `_id` schemes:**

| Index | `_id` scheme | Purpose |
|---|---|---|
| `tribes_contacts` | UUID4 | System-assigned at first write; stable for life of contact. |
| `tribes_bins` | `sha256("{owner_user_id}#{slug(name)}")[:32]` | Deterministic — Safeguard A against duplicate bin names per owner. |
| `tribes_assignments` | `f"{owner_user_id}#{contact_id}#{bin_id}"` (truncated SHA-256 in spec test §5) | Deterministic — enables idempotent assign + soft-delete resurrection. |
| `tribes_tribes` | UUID4 | System-assigned. |
| `tribes_pending_jobs` | `sha256(op_type + primary_id)` | Deterministic — re-submitting same logical cascade is a no-op upsert. |

`slug(name)` for bins: lowercase, NFC-normalized, whitespace collapsed to single space, trimmed. Stable; any change is breaking and requires reindex.

---

## Glossary

- **Contact** — A resolved person entity in `tribes_contacts`. Created by import (iOS contacts or manual). Subject to identity resolution: a single real-world person imported by multiple sources may collapse to one canonical contact.
- **Bin** — A user-owned label in `tribes_bins`. Examples: "Hiking", "Tech support". Each bin is owned by exactly one user (community bins are V2). Bin name uniqueness per owner is enforced by Safeguard A + B.
- **Assignment** — A `(owner, contact, bin)` triple in `tribes_assignments`, the join table created by a "flick" gesture. Soft-deleted via `is_active=False`. Includes denormalized `bin_name`, `bin_domain`, `bin_color_hex` for display without join.
- **Tribe** — A coordination unit in `tribes_tribes`. **Static tribes** carry an explicit `member_contact_ids` list. **Dynamic tribes** carry a stored `TribeQuery` (bin_ids + operator + filters) executed against `tribes_assignments` at read time.
- **Coordination** — User-initiated outreach to the resolved members of a tribe (out of scope for the wrapper; the wrapper only resolves members and updates `last_coordination_at`).
- **Pending Job** — An entry in `tribes_pending_jobs` representing a deferred secondary write (cascade delete, denormalization reconciliation). Picked up by a 5-minute sweep with retry budget of 5 attempts before transitioning to `failed_permanent`.

---

## Cross-Slice Dependency Map

```
01 Foundation (mappings, client, indices)
  └── prerequisite for everything else

02 Contacts ──────────┐
                      ├── 04 Assignments (FK to bin + contact)
03 Bins ──────────────┤
                      └── 05 Tribes (FK to bin, optional FK to contacts)

04 Assignments ───────────────────────────────┐
                                              ├── 06 Cascade (delete bin / contact → assignments)
03 Bins (rename / color → denorm refresh) ────┘

07 Consistency (refresh + concurrency + drift) — cross-cutting; references all repos
08 Read Path (search + cursor + shards + perf + failure) — cross-cutting; references all repos
```

Recommended slice consumption order for `bmad-create-epics-and-stories`:

1. Foundation (01) — must be epic'd first; everyone depends on it.
2. Contacts (02) and Bins (03) — independent leaves; either order works.
3. Assignments (04) — references contact + bin epics.
4. Tribes (05) — references assignments.
5. Cascade (06) — references contact + bin + assignment delete paths.
6. Consistency (07) — references all repo methods; runs after repos are epic'd so it can name them concretely.
7. Read Path (08) — runs last; references the search + pagination surfaces of all repos.
