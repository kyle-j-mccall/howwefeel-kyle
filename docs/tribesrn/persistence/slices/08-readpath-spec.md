# Slice 8 — Read Path: Spec

> **Read `00-shared-context.md` FIRST.** This slice assumes the V1 decisions, vector inventory, refresh contract, perf baselines, naming conventions, and glossary are already in context. Do not re-state them here.

## Related slices

Cross-cutting; references the search/query surfaces of every repository slice. Owns the contact search query shape, cursor stability via PIT + `search_after`, the shard distribution analysis for `tribes_assignments`, the V1 performance baselines (cross-referenced from shared-context), the cross-user aggregation behavior, and the failure-mode catalog.

Depends on:
- **Slice 02 (Contacts)** — `IContactRepository.search`, `get_by_bins`, `get_unlabeled` interface methods (declared there; query patterns owned here).
- **Slice 03 (Bins)** — `list_for_user` sort stability and the `normalized_name` field used by cross-user aggregation.
- **Slice 04 (Assignments)** — `get_by_bins` underlying query against `tribes_assignments`.
- **Slice 05 (Tribes)** — `resolve_members` and `preview_query` rely on the `get_by_bins` path.

---

## 1. Contact Search

`IContactRepository.search` — declared in slice 02. Underlying query:

```json
{
  "query": {
    "bool": {
      "must": [
        {"term": {"owner_user_id": "<user_id>"}},
        {"multi_match": {
          "query": "<query>",
          "fields": ["display_name^3", "given_name^2", "family_name^2", "nickname"],
          "type": "best_fields",
          "fuzziness": "AUTO"
        }}
      ]
    }
  }
  // Nested query on phone_numbers.e164 and email_addresses.address also included
  // if the query string looks like phone or email.
}
```

### Field-set policy

- `display_name` boost 3, `given_name`/`family_name` boost 2, `nickname` baseline.
- `multi_match` type `best_fields` — returns the highest-scoring per-field hit.
- `fuzziness=AUTO` — Levenshtein with field-length-aware threshold.
- Edge-ngram analyzer (`tribes_name`) enables prefix matching on `display_name`/`given_name`/`family_name`.
- Phone/email recognition is a wrapper-side heuristic: if the query string matches `+\d{7,}` or contains `@`, an additional nested query is `should`-merged.

### Owner isolation

`owner_user_id` filter is non-negotiable — the wrapper cannot return cross-owner contacts (T-SEARCH-006). Empty query returns empty results (T-SEARCH-007); the wrapper does not allow a `match_all` fallback.

### `get_unlabeled`

Two-step query for V1:

1. Query `tribes_assignments` for active `contact_id`s for the user.
2. Query `tribes_contacts` with `must_not terms` on those IDs.

V1.5 may collapse to a single query with sub-aggregations.

---

## 2. Cursor Stability with PIT

The wrapper uses Elasticsearch Point-in-Time (PIT) snapshots paired with `search_after` for stable pagination. Applied to:

- `ContactRepository.list_for_user` (cursor pagination).
- `ContactRepository.search` (when paginated).
- `BinRepository.list_for_user` (multi-page, sorted).
- `AssignmentRepository.get_by_bins` and `get_contacts_for_bin` (paginated).

### Lifecycle

- **Open:** on the first page request, the wrapper opens a PIT (`POST /<index>/_pit?keep_alive=5m`).
- **Reuse:** subsequent pages reuse the PIT id and pass the previous page's sort values via `search_after`.
- **Close:** on client completion the wrapper issues `DELETE /_pit`. PITs auto-expire after 5 minutes of inactivity.

### Cursor token format

Base64-encoded JSON:

```
{ "pit_id": "<pit_id>", "sort_values": [<sort_values_array>] }
```

### PIT lifetime

5 minutes (`keep_alive=5m`). Matches the cascade-cleanup sweep cadence (slice 06) and balances stability against ES resource consumption.

### Stale cursor contract

When the client submits a cursor whose PIT has expired (ES returns `search_phase_execution_exception` with `pit_id_not_found`), the wrapper raises `StaleCursorError`. The client MUST restart pagination from page 1. The wrapper does NOT auto-recover by opening a fresh PIT — silent recovery would mask result-set drift introduced by mutations during the gap.

### Mutation isolation

Inserts and updates that occur after a PIT is opened are invisible to that PIT. Page 2 returns docs from the snapshot at PIT-open time, not post-insert state (T-SEARCH-CURSOR-MUTATION-ISOLATION).

### Sort stability across shards

Sorts always include a tiebreaker (`_id` or a deterministic equivalent) so cross-shard merging yields a consistent total order. `BinRepository.list_for_user` sorts by `(normalized_name, _id)`; `AssignmentRepository.get_*` sorts by `(assigned_at desc, _id asc)`. Test plan T-SEARCH-024 / T-SEARCH-040 / T-SEARCH-041 verify.

---

## 3. Shard Distribution Analysis (`tribes_assignments`)

Index: `tribes_assignments`. Shards: 3 primary (V1). `_id`: `{owner_user_id}#{contact_id}#{bin_id}`.

ES uses Murmur3 hash of `_id` modulo shard count. The shared `owner_user_id` prefix does NOT cause clustering — Murmur3 isn't prefix-sensitive; small suffix changes produce uncorrelated outputs. Two docs from the same user with different `contact_id` distribute uniformly across shards.

### Per-user concentration with default `_id` routing

Does not occur. A user with 1000 assignments has approximately 333 docs per shard.

### Per-user query locality

