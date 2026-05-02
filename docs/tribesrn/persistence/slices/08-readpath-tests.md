# Slice 8 — Read Path: Tests

> **Read `00-shared-context.md` FIRST.** This slice assumes the V1 decisions, vector inventory, refresh contract, perf baselines, naming conventions, and glossary are already in context. Do not re-state them here.

## Related slices

Cross-cutting; references search/query surfaces of every repository slice. Runs last in CI so it can name concrete repository methods.

---

## Conventions

Test ID areas used here: `SEARCH`, `SHARD`, `PERF`, `AGG`, `FAIL`. Markers: `@pytest.mark.integration`, `@pytest.mark.property` + `@pytest.mark.slow` for shard distribution, `@pytest.mark.slow @pytest.mark.perf` for performance smoke tests, `@pytest.mark.network_fault` for the connection-error subset, `@pytest.mark.regression_guard` for AST/grep guards.

---

## Section 13: Search & Query Patterns

`@pytest.mark.integration`. Spec sections validated: contact search (multi_match, fuzziness, edge_ngram), get_by_bins (cross-ref slice 04), cursor pagination, sort stability.

### Contact search

| ID           | Asserts                                                                                                       | Setup                                       | Trigger                                                              | Expected                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| T-SEARCH-001 | Exact phone match returns the contact with phone                                                              | 3 contacts, one with phone +15551234567     | `repo.search(owner, "+15551234567")`                                  | 1 result                                                       |
| T-SEARCH-002 | Exact email match returns the contact                                                                         | 3 contacts                                  | `repo.search(owner, "alice@example.com")`                             | 1 result                                                       |
| T-SEARCH-003 | Display-name typo within fuzziness AUTO returns the contact                                                   | Contact "Alice Smith"                       | `repo.search(owner, "Allice")`                                        | 1 result                                                       |
| T-SEARCH-004 | Prefix search via edge_ngram returns matches even on partial input                                            | Contact "Alice Smith"                       | `repo.search(owner, "Ali")`                                           | 1 result                                                       |
| T-SEARCH-005 | `multi_match` with `best_fields` returns highest-scoring match across `display_name`, `family_name`, `given_name`, `email_addresses.value`, `phone_numbers.value` | Multi-field setup                            | `repo.search(owner, "Smith")`                                         | Doc returned with score reflecting `family_name` hit         |
| T-SEARCH-006 | Search scoped to `owner_user_id` does not return another owner's contacts                                     | Two owners                                  | `repo.search(owner_a, "Smith")`                                       | Only owner_a's contacts                                        |
| T-SEARCH-007 | Empty query returns empty results (no `match_all` foot-gun)                                                   | 100 contacts                                | `repo.search(owner, "")`                                              | 0 results                                                      |
| T-SEARCH-008 | Single-character query returns results (edge_ngram min_gram == 1; or per spec)                                 | -                                           | `repo.search(owner, "A")`                                             | Per spec; document the behavior                                |

### `get_by_bins` semantics

Covered in slice 04; cross-references T-ASSIGN-060..065.

### Cursor pagination

| ID           | Asserts                                                                                                            | Setup                                  | Trigger                                                          | Expected                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| T-SEARCH-020 | First page of size N returns N docs and a `next_cursor` token                                                      | 100 contacts                           | `repo.list_for_user(owner, limit=20)`                            | 20 docs; `next_cursor` non-null                                                       |
| T-SEARCH-021 | Following the cursor yields the next page; concatenation of all pages reconstructs the full set with no overlap   | 100 contacts                           | Walk all 5 pages                                                 | 100 unique docs; no duplicates                                                        |
| T-SEARCH-022 | Cursor is stable across re-issues (same cursor → same next page) within a refresh window                          | 100 contacts                           | Re-use same cursor                                                | Identical results                                                                     |
| T-SEARCH-023 | Last page returns `next_cursor=None`                                                                               | 100 contacts                           | Walk to end                                                      | `next_cursor is None`                                                                 |
| T-SEARCH-024 | Cursor over a sort that includes a tiebreaker (e.g., `(normalized_name, _id)`) is stable across shards             | 100 docs spread across 3 shards        | Walk pages                                                        | No duplicates, no skips                                                               |
| T-SEARCH-025 | Cursor pagination uses PIT + `search_after`; cursor token = base64-encoded JSON of `{pit_id, sort_values}`; PIT lifetime 5 min; results consistent with the snapshot at PIT-open time and are not affected by inserts/updates after; stale PIT (after 5 min) raises `StaleCursorError` with no auto-recovery | 100 contacts; insert mid-walk                        | Walk pages                                                        | Page-2 results reflect the snapshot from PIT open, not post-insert state; no exception, no double-return         |
| T-SEARCH-026 | (`@pytest.mark.slow @pytest.mark.perf`) Pagination through 100k docs: walks all pages with p95 wall-clock under the cursor-pagination baseline (initial runs are baselining only; CI gates on the target after 30 days of telemetry) | 100k contacts                          | Walk all pages                                                   | Wall-clock p95 under baseline; no `search_after` errors                                  |

**T-SEARCH-CURSOR-PIT-OPEN** — First page request opens a PIT. Setup: contact corpus of 100 docs. Trigger: paginated query, page size 20. Expected: ES `_pit` API called with `keep_alive=5m`; cursor token in response is base64-decodable to `{pit_id, sort_values}`. Validates: spec §2 / cursor stability contract.

**T-SEARCH-CURSOR-MUTATION-ISOLATION** — Inserts during pagination are invisible to the cursor. Setup: paginate page 1 of 5. Trigger: insert 10 new contacts; request page 2. Expected: page 2 contains only docs from the original snapshot; the 10 new contacts do not appear. Validates: PIT snapshot semantics.

**T-SEARCH-CURSOR-STALE** — Expired PIT raises `StaleCursorError`. Setup: open PIT, wait 6 minutes. Trigger: request page 2 with the original cursor. Expected: raises `StaleCursorError`; no auto-recovery; client must restart pagination. Validates: spec stale-cursor contract.

### Sort stability

| ID           | Asserts                                                                                                  | Setup           | Trigger                                              | Expected                                            |
| ------------ | -------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------- | --------------------------------------------------- |
| T-SEARCH-040 | `BinRepository.list_for_user` sorted by `(normalized_name, _id)` is deterministic across repeated calls  | 50 bins         | Run 10 times                                          | Same order each run                                 |
| T-SEARCH-041 | Sort uses `keyword` sub-field (not `text`) for `normalized_name` to avoid fielddata cost                 | None            | Inspect query body                                   | Sort field is `normalized_name` (already keyword)   |

### Performance baselines (P2 — baselining initially, CI-gated after 30 days)

Each test is marked `@pytest.mark.slow @pytest.mark.perf`. Initial runs collect telemetry only; CI gates on these targets after 30 days of baseline data.

**T-PERF-GET-BY-ID** — `get_by_id` p95 < 50ms. Fixture: 1k contacts/user. Operation: 100 sequential `get_by_id` calls. Assertion: p95 latency < 50ms.

**T-PERF-CONTACT-SEARCH** — Contact search (single term, fuzziness AUTO) p95 < 200ms. Fixture: 1k contacts/user. Operation: 100 search queries with random valid terms. Assertion: p95 < 200ms.

**T-PERF-AGG-NORMALIZED** — Cross-user terms agg on `normalized_name` p95 < 500ms. Fixture: 100 users × 50 bins each = 5000 bin docs. Operation: terms aggregation on `normalized_name`. Assertion: p95 < 500ms.

**T-PERF-BULK-IMPORT** — Bulk import 500 contacts p95 < 2s. Fixture: 500 valid ContactImportInput records. Operation: `batch_import`. Assertion: p95 < 2s.