Does not occur. Queries filtered by `owner_user_id` fan out to all 3 shards. At V1 scale (max ~2000 contacts/user), each shard holds ~667 docs total per power user. Latency dominated by network round-trip, not shard count. Acceptable.

### Why NOT `routing=owner_user_id`

- Pro: per-user query single-shard. Marginal benefit at V1 scale.
- Con: write distribution becomes user-distribution. If 1% of users generate 90% of writes, those power users hash to at most 3 distinct shards. Worst case: all power users hash to the same shard → ~90% write load on one shard.
- Variance much higher with routing. Default `_id` hashing breaks up concentration even when user prefix skews.

**Recommendation: keep default `_id`-based routing for V1.** Revisit if shard count grows beyond 10, per-user document counts exceed 50,000, or per-user query latency becomes a measured SLO concern.

The wrapper MUST NOT pass `routing=` kwarg to any `client.*` write or read call (T-SHARD-020 / T-SHARD-021 — AST-level regression guards).

---

## 4. V1 Performance Baselines (Cross-Reference)

The full table lives in `00-shared-context.md` ("V1 Performance Baselines"). Reproduced here for the read-path slice:

| Operation | p95 Target |
|---|---|
| `get_by_id` (any repository) | < 50 ms |
| Contact search (single term, `fuzziness=AUTO`, edge_ngram prefix) | < 200 ms |
| Cross-user `terms` aggregation on `normalized_name` | < 500 ms |
| Bulk contact import (500 contacts in single `bulk` API call) | < 2 s |
| Tribe member resolution (dynamic, ≤ 2000 contacts/user) | < 300 ms |
| Pending-jobs sweep cycle (process 100 jobs) | < 5 s |

These are baselining-only initially (collect telemetry, gate after 30 days). Operations exceeding p95 by 2× in production trigger a perf investigation.

Each test under `T-PERF-*` is `@pytest.mark.slow @pytest.mark.perf`.

---

## 5. Cross-User Aggregation (V1 Ceiling)

The aggregation enabled by `tribes_bins.normalized_name`:

```json
GET /tribes_bins/_search
{
  "size": 0,
  "query": { "term": { "normalized_name": "hike" } },
  "aggs": {
    "user_count":   { "cardinality": { "field": "owner_user_id" } },
    "bin_variants": { "terms": { "field": "name", "size": 50 } }
  }
}
```

V1 boundary: this collapses spelling/case/morphological variants of one English root, NOT semantic synonyms. `"Hiking"` and `"Walking"` remain in distinct buckets (T-AGG-003). Conceptual synonymy is V2 (`tribes_canonical_labels` + bounded BFS).

Empty `normalized_name` buckets (e.g., a bin named `"!!!"` whose normalize output is `""`) are excluded from aggregation (T-AGG-004).

For >10k buckets, use `composite` aggregation pagination (T-AGG-005).

---

## 6. Failure Modes — Negative Catalog

The complete failure-mode catalog the wrapper must surface as typed exceptions:

| Failure | Trigger | Typed exception |
|---|---|---|
| ES connection refused | Network outage | `EsUnavailableError` |
| ES timeout | Latency exceeds `request_timeout` | `EsTimeoutError` |
| ES 5xx | Cluster overload / internal error | `EsServerError` |
| Mapping conflict | Write incompatible type to mapped field | `EsMappingConflictError` |
| Version conflict on optimistic-locked update | Concurrent mutation | `VersionConflictError` |
| Identity resolution: empty candidate fetch | New unique contact | (no exception — new contact created) |
| Identity resolution: multiple candidates above threshold | 3 candidates: 0.86, 0.9, 0.95 | (no exception — highest score wins; WARNING log) |
| Identity resolution: candidate below threshold | 1 candidate at 0.4 | (no exception — new contact created) |
| `BinRepository.create` empty name | `name=""` | `InvalidBinNameError` |
| `BinRepository.create` name normalizes to empty | `name="!!!"` | `InvalidBinNameError` |
| `AssignmentRepository.assign` non-existent bin | `bin_id` not in index | `BinNotFoundError` |
| `AssignmentRepository.assign` non-existent contact | `contact_id` not in index | `ContactNotFoundError` |
| `TribeRepository.resolve_dynamic_members` on static tribe | Wrong tribe shape | `InvalidTribeShapeError` |
| `PendingJobsRepository.find_pending` on missing index | Fresh deploy | (no exception — empty result; sweep is robust) |
| Painless script error | Malformed script | `EsScriptError` |
| Stale cursor | Expired PIT | `StaleCursorError` |

All typed exceptions subclass `TribesRepositoryError`. The HTTP-layer mapping table lives in slice 01.

---

## 7. Stories (Reference)

From spec §13:

- **Story 4: ContactRepository — Search** — multi_match shape, fuzziness, edge_ngram, owner isolation, empty-query 400.
- **Story 6: ContactRepository — get_by_bins & get_unlabeled** — OR/AND semantics, city filter, two-step unlabeled query.

Cursor pagination, shard distribution regression guard, perf baselines, cross-user aggregation, and the failure-mode catalog do not have dedicated stories in spec §13; the slice-8 epic should produce:

- **A cursor-pagination story** (PIT open/reuse/close, cursor token format, `StaleCursorError`).
- **A shard-distribution regression-guard story** (no `routing=` kwarg, distribution property tests).
- **A perf-baselines story** (six `T-PERF-*` baselining tests; CI-gate after 30 days).
- **A failure-mode catalog story** that ensures every typed exception in §6 has a passing test.

---

Pairs with `08-readpath-tests.md`.