**T-PERF-TRIBE-RESOLVE** — Tribe member resolution (dynamic, ≤2000 contacts/user) p95 < 300ms. Fixture: dynamic tribe over 5 bins, 2000 assignments. Operation: `resolve_members`. Assertion: p95 < 300ms.

**T-PERF-PENDING-SWEEP** — Pending-jobs sweep cycle (100 jobs) p95 < 5s. Fixture: 100 pending jobs across mixed `op_type` values. Operation: trigger sweep. Assertion: p95 cycle time < 5s.

---

## Section 10: Shard Distribution

`@pytest.mark.integration @pytest.mark.property @pytest.mark.slow`. Spec sections validated: default `_id`-based routing, Murmur3 spread.

### Property-based distribution

| ID         | Asserts                                                                                                                                                                            | Setup                                                                            | Trigger                                                                          | Expected                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| T-SHARD-001 | For a single `owner_user_id`, 10k synthetic assignments distribute approximately uniformly across 3 primary shards (chi-squared p > 0.01, or each shard within ±10% of mean count) | Index `tribes_assignments` with 3 primaries; one fixed owner; 10k random `(contact_id, bin_id)` pairs via Hypothesis | Bulk write 10k docs; query `_cat/shards` or `count` per-shard via `preference=_shards:N`         | Distribution within tolerance                                                                                       |
| T-SHARD-002 | Same property holds for `tribes_contacts`: 10k contacts for one synthetic owner spread across 3 shards                                                                              | As above                                                                         | As above                                                                         | Within tolerance                                                                                                    |
| T-SHARD-003 | Same property holds for `tribes_bins`: 1k bins for one owner (smaller because bin count per owner is naturally smaller)                                                              | As above                                                                         | As above                                                                         | Within tolerance (relax to ±20% for smaller N)                                                                      |

### Regression guard: no `routing` parameter

| ID         | Asserts                                                                                                                | Setup                  | Trigger                | Expected                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------- | ----------------------------------------------------- |
| T-SHARD-020 | The wrapper does NOT pass `routing` kwarg to any `client.*` write or read call (V1 uses default `_id` routing only)    | None                   | AST walk over wrapper  | Zero `routing=` kwargs in wrapper code                |
| T-SHARD-021 | If a future PR adds `routing=`, this test fails (regression guard)                                                     | -                      | Same                   | Same                                                   |

---

## Section 14: Cross-User Aggregation (V1 ceiling test)

`@pytest.mark.integration @pytest.mark.regression_guard`. Spec sections validated: `terms` aggregation on `normalized_name`, V1/V2 boundary.

| ID         | Asserts                                                                                                                                | Setup                                                                                  | Trigger                                                                | Expected                                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| T-AGG-001  | `terms` aggregation on `normalized_name` across all owners returns expected `user_count` cardinality                                   | 3 owners each with bin "Hiking" (-> normalized "hike"); 2 owners each with "Walking"   | Aggregation query                                                      | Bucket `"hike"` has user_count 3; bucket `"walk"` has user_count 2                                                    |
| T-AGG-002  | `cardinality` sub-aggregation on `owner_user_id` within each bucket gives unique-owner count                                            | Same                                                                                   | Same                                                                   | Cardinalities match                                                                                                   |
| T-AGG-003  | V1 boundary: a query for `"Hiking"` vs `"Walking"` does NOT collapse them in V1 (the normalization is purely lexical, not semantic)    | Hiking + Walking docs                                                                  | Two separate aggregation queries on each `normalized_name`             | `"hike"` bucket and `"walk"` bucket are distinct; no semantic clustering happens                                      |
| T-AGG-004  | Empty `normalized_name` bin (e.g., a bin named `"!!!"` whose normalize output is `""`) is excluded from aggregation                     | 1 bin with empty normalized                                                            | Aggregation query                                                      | Empty bucket not present (filtered or by spec)                                                                        |
| T-AGG-005  | Aggregation pagination via `composite` aggregation works for >10k buckets                                                              | 15k unique normalized names                                                            | Composite aggregation walk                                             | All buckets returned over multiple pages                                                                              |

---

## Section 15: Negative & Failure-Mode Tests

`@pytest.mark.integration` and `@pytest.mark.network_fault` for the connection-error subset.

| ID         | Asserts                                                                                                  | Setup                                          | Trigger                                                          | Expected                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| T-FAIL-001 | ES connection refused -> wrapper raises typed `EsUnavailableError`                                       | Toxiproxy: kill ES port                        | Any wrapper write/read                                           | Typed exception with `cause` chain                                             |
| T-FAIL-002 | ES timeout -> typed `EsTimeoutError`                                                                     | Toxiproxy: latency 30s, timeout 1s             | Any wrapper write/read                                           | Typed exception                                                                |
| T-FAIL-003 | ES 5xx -> typed `EsServerError`; caller can retry                                                        | Toxiproxy: 5xx injection                       | Any wrapper write                                                | Typed exception                                                                |
| T-FAIL-004 | ES mapping conflict (write incompatible type to mapped field) -> typed `EsMappingConflictError`          | Pre-existing mapping; submit incompatible value | Direct write                                                     | Typed exception, no silent type coercion                                       |
| T-FAIL-005 | ES version conflict on optimistic-locked update -> typed `VersionConflictError`                          | Concurrent mutation                            | Trigger conflict                                                  | Typed exception (covered also in T-CONTACT-MERGE-013)                          |
| T-FAIL-006 | Identity resolution: candidate fetch returns empty -> wrapper creates new contact (no merge attempted)   | New contact, no candidates                     | `repo.import_contact(payload)`                                    | New contact created; no merge_audit entry; no warning log                      |
| T-FAIL-007 | Identity resolution: candidate fetch returns multiple over threshold -> highest score wins, WARNING log  | 3 candidates: 0.86, 0.9, 0.95                  | `repo.import_contact(payload)`                                    | Merge into 0.95 candidate; WARNING log captured                                |
| T-FAIL-008 | Identity resolution: candidate fetch returns one below threshold -> new contact, no merge                | 1 candidate at 0.4                             | Same                                                             | New contact; no merge                                                          |
| T-FAIL-009 | `BinRepository.create` with empty `name` raises typed `InvalidBinNameError`                              | None                                           | `repo.create(owner, "")`                                          | Typed exception                                                                |
| T-FAIL-010 | `BinRepository.create` with name that normalizes to empty raises typed `InvalidBinNameError`             | None                                           | `repo.create(owner, "!!!")`                                       | Typed exception                                                                |
| T-FAIL-011 | `AssignmentRepository.assign` with non-existent `bin_id` raises typed `BinNotFoundError`                 | Bin not in index                               | `repo.assign(o, c, b_missing)`                                    | Typed exception                                                                |
| T-FAIL-012 | `AssignmentRepository.assign` with non-existent `contact_id` raises typed `ContactNotFoundError`         | Contact not in index                           | Same                                                              | Typed exception                                                                |
| T-FAIL-013 | `TribeRepository.resolve_dynamic_members` on a static tribe raises typed `InvalidTribeShapeError`        | Static tribe                                   | Call resolve                                                      | Typed exception                                                                |
| T-FAIL-014 | `PendingJobsRepository.find_pending` when index doesn't exist returns empty (defensive; sweep is robust) | Index dropped                                  | `repo.find_pending(100)`                                          | Empty result; no exception (sweep should not crash if a fresh deploy)          |
| T-FAIL-015 | Painless script error (e.g., script syntax) on `_increment_assignment_count` raises typed `EsScriptError`| Inject malformed script                        | Increment                                                         | Typed exception                                                                |

---

Pairs with `08-readpath-spec.md`.
