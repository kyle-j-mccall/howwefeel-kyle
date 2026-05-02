# Elasticsearch Wrapper V1 Test Plan

Status: Draft, V1 scope, session 2026-04-27
Owner: Persistence layer (no API/UI/business-logic coverage above the wrapper)
Companion spec: `_bmad-output/persistence/planning/elasticsearch-wrapper-spec.md`

---

## Conventions

### Test ID Scheme

Every test has a stable, referencable ID: `T-<AREA>-<NNN>`.

Areas (kept short; aligned to plan sections):

| Code               | Area                                    |
| ------------------ | --------------------------------------- |
| NORM               | Lexical normalization (Section 1)       |
| MAP                | Index mappings & schema (Section 2)     |
| CONTACT            | ContactRepository (Section 3)           |
| CONTACT-MERGE      | Identity merge field rules (Section 3)  |
| CONTACT-IDRES      | Identity resolution scoring (Section 3) |
| BIN                | BinRepository general (Section 4)       |
| BIN-CONFLICT-A     | Bin name Safeguard A (Section 4)        |
| BIN-CONFLICT-B     | Bin name Safeguard B (Section 4)        |
| ASSIGN             | AssignmentRepository (Section 5)        |
| TRIBE              | TribeRepository (Section 6)             |
| PJOB               | PendingJobsRepository (Section 7)       |
| CASCADE            | Cascade cleanup E2E (Section 8)         |
| REFRESH            | Refresh contract compliance (Section 9) |
| SHARD              | Shard distribution (Section 10)         |
| CONCUR             | Concurrency / idempotency (Section 11)  |
| DRIFT              | assignment_count drift tolerance (S 12) |
| SEARCH             | Search & query patterns (Section 13)    |
| AGG                | Cross-user aggregation (Section 14)     |
| FAIL               | Negative & failure-mode (Section 15)    |

### Test File Naming and Location

- Repository root: `tribes-api/`
- Test root: `tribes-api/tests/`
- Mirror of source tree: `src/tribes_api/persistence/elasticsearch/repositories/contact.py` -> `tests/persistence/elasticsearch/repositories/test_contact.py`
- Pure-unit tests live next to the module they cover under `tests/unit/...`
- Integration tests live under `tests/integration/persistence/elasticsearch/...`
- Property-based tests (Hypothesis) live under `tests/property/persistence/elasticsearch/...` to keep CI sharding clean

### Fixture Setup

- **Ephemeral Docker ES** is mandatory for integration tests. The project's `docker-compose.yml` at the repo root is the canonical local ES (8.x, single-node, security disabled).
- A pytest session-scoped fixture `es_container` boots ES once per test session (or reuses an externally-launched container if `TRIBES_ES_URL` is set).
- A function-scoped fixture `es_client` returns a fresh `AsyncElasticsearch` wired to that container.
- A function-scoped fixture `clean_indices` deletes and re-creates the V1 indices with the canonical mappings before each test. This is the default for integration tests.
- For tests that need many docs and tolerate cross-test contamination, an opt-in `shared_indices` fixture re-uses indices across the module; tests in that module must scope their writes by a unique synthetic `owner_user_id` prefix.
- Repository fixtures (`contact_repo`, `bin_repo`, `assignment_repo`, `tribe_repo`, `pending_jobs_repo`) wrap an `es_client` and the relevant index name.

### Real-ES Integration Testing Rule

**No mocks at the persistence layer.** Per the user's global agent rule, integration tests must hit a real database. The wrapper-under-test calls into a real ephemeral ES via Docker. Mocks are allowed only:

1. In Section 1 (pure functions, zero I/O).
2. In a small number of failure-mode tests (Section 15) that need to inject ES connection errors or 5xx responses where Toxiproxy or `elasticsearch.AsyncTransport` substitution is the only practical path. These tests are explicitly tagged `@pytest.mark.network_fault`.

### pytest Markers

| Marker                          | Meaning                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| `@pytest.mark.unit`             | Pure function, no I/O, sub-millisecond runtime                                       |
| `@pytest.mark.integration`      | Hits ephemeral Docker ES                                                             |
| `@pytest.mark.slow`             | Integration test that takes > 1s (refresh waits, large data, sweep intervals)        |
| `@pytest.mark.property`         | Hypothesis-backed                                                                    |
| `@pytest.mark.network_fault`    | Uses Toxiproxy or transport substitution to simulate ES failures                     |
| `@pytest.mark.perf_smoke`       | Performance smoke test, deferred to V1.5 unless explicitly run                       |
| `@pytest.mark.regression_guard` | Asserts a V1 boundary that must not silently regress (e.g., V1 vs V2 collapse)       |

Inner-loop dev runs `pytest -m "unit"` (sub-second). CI runs `pytest -m "unit or integration or property"`. Pre-deploy runs everything except `perf_smoke` unless gated.

---

## Test Categories

- **Unit tests** — Section 1 (lexical normalization), parts of Section 11 (deterministic ID generation as a pure function), parts of Section 12 (grep-style code-shape assertions).
- **Integration tests (real ES)** — Sections 2 through 10 and Sections 13 through 15. The bulk of the plan.
- **Property-based tests (Hypothesis)** — Section 1 (normalization invariants), Section 10 (shard distribution), Section 11 (concurrency idempotency).
- **Performance / load smoke tests** — Section 13 cursor pagination at scale, Section 10 shard distribution at 10k docs. All `@pytest.mark.perf_smoke`, deferred to V1.5 unless flagged P0/P1 below.

---

## Section 1: Lexical Normalization (`normalize_bin_name`)

These are pure unit tests. No ES needed. `@pytest.mark.unit`.

Spec section validated: V1 lexical normalization (session 2026-04-27 addition #6).

### Single-step tests

| ID         | Asserts                                                                                                            | Setup           | Trigger                                  | Expected                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------ | --------------- | ---------------------------------------- | --------------------------------------------------------------- |
| T-NORM-001 | NFKC normalization collapses compatibility characters (e.g., `"Café"` and `"Café"` produce same output) | None            | `normalize_bin_name(input)`              | Both inputs produce identical output                            |
| T-NORM-002 | NFKC collapses full-width digits/letters to ASCII equivalents                                                      | None            | `normalize_bin_name("Ｈiking")`      | Output equals `normalize_bin_name("Hiking")`                    |
| T-NORM-003 | Casefold lowercases ASCII                                                                                          | None            | `normalize_bin_name("HIKING")`           | Output equals `normalize_bin_name("hiking")`                    |
| T-NORM-004 | Casefold handles German sharp-s (`"Straße"` -> `"strasse"`)                                                   | None            | `normalize_bin_name("Straße")`      | Output starts with `strasse`                                    |
| T-NORM-005 | Casefold handles Turkish dotted-I edge case to spec (Python default casefold semantics)                            | None            | `normalize_bin_name("İstanbul")`    | Output stable, documented behavior                              |
| T-NORM-006 | Leading/trailing whitespace stripped                                                                               | None            | `normalize_bin_name("  hiking  ")`       | Equals `normalize_bin_name("hiking")`                           |
| T-NORM-007 | Punctuation in Unicode category `P*` stripped (em-dash, smart quotes, ellipsis)                                    | None            | `normalize_bin_name("hiking—club")` | Equals `normalize_bin_name("hiking club")`                      |
| T-NORM-008 | Punctuation strip handles ASCII period, comma, hyphen, parentheses                                                 | None            | `normalize_bin_name("(hiking, club).")` | Equals `normalize_bin_name("hiking club")`                      |
| T-NORM-009 | Internal multi-space collapsed to single space before tokenize                                                     | None            | `normalize_bin_name("hiking    club")`   | Equals `normalize_bin_name("hiking club")`                      |
| T-NORM-010 | Tab and newline treated as whitespace                                                                              | None            | `normalize_bin_name("hiking\tclub\n")`  | Equals `normalize_bin_name("hiking club")`                      |
| T-NORM-011 | Snowball stem collapses `"hiking"` and `"hike"` to same token                                                      | None            | Both inputs                              | Equal output                                                    |
| T-NORM-012 | Snowball stem collapses `"running"`, `"runs"`, `"ran"` (where Snowball does)                                       | None            | All three inputs                         | First two equal; `"ran"` documented as separate per Snowball    |
| T-NORM-013 | Snowball stem leaves single-syllable irregulars stable                                                             | None            | `"go"`, `"is"`                           | Output unchanged                                                |
| T-NORM-014 | Tokenize then rejoin uses single ASCII space as separator                                                          | None            | `normalize_bin_name("Hiking Club")`     | Output contains exactly one space, no double-space              |
| T-NORM-015 | Empty string input returns empty string (not None, not error)                                                      | None            | `normalize_bin_name("")`                | `""`                                                            |
| T-NORM-016 | Whitespace-only input returns empty string                                                                         | None            | `normalize_bin_name("   ")`              | `""`                                                            |
| T-NORM-017 | Punctuation-only input returns empty string                                                                        | None            | `normalize_bin_name("!!!---")`           | `""`                                                            |
| T-NORM-018 | Single-character input survives the pipeline                                                                       | None            | `normalize_bin_name("A")`                | `"a"`                                                           |
| T-NORM-019 | Non-Latin script (Cyrillic) survives NFKC + casefold; stem is no-op for non-English                                | None            | `normalize_bin_name("Пиво")` | Output stable; Snowball English stemmer leaves token intact |
| T-NORM-020 | Mixed script input does not crash                                                                                  | None            | `normalize_bin_name("Hiking Пиво")` | Returns a valid string, no exception                  |
| T-NORM-021 | Emoji input: stripped because the algorithm strips both Unicode category P* (Punctuation) and S* (Symbol); emoji are typically `So` (Symbol Other), removed at step 4; e.g., `"HIKERS 🏔"` normalizes to `"hiker"` (the 🏔 is removed) | None            | `normalize_bin_name("HIKERS 🏔")` | Equals `"hiker"` (per spec §3.2 step 4 strip rule)     |
| T-NORM-022 | Numeric tokens preserved (no stemmer mangling of `"5k"`)                                                           | None            | `normalize_bin_name("5K Run")`           | Output contains `"5k"` and stemmed `"run"`                      |
| T-NORM-023 | Apostrophe handled: `"Sam's Friends"` -> `"sam friend"` (apostrophe is Pc/Po, stripped)                            | None            | `normalize_bin_name("Sam's Friends")`    | Equals normalize of `"sam friends"` post-strip                  |
| T-NORM-024 | Hyphenated compound: `"co-workers"` -> token boundary at hyphen                                                    | None            | `normalize_bin_name("co-workers")`       | Equals normalize of `"co workers"`                              |

**T-NORM-EMOJI-A** — Emoji stripped regardless of position. Setup: input strings with emoji at start, middle, end (e.g., `"🌲hike"`, `"hike🌲crew"`, `"hike crew🌲"`). Trigger: `normalize_bin_name`. Expected: all emoji removed; remaining text stemmed normally. Validates: spec §3.2 step 4 — emoji handling.

**T-NORM-SYMBOL-CURRENCY** — Currency symbols (Sc) stripped. Setup: input `"$5 bin"`. Trigger: `normalize_bin_name`. Expected: `$` removed; result is `"5 bin"`. Validates: S* category strip.

**T-NORM-SYMBOL-MATH** — Math symbols (Sm) stripped. Setup: input `"price < 10"`. Trigger: `normalize_bin_name`. Expected: `<` removed; result is `"price 10"`. Validates: S* category strip.

**T-NORM-PROP-NO-S-CATEGORY-SURVIVES** — Hypothesis property test: for any random unicode string, the output of `normalize_bin_name` contains no character whose `unicodedata.category` starts with `"S"`. Validates: S* category strip invariant.

### Property-based invariants (`@pytest.mark.unit @pytest.mark.property`)

| ID         | Asserts (invariant)                                                                                                                          | Hypothesis strategy                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| T-NORM-101 | Idempotence: `normalize(normalize(x)) == normalize(x)` for all `x`                                                                           | `text(alphabet=printable_unicode, min_size=0, max_size=200)`         |
| T-NORM-102 | Determinism: two independent calls with same input return equal output (no hidden state, no randomness)                                      | Same strategy as 101                                                 |
| T-NORM-103 | Whitespace insensitivity: arbitrary insertion of leading/trailing whitespace produces equal output                                            | Compose: arbitrary text + arbitrary whitespace prefix/suffix          |
| T-NORM-104 | Case insensitivity: `normalize(x.upper()) == normalize(x.lower())` for ASCII inputs                                                          | `text(alphabet=ascii_letters + " ")`                                 |
| T-NORM-105 | NFC-vs-NFD invariance: `normalize(unicodedata.normalize("NFC", x)) == normalize(unicodedata.normalize("NFD", x))`                            | `text` filtered to characters with valid NFC/NFD pairs               |
| T-NORM-106 | Output character set restricted to lowercase letters, digits, and single space; never contains punctuation, never contains uppercase         | Same as 101                                                          |
| T-NORM-107 | Output contains no leading or trailing whitespace                                                                                            | Same as 101                                                          |
| T-NORM-108 | Output contains no consecutive double-spaces                                                                                                 | Same as 101                                                          |
| T-NORM-109 | Length non-expansion bound: `len(normalize(x)) <= len(x) + small_constant` (Snowball stems are non-expanding for English; small allowance)   | `text(alphabet=ascii_lowercase + " ", min_size=0, max_size=500)`     |
| T-NORM-110 | Round-trip on already-normalized form: passing the output of `normalize` back in produces the same output (idempotence sub-case, fast check) | Generate random outputs by applying normalize once, then re-feed     |

---

## Section 2: Index Mappings & Schema

`@pytest.mark.integration`. Each test uses the `clean_indices` fixture. Spec sections validated: index mappings for `tribes_contacts`, `tribes_bins`, `tribes_assignments`, `tribes_tribes`, plus `tribes_pending_jobs`.

**Note on vector fields:** V1 has zero `dense_vector` fields. T-MAP tests assert this absence — see T-MAP-V1-VEC-NONE below. V2 vector field tests live in a separate V2 test plan, not this document.

### `tribes_contacts` mapping

| ID        | Asserts                                                                                                       | Setup                                | Trigger                                  | Expected                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------- |
| T-MAP-001 | Index exists with the canonical name `tribes_contacts` after wrapper init                                     | None                                 | Call wrapper bootstrap                   | `client.indices.exists("tribes_contacts")` returns True             |
| T-MAP-002 | `phone_numbers` is a `nested` field with `value`, `value_hash`, `country_code`, `extension` properties         | Boot complete                        | `client.indices.get_mapping`             | Mapping matches spec exactly                                        |
| T-MAP-003 | `email_addresses` is a `nested` field with `value`, `value_hash`, `local_part_normalized`, `domain` props      | Boot complete                        | `client.indices.get_mapping`             | Mapping matches spec exactly                                        |
| T-MAP-004 | `blocking_keys` is a `keyword` array (not `text`)                                                              | Boot complete                        | `client.indices.get_mapping`             | Type is `keyword`                                                   |
| T-MAP-005 | `family_name` and `given_name` are `text` with `keyword` sub-field for sorting                                 | Boot complete                        | Inspect mapping                          | `fields.keyword` present                                            |
| T-MAP-006 | `display_name` uses the project's `tribes_name` analyzer with edge_ngram for prefix search                     | Boot complete                        | Inspect mapping                          | Analyzer name matches; tokenizer/filter chain matches               |
| T-MAP-007 | `canonical_id` is `keyword`, immutable (mapping `index: true`, no analyzer)                                    | Boot complete                        | Inspect mapping                          | Type `keyword`                                                      |
| T-MAP-008 | `merge_audit` is `nested` with `import_idempotency_token`, `incoming_snapshot`, `fields_overwritten`, `merged_by` | Boot complete                        | Inspect mapping                          | All four fields present, types correct                              |
| T-MAP-009 | `import_idempotency_token` is `keyword`                                                                        | Boot complete                        | Inspect mapping                          | Type `keyword`                                                      |
| T-MAP-010 | Custom analyzer `tribes_name` defined at index level (not type level)                                          | Boot complete                        | `client.indices.get_settings`            | `analysis.analyzer.tribes_name` present                             |
| T-MAP-011 | Mapping is idempotent: running boot twice does not error and does not alter the mapping                        | Boot once                            | Boot again                               | Second call no-op; mapping unchanged                                |

### `tribes_bins` mapping

| ID        | Asserts                                                                                                | Setup         | Trigger                | Expected                                            |
| --------- | ------------------------------------------------------------------------------------------------------ | ------------- | ---------------------- | --------------------------------------------------- |
| T-MAP-020 | Index `tribes_bins` exists                                                                             | None          | Wrapper boot           | Exists                                              |
| T-MAP-021 | `name` is `text` with `keyword` sub-field                                                              | Boot complete | Inspect mapping        | Both present                                        |
| T-MAP-022 | `normalized_name` is `keyword` (NOT `text`); enables exact-match aggregations                          | Boot complete | Inspect mapping        | Type `keyword`                                      |
| T-MAP-023 | `owner_user_id` is `keyword`                                                                           | Boot complete | Inspect mapping        | Type `keyword`                                      |
| T-MAP-024 | `assignment_count` is `long`                                                                           | Boot complete | Inspect mapping        | Type `long`                                         |
| T-MAP-025 | `color_hex` is `keyword`                                                                               | Boot complete | Inspect mapping        | Type `keyword`                                      |
| T-MAP-026 | `domain` is `keyword` (controlled vocabulary)                                                          | Boot complete | Inspect mapping        | Type `keyword`                                      |
| T-MAP-027 | Number of primary shards equals 1 (per spec §3.2; bin count per owner is naturally small)              | Boot complete | `get_settings`         | `index.number_of_shards == "1"`                     |

### `tribes_assignments` mapping

| ID        | Asserts                                                                                                                | Setup         | Trigger         | Expected                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------------- | ------------- | --------------- | ------------------------------------------------- |
| T-MAP-040 | Index `tribes_assignments` exists                                                                                      | None          | Boot            | Exists                                            |
| T-MAP-041 | `is_active` is `boolean`                                                                                               | Boot complete | Inspect mapping | Boolean                                           |
| T-MAP-042 | `affinity_weight` is `float` (or `half_float`); document the choice                                                    | Boot complete | Inspect mapping | Numeric type matches spec                         |
| T-MAP-043 | `flick_velocity` is `float`                                                                                            | Boot complete | Inspect mapping | Numeric type matches spec                         |
| T-MAP-044 | Denormalized fields `bin_name`, `bin_domain`, `bin_color_hex` present and are `keyword`                                | Boot complete | Inspect mapping | All three present, all `keyword`                  |
| T-MAP-045 | `owner_user_id`, `contact_id`, `bin_id` are `keyword`                                                                  | Boot complete | Inspect mapping | All three are keyword                             |
| T-MAP-046 | Number of primary shards equals 3 (Section 10 distribution test depends on this)                                       | Boot complete | `get_settings`  | `index.number_of_shards == "3"`                   |

### `tribes_tribes` mapping

| ID        | Asserts                                                                          | Setup         | Trigger         | Expected                                       |
| --------- | -------------------------------------------------------------------------------- | ------------- | --------------- | ---------------------------------------------- |
| T-MAP-060 | Index `tribes_tribes` exists                                                     | None          | Boot            | Exists                                         |
| T-MAP-061 | `tribe_type` is `keyword` (values: `"static"`, `"dynamic"`)                      | Boot complete | Inspect mapping | Type `keyword`                                 |
| T-MAP-062 | `member_contact_ids` is `keyword` array                                             | Boot complete | Inspect mapping | Array of keyword                               |
| T-MAP-063 | `query_bin_ids` is `keyword` array (used by dynamic tribes)                      | Boot complete | Inspect mapping | Array of keyword                               |
| T-MAP-064 | `query_operator` is `keyword` (values: `"OR"`, `"AND"`)                          | Boot complete | Inspect mapping | Type `keyword`                                 |
| T-MAP-065 | `query_city_filter` and `query_domain_filter` are `keyword` arrays               | Boot complete | Inspect mapping | Both arrays                                    |
| T-MAP-066 | `member_count_cached` is `long`                                                  | Boot complete | Inspect mapping | Type `long`                                    |

### `tribes_pending_jobs` mapping (NEW)

| ID        | Asserts                                                                                                          | Setup         | Trigger         | Expected                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------- | ------------- | --------------- | --------------------------------------------------------- |
| T-MAP-080 | Index `tribes_pending_jobs` exists                                                                               | None          | Boot            | Exists                                                    |
| T-MAP-081 | `job_id` is the document `_id`; not stored as a separate field                                                   | Boot complete | Inspect mapping | No `job_id` property; `_id` policy in spec                |
| T-MAP-082 | `op_type` is `keyword`                                                                                           | Boot complete | Inspect mapping | Type `keyword`                                            |
| T-MAP-083 | `primary_id` is `keyword`                                                                                        | Boot complete | Inspect mapping | Type `keyword`                                            |
| T-MAP-084 | `payload` is `object` with `enabled: false` (opaque blob, not searched)                                          | Boot complete | Inspect mapping | `enabled: false`                                          |
| T-MAP-085 | `status` is `keyword` (values: `"pending"`, `"succeeded"`, `"failed_permanent"`)                                 | Boot complete | Inspect mapping | Type `keyword`                                            |
| T-MAP-086 | `retry_count` is `integer`                                                                                       | Boot complete | Inspect mapping | Type `integer`                                            |
| T-MAP-087 | `created_at`, `last_attempt_at`, `next_attempt_at` are `date` with strict ISO-8601                               | Boot complete | Inspect mapping | All three are dates                                       |
| T-MAP-088 | `last_error` is `text` (free-form ES error message)                                                              | Boot complete | Inspect mapping | Type `text`                                               |

### V1 vector-field absence

**T-MAP-V1-VEC-NONE** — Inspect every V1 index mapping (`tribes_contacts`, `tribes_bins`, `tribes_assignments`, `tribes_tribes`, `tribes_pending_jobs`) and assert that no field has type `dense_vector`. Setup: index creation via repository setup. Trigger: `GET /<index>/_mapping`. Expected: traverse the mapping tree and assert no leaf has `"type": "dense_vector"`. Validates: V1 Vector Field Inventory (spec §3).

### Mapping migration smoke

| ID        | Asserts                                                                                                  | Setup                              | Trigger                          | Expected                                      |
| --------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------- | --------------------------------------------- |
| T-MAP-100 | Applying canonical mappings to a fresh empty cluster succeeds                                            | Empty ES                           | Wrapper boot                     | All five indices present                      |
| T-MAP-101 | Re-applying mappings is a no-op (no exception, no `IllegalArgumentException`)                            | Already-booted cluster             | Wrapper boot a second time       | No exception                                  |
| T-MAP-102 | Adding a new field to an existing index via the wrapper's mapping-update path succeeds                   | Booted cluster                     | Wrapper applies updated mapping  | New field present                             |
| T-MAP-103 | Attempt to change an existing field's type raises `MappingMigrationConflictError` (typed exception)       | Booted cluster                     | Wrapper applies incompatible map | Typed exception, no silent index corruption   |

---

## Section 3: ContactRepository

`@pytest.mark.integration`, with sub-suites `@pytest.mark.slow` for tests that wait on refresh. Spec sections validated: identity resolution, blocking keys, probabilistic scoring, field-level merge rules, idempotency token, version pin, merge_audit.

### Basic CRUD

| ID            | Asserts                                                                            | Setup           | Trigger                       | Expected                                          |
| ------------- | ---------------------------------------------------------------------------------- | --------------- | ----------------------------- | ------------------------------------------------- |
| T-CONTACT-001 | `create()` writes a doc and returns a non-empty `canonical_id`                     | Clean indices   | `repo.create({...})`          | Returned `canonical_id` is a non-empty string     |
| T-CONTACT-002 | `get_by_id()` returns the doc just created                                         | One doc created | `repo.get_by_id(canonical_id)`| Doc fields equal the input                        |
| T-CONTACT-003 | `get_by_id()` on missing id returns `None`, not raises                             | Clean indices   | `repo.get_by_id("nope")`      | `None`                                            |
| T-CONTACT-004 | `delete()` hard-deletes (cascade is service-layer, see Section 8)                  | One doc created | `repo.delete(canonical_id)`   | Subsequent `get_by_id` returns `None`             |
| T-CONTACT-005 | `count_for_owner(owner_user_id)` returns correct count after writes                | 5 docs created  | `repo.count_for_owner(owner)` | Returns 5                                         |

### Blocking key generation

Spec: `phone:{e164}`, `phone_last7:{last7}`, `email:{addr}`, `email_local:{local}`, `name:{soundex(family)}:{initial}`.

| ID                  | Asserts                                                                                       | Setup | Trigger                                                       | Expected                                                |
| ------------------- | --------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------- | ------------------------------------------------------- |
| T-CONTACT-IDRES-001 | `phone:{e164}` block key generated via `phonenumbers` (libphonenumber Python port), parsed with `region="US"`; e.g., `"(555) 123-4567"` produces `+15551234567` | None  | `repo._compute_blocking_keys({"phone_numbers": [{"value": "(555) 123-4567"}]})` | Set contains `"phone:+15551234567"`                     |
| T-CONTACT-IDRES-002 | `phone_last7:{last7}` block key generated from the last 7 digits                              | None  | Same                                                          | Set contains `"phone_last7:1234567"`                    |
| T-CONTACT-IDRES-003 | Multiple phones produce one phone block key per number                                        | None  | Two phones                                                    | Set contains both `phone:` keys                         |
| T-CONTACT-IDRES-004 | Phone with an extension is normalized to E.164 base via `phonenumbers` parsed with `region="US"`; the `phone:{e164}` blocking key omits the extension (e.g., `"(555) 123-4567 ext 123"` produces `+15551234567`) | None  | Phone with `extension="123"`                                  | E.164 key omits extension                               |
| T-CONTACT-IDRES-005 | `email:{addr}` block key uses lowercased full address                                         | None  | `compute_blocking_keys({"email_addresses": ["A@Example.COM"]})` | Contains `"email:a@example.com"`                        |
| T-CONTACT-IDRES-006 | `email_local:{local}` uses local part only                                                    | None  | Same                                                          | Contains `"email_local:a"`                              |
| T-CONTACT-IDRES-007 | `name:{soundex(family)}:{initial}` uses American Soundex via `jellyfish.soundex` (4-char output, library pin `jellyfish>=1.0.0,<2.0.0`); `Smith` → `S530`, `Smyth` → `S530` (same code) | None  | `{"family_name": "Smith", "given_name": "John"}`              | Contains `"name:S530:J"`                                |
| T-CONTACT-IDRES-008 | Missing family name produces no `name:` key (don't generate a degenerate key)                 | None  | `{"given_name": "John"}`                                      | No `name:` prefix in set                                |
| T-CONTACT-IDRES-009 | Missing given name produces no `name:` key                                                    | None  | `{"family_name": "Smith"}`                                    | No `name:` prefix in set                                |
| T-CONTACT-IDRES-010 | Empty input produces empty set                                                                | None  | `compute_blocking_keys({})`                                   | Empty set                                               |

**T-CONTACT-IDRES-PHONE-INVALID-A** — Invalid phone string falls through to raw-digits last7. Setup: contact import with `phone="abc-1234567"`. Trigger: `import_contact` (non-strict). Expected: contact document persisted with `phone.e164=null`, `phone.raw="abc-1234567"`, blocking_keys contains `"phone_last7:1234567"` and does NOT contain any `"phone:{e164}"` entry. Validates: spec §7 — Phone E.164 invalid-number contract.

**T-CONTACT-IDRES-PHONE-INVALID-B** — Invalid phone with fewer than 7 digits generates no phone blocking key. Setup: contact import with `phone="abc"`. Trigger: `import_contact`. Expected: blocking_keys contains no phone-derived entry. Validates: spec §7 — Phone E.164 invalid-number contract.

**T-CONTACT-IDRES-PHONE-STRICT** — Strict mode raises `InvalidPhoneError`. Setup: contact import with `phone="garbage"`, `strict=True`. Trigger: `import_contact(..., strict=True)`. Expected: raises `InvalidPhoneError`; no document persisted. Validates: spec §7 — strict mode contract.

**T-CONTACT-IDRES-SOUNDEX-COLLISION** — Soundex collision does not cause false-positive merge. Setup: two contacts with surnames that produce identical Soundex codes (e.g., `Nguyen` and a controlled second surname collapsing to `N250`), no overlapping phone or email. Trigger: import second contact. Expected: composite similarity score for the candidate match is at most 0.3 (Soundex weight) + initial-match weight; well below the 0.85 merge threshold; second contact persisted as a separate document. Validates: spec §7 — Soundex known-limitation contract.

### Probabilistic scoring

Spec: phone exact = 1.0, email exact = 0.95, phone last7 = 0.6, email local = 0.4, soundex name = 0.3, threshold = 0.85.

| ID                  | Asserts                                                                                                                  | Setup                                                | Trigger                                  | Expected                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ---------------------------------------- | ----------------------------------------- |
| T-CONTACT-IDRES-020 | Phone exact match scores 1.0                                                                                             | Two contacts share full E.164                        | `repo._score(candidate, incoming)`        | Score == 1.0                              |
| T-CONTACT-IDRES-021 | Email exact match scores 0.95                                                                                            | Two contacts share full email                        | Same                                     | Score == 0.95                             |
| T-CONTACT-IDRES-022 | Phone last7 match scores 0.6                                                                                             | Two contacts share last 7 only                       | Same                                     | Score == 0.6                              |
| T-CONTACT-IDRES-023 | Email local match scores 0.4                                                                                             | Two contacts share local part only                   | Same                                     | Score == 0.4                              |
| T-CONTACT-IDRES-024 | Soundex name match scores 0.3                                                                                            | Two contacts share family soundex + given initial    | Same                                     | Score == 0.3                              |
| T-CONTACT-IDRES-025 | Multiple matches sum (phone last7 0.6 + soundex 0.3 = 0.9, above threshold)                                              | Constructed pair                                     | Same                                     | Score == 0.9, above threshold             |
| T-CONTACT-IDRES-026 | Score below threshold (0.85) does NOT trigger merge                                                                      | Pair scoring 0.4                                     | `repo.import_contact(incoming)`           | New contact created, no merge_audit       |
| T-CONTACT-IDRES-027 | Score at threshold (0.85) triggers merge (boundary inclusive)                                                            | Pair scoring exactly 0.85                            | `repo.import_contact(incoming)`           | Merge into existing                       |
| T-CONTACT-IDRES-028 | Score above threshold triggers merge                                                                                     | Pair scoring 1.0                                     | `repo.import_contact(incoming)`           | Merge into existing                       |
| T-CONTACT-IDRES-029 | Multiple candidates above threshold: highest score wins; warning logged                                                  | 3 candidates: 0.86, 0.9, 0.95                        | `repo.import_contact(incoming)`           | Merged into 0.95 candidate; warning log   |
| T-CONTACT-IDRES-030 | Candidate fetch returns empty: new contact created (covered also as failure mode in Section 15)                          | Empty candidate set                                  | `repo.import_contact(incoming)`           | New contact, no merge_audit               |

### Field-level merge rules (CONTACT-MERGE)

Spec: UNION rules on `blocking_keys`, nested arrays merged by `value_hash`, incoming-wins-if-non-empty for names, immutable `canonical_id`, append-only `merge_audit`.

| ID                  | Asserts                                                                                                              | Setup                                                                                  | Trigger                                                       | Expected                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| T-CONTACT-MERGE-001 | `blocking_keys` UNION: existing has {a, b}, incoming has {b, c}, result is {a, b, c}                                  | Existing contact written; incoming with overlapping keys                               | `repo.import_contact(incoming)`                                | Doc has all three keys; no duplicates                                                          |
| T-CONTACT-MERGE-002 | `phone_numbers` nested UNION by `value_hash`: same hash dedups                                                        | Existing has phone hash X; incoming has phone hash X with different `country_code`     | `repo.import_contact(incoming)`                                | One nested entry remains (existing wins on hash collision per spec); test the documented rule  |
| T-CONTACT-MERGE-003 | `phone_numbers` UNION: distinct hashes both kept                                                                     | Existing has hash X; incoming has hash Y                                               | `repo.import_contact(incoming)`                                | Two nested entries, both present                                                               |
| T-CONTACT-MERGE-004 | `email_addresses` nested UNION by `value_hash`                                                                       | As above for emails                                                                    | Same                                                          | Same as 002 / 003 for emails                                                                   |
| T-CONTACT-MERGE-005 | `family_name` incoming-wins-if-non-empty: existing has `"Smith"`, incoming has `"Jones"`                              | Existing written                                                                       | `repo.import_contact({"family_name": "Jones", ...})`           | Result has `"Jones"`                                                                           |
| T-CONTACT-MERGE-006 | `family_name` incoming-empty-loses: existing `"Smith"`, incoming `""` or missing                                      | Existing written                                                                       | `repo.import_contact({...no family_name...})`                  | Result still has `"Smith"`                                                                     |
| T-CONTACT-MERGE-007 | `given_name` follows same incoming-wins-if-non-empty rule                                                            | As above for given                                                                     | Same                                                          | Same                                                                                           |
| T-CONTACT-MERGE-008 | `display_name` follows same incoming-wins-if-non-empty rule                                                          | As above for display                                                                   | Same                                                          | Same                                                                                           |
| T-CONTACT-MERGE-009 | `canonical_id` is immutable: merge into existing must NOT overwrite the existing `canonical_id`                       | Existing has `canonical_id="C-123"`                                                    | `repo.import_contact(incoming)` triggers merge                 | Result `canonical_id == "C-123"`; incoming's tentative id discarded                            |
| T-CONTACT-MERGE-010 | `merge_audit` append-only: each merge adds one entry, never replaces                                                  | Existing has 2 audit entries                                                           | Trigger 1 more merge                                          | Audit length is 3                                                                              |
| T-CONTACT-MERGE-011 | `merge_audit` entry contains `import_idempotency_token`, `incoming_snapshot`, `fields_overwritten`, `merged_by`       | Trigger one merge                                                                      | Inspect last audit entry                                       | All 4 fields present, types correct                                                            |
| T-CONTACT-MERGE-012 | `merge_audit` `incoming_snapshot` records the discarded canonical_id (incoming's tentative)                          | Trigger merge                                                                          | Inspect last audit entry                                       | `incoming_snapshot.canonical_id` equals incoming's tentative id                                |
| T-CONTACT-MERGE-013 | `if_seq_no`/`if_primary_term` version pin: between read and write, another writer mutates → wrapper raises typed conflict and surfaces it | Concurrent: read existing, mutate it from another client, then merge call            | Merge call                                                    | `VersionConflictError` raised; caller can retry                                                |
| T-CONTACT-MERGE-014 | After version conflict, retrying with fresh read succeeds                                                            | Trigger 013                                                                            | Catch, re-read, retry                                          | Merge succeeds; one final doc                                                                   |
| T-CONTACT-MERGE-015 | Refresh contract: merge update path uses `refresh="wait_for"` so a follow-up read sees the change                     | Existing contact; trigger merge                                                        | Immediately `repo.get_by_id`                                   | Merged fields visible; no `client.indices.refresh()` call needed (covered also in Section 9)   |

### Import idempotency token

| ID                  | Asserts                                                                                                          | Setup                                          | Trigger                                                              | Expected                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| T-CONTACT-MERGE-020 | Same `import_idempotency_token` submitted twice produces exactly one merge_audit entry                           | None                                           | Call `import_contact(payload, token="T-1")` twice                     | Audit length == 1                                                              |
| T-CONTACT-MERGE-021 | Same token but different payload still treated as duplicate (token-as-dedup-key, not payload-hash)                | None                                           | Two calls, same token, different name                                 | Audit length == 1; second call returns the result of the first (no overwrite) |
| T-CONTACT-MERGE-022 | Different tokens with same payload produce two audit entries (or two contacts depending on identity resolution)  | None                                           | Two calls, different tokens, same payload                            | Either two distinct contacts or one with two audit entries (per spec)         |
| T-CONTACT-MERGE-023 | Token is per-import-source-scoped (token only collides within the same source namespace)                         | None                                           | Two calls, same token, different `source` field                       | Two contacts (no false-collision across sources)                               |

---

## Section 4: BinRepository

`@pytest.mark.integration`. Spec sections validated: deterministic `_id`, post-write verify, normalized_name derivation, rename, assignment_count Painless script.

### Deterministic `_id` Safeguard A

`_id = sha256(owner_user_id + "#" + slug(name))[:32]`. Same name from same owner produces same `_id`.

| ID                    | Asserts                                                                                                                            | Setup                                                       | Trigger                                                            | Expected                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| T-BIN-CONFLICT-A-001  | Same `(owner, name)` produces same `_id` across two independent calls                                                              | None                                                        | `repo._compute_id(owner, name)` twice                              | Equal strings                                                           |
| T-BIN-CONFLICT-A-002  | Different `name` produces different `_id`                                                                                          | None                                                        | Compute for `"Hiking"` and `"Walking"`                             | Distinct                                                                |
| T-BIN-CONFLICT-A-003  | Different `owner` with same `name` produces different `_id` (owner is namespaced)                                                  | None                                                        | Compute for owners A and B with `"Hiking"`                         | Distinct                                                                |
| T-BIN-CONFLICT-A-004  | `_id` is exactly 32 hex characters                                                                                                 | None                                                        | Inspect output                                                     | `len == 32`, all hex                                                    |
| T-BIN-CONFLICT-A-005  | `slug(name)` strips case and whitespace before hashing (`"Hiking"` and `"hiking"` collide)                                          | None                                                        | Compute for `"Hiking"` and `"hiking"`                              | Equal                                                                   |
| T-BIN-CONFLICT-A-006  | `slug(name)` strips trailing/leading whitespace before hashing                                                                     | None                                                        | Compute for `"Hiking"` and `"  Hiking  "`                          | Equal                                                                   |
| T-BIN-CONFLICT-A-007  | First `create(owner, "Hiking")` succeeds and writes a doc                                                                          | Clean indices                                               | `repo.create({...})`                                                | Doc exists; returned `_id` matches deterministic id                     |
| T-BIN-CONFLICT-A-008  | Second `create(owner, "Hiking")` is treated as upsert (no duplicate doc)                                                           | Bin already exists                                          | Second `create`                                                    | Still one doc; existing fields preserved or updated per upsert semantics |
| T-BIN-CONFLICT-A-009  | Two concurrent `create(owner, "Hiking")` resolve to one doc, never two                                                             | Clean indices                                               | `asyncio.gather` 50 concurrent creates                              | `count == 1`                                                            |
| T-BIN-CONFLICT-A-010  | Concurrent creates with surface-level different name strings that slug-collapse to the same slug also resolve to one doc           | Clean indices                                               | `gather`: `"Hiking"`, `"hiking"`, `"  Hiking "`                    | `count == 1`                                                            |

### Post-write Safeguard B

After write, fetch with `wait_for` refresh. If multiple docs exist, lowest `_id` wins; others hard-deleted; loser receives `BinNameConflictError`.

| ID                    | Asserts                                                                                                                                    | Setup                                                                  | Trigger                                                  | Expected                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| T-BIN-CONFLICT-B-001  | After `create()`, wrapper issues a follow-up `search` with `refresh="wait_for"` semantics to verify single-result                          | Clean indices                                                          | `repo.create()`                                          | Trace shows search call after write; `wait_for` used (covered also Section 9)                         |
| T-BIN-CONFLICT-B-002  | Single-doc post-write check passes; method returns normally                                                                                | Clean indices                                                          | `repo.create()`                                          | No exception, doc accessible                                                                          |
| T-BIN-CONFLICT-B-003  | Two-doc post-write check (synthetic: directly insert two docs with different `_id`s but same normalized_name+owner) → resolution           | Inject two docs                                                        | Trigger a `repo.create()` whose verify catches the pair  | Lower `_id` wins (kept); higher `_id` hard-deleted; second `create` call returns `BinNameConflictError` |
| T-BIN-CONFLICT-B-004  | `BinNameConflictError` carries the surviving `bin_id` so caller can re-fetch                                                               | As above                                                                | Catch the exception                                       | `error.surviving_bin_id == lower_id`                                                                  |
| T-BIN-CONFLICT-B-005  | Resolution is deterministic across reruns (same survivor each time given same `_id` set)                                                   | Run resolution 10x                                                      | Same setup                                               | Same survivor                                                                                          |
| T-BIN-CONFLICT-B-006  | Hard-deleted loser is gone from index after resolution                                                                                     | Resolution complete                                                     | `repo.get_by_id(loser_id)`                               | `None`                                                                                                |
| T-BIN-CONFLICT-B-007  | Concurrent N=10 `create(owner, "Hiking")` from 10 clients: exactly one survives, all losers receive `BinNameConflictError`                 | Clean indices                                                           | `asyncio.gather` 10 creates                              | One success, nine errors                                                                              |
| T-BIN-CONFLICT-B-008  | The successful return matches the survivor (caller doesn't get a stale "I won" with a deleted `_id`)                                       | Run T-BIN-CONFLICT-B-007                                               | Inspect winner's returned `bin_id`                        | Equals `survivor_id` in ES                                                                            |

### `normalized_name` derivation

| ID         | Asserts                                                                                              | Setup                              | Trigger                          | Expected                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------- | ------------------------------------------------------------------------- |
| T-BIN-001  | On `create`, `normalized_name` is set to `normalize_bin_name(name)`                                  | None                               | `repo.create({"name": "Hiking"})` | Stored doc has `normalized_name == "hike"` (Snowball stem)                |
| T-BIN-002  | On `update` with new `name`, `normalized_name` is recomputed                                         | Existing bin                       | `repo.update(id, {"name": "Walking"})` | Doc has new `normalized_name == "walk"`                                  |
| T-BIN-003  | On `update` without `name` change, `normalized_name` is left untouched                               | Existing bin                       | `repo.update(id, {"color_hex": "#FFF"})` | `normalized_name` unchanged                                              |
| T-BIN-004  | `normalized_name` matches output of standalone `normalize_bin_name` for same input (no drift)        | None                               | Compare write vs pure call        | Equal                                                                     |
| T-BIN-005  | `list_for_user` returns bins ordered by `normalized_name` ASC by default                             | 5 bins                             | `repo.list_for_user(owner)`       | Sorted alphabetically by `normalized_name`                                |
| T-BIN-006  | `list_for_user` is shard-stable: same query returns same order across runs (deterministic tiebreak)   | 5 bins                             | Run 10 times                     | Identical order each run                                                  |

### Rename mechanics

| ID         | Asserts                                                                                                | Setup                       | Trigger                                          | Expected                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| T-BIN-020  | Rename creates a new doc with new deterministic `_id`                                                  | Existing bin id `X`         | `repo.rename(id=X, new_name="Trekking")`         | New doc with `_id = sha256(owner#"trekking")[:32]` exists                        |
| T-BIN-021  | Rename hard-deletes the old doc                                                                        | Existing bin id `X`         | `repo.rename(id=X, new_name="Trekking")`         | `repo.get_by_id(X) is None`                                                      |
| T-BIN-022  | Rename copies over `assignment_count`, `color_hex`, `domain`, `created_at`                             | Existing bin with all fields| Rename                                            | New doc preserves all fields except name + normalized_name + new `_id`           |
| T-BIN-023  | Rename triggers Safeguard B verify (in case the new name collides with an existing bin)                | Existing bin `X`; existing bin `Y` named `"Trekking"` | Rename `X` -> `"Trekking"`           | `BinNameConflictError`; both `X` and the post-write loser correctly resolved     |
| T-BIN-024  | Rename is NOT atomic (write then delete); `BinRepository.update(bin_id, name="NewName")` queues a pending job document with `op_type="reconcile_bin_name"`, `primary_id=bin_id`, `target_index="tribes_assignments"`, `status="pending"` | Existing bin with assignments | `BinRepository.update(bin_id, name="NewName")` | `tribes_pending_jobs` contains a doc with the asserted fields; assignments still show old `bin_name` until the 5-minute sweep runs |

### `assignment_count` Painless script

| ID         | Asserts                                                                                                          | Setup                                                  | Trigger                                                          | Expected                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| T-BIN-040  | `_increment_assignment_count(bin_id, +1)` increments the counter atomically via Painless `update`                | One bin with count 0                                   | Call increment once                                              | Doc has `assignment_count == 1`                                   |
| T-BIN-041  | `_increment_assignment_count(bin_id, -1)` decrements                                                             | One bin with count 5                                   | Call decrement                                                    | Doc has `assignment_count == 4`                                   |
| T-BIN-042  | Decrement on count == 0 does NOT go negative (Painless clamps)                                                   | One bin with count 0                                   | Call decrement                                                    | Doc has `assignment_count == 0`                                   |
| T-BIN-043  | `retry_on_conflict=3` is set on the `update` call (avoids 409 under contention)                                  | None                                                   | Inspect call                                                      | Param present                                                     |
| T-BIN-044  | Concurrent N=20 increments produce final count == N (no lost updates thanks to retry_on_conflict)                | One bin with count 0                                   | `gather` 20 increments                                            | Final count == 20                                                  |
| T-BIN-045  | Concurrent mix of 10 increments + 5 decrements ends at +5                                                        | One bin with count 0                                   | `gather` mixed                                                    | Final count == 5                                                   |
| T-BIN-046  | `assignment_count` is documented-best-effort (drift tolerated; covered explicitly Section 12)                    | -                                                      | -                                                                | -                                                                  |

---

## Section 5: AssignmentRepository

`@pytest.mark.integration`. Spec sections validated: deterministic `_id`, soft delete, resurrection rule, get_by_bins OR semantics, denormalized fields.

### Deterministic `_id`

`_id = f"{owner_user_id}#{contact_id}#{bin_id}"`. Same triple → same `_id`.

| ID            | Asserts                                                                                                | Setup                          | Trigger                                                | Expected                                              |
| ------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------ | ----------------------------------------------------- |
| T-ASSIGN-001  | Same `(owner, contact, bin)` triple yields same `_id`                                                  | None                           | `repo._compute_id(o, c, b)` twice                      | Equal                                                 |
| T-ASSIGN-002  | Any field change yields different `_id`                                                                | None                           | Vary owner, contact, bin                               | All distinct                                          |
| T-ASSIGN-003  | First `assign(triple)` writes a doc                                                                    | Clean                          | `repo.assign(o, c, b)`                                 | One doc, `is_active=True`                             |
| T-ASSIGN-004  | Second `assign(triple)` is idempotent upsert (no duplicate)                                            | Doc exists                     | Second call                                            | Still one doc                                         |
| T-ASSIGN-005  | `assign` increments the bin's `assignment_count` exactly once per new doc                              | Bin with count 0; assign       | One assign                                              | Bin count == 1                                        |
| T-ASSIGN-006  | Re-assigning an active doc does NOT re-increment the bin count                                         | Bin count 1, doc active        | Second assign                                          | Bin count still 1                                     |

### Soft delete (unassign)

| ID            | Asserts                                                                                                            | Setup            | Trigger                              | Expected                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------- | ------------------------------------ | ------------------------------------------------- |
| T-ASSIGN-020  | `unassign(o, c, b)` sets `is_active=False` and does NOT delete the doc                                           | Active doc       | `repo.unassign(o, c, b)`           | Doc still in index; `is_active=False`             |
| T-ASSIGN-021  | `unassign` decrements bin `assignment_count`                                                                     | Active doc, count 1 | `repo.unassign(...)`               | Bin count == 0                                    |
| T-ASSIGN-022  | Unassign on already-inactive doc is no-op (no double decrement)                                                  | Inactive doc     | Second unassign                    | Bin count unchanged                               |
| T-ASSIGN-023  | Unassign preserves `affinity_weight`, `flick_velocity`, `created_at`, `last_assigned_at` for history             | Active doc       | Unassign                            | All fields preserved                              |

### Resurrection rule (NEW spec session 2026-04-27 #7)

Caller must explicitly set `is_active=True`; wrapper performs no implicit resurrection.

| ID            | Asserts                                                                                                                                | Setup                                       | Trigger                                                                  | Expected                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| T-ASSIGN-040  | Calling `assign(o, c, b)` on an inactive doc does NOT silently set `is_active=True`                                                    | Inactive doc                                | `repo.assign(o, c, b)` without explicit is_active                         | Doc remains `is_active=False`; bin count unchanged                                                 |
| T-ASSIGN-041  | Calling `update(o, c, b, {"is_active": True})` on an inactive doc DOES resurrect (caller-explicit)                                      | Inactive doc                                | `repo.update(o, c, b, {"is_active": True})`                              | Doc becomes `is_active=True`; bin count incremented                                                |
| T-ASSIGN-042  | Update payload without `is_active` field on an active doc leaves `is_active` alone                                                     | Active doc                                  | `repo.update(o, c, b, {"affinity_weight": 0.5})`                          | `is_active` unchanged                                                                              |
| T-ASSIGN-043  | Update payload `is_active=False` on an active doc soft-deletes (consistent with `unassign`)                                          | Active doc                                  | `repo.update(o, c, b, {"is_active": False})`                              | Doc inactive; bin count decremented                                                                |
| T-ASSIGN-044  | Wrapper public API documents this rule: there is NO `assign_or_resurrect` convenience method (regression guard)                        | -                                           | Source code grep                                                          | No such method name in `assignment.py`                                                             |

### `get_by_bins` OR semantics

| ID            | Asserts                                                                                                  | Setup                                 | Trigger                                | Expected                                              |
| ------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| T-ASSIGN-060  | `get_by_bins(owner, [b1, b2])` returns assignments in b1 OR b2                                           | Contacts in b1, b2, b3                | `repo.get_by_bins(o, [b1, b2])`        | Returns union (no docs from b3)                       |
| T-ASSIGN-061  | `get_by_bins(owner, [b1])` returns only b1                                                               | Same                                  | `repo.get_by_bins(o, [b1])`             | Only b1 contacts                                      |
| T-ASSIGN-062  | `get_by_bins(owner, [])` returns empty list (or raises ValueError per spec)                              | Same                                  | `repo.get_by_bins(o, [])`              | Per documented contract                                |
| T-ASSIGN-063  | `get_by_bins` filters out `is_active=False` docs by default                                              | Some docs inactive                     | `repo.get_by_bins(o, [b1])`            | Only active                                            |
| T-ASSIGN-064  | `get_by_bins(..., include_inactive=True)` returns both                                                   | Same                                  | With flag                              | Both                                                  |
| T-ASSIGN-065  | AND semantics (intersection) is NOT performed in the wrapper (regression guard)                          | -                                     | Source code grep                       | No `intersection` method on AssignmentRepository       |

### Denormalized field writes

| ID            | Asserts                                                                                                                  | Setup                          | Trigger                                  | Expected                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------ |
| T-ASSIGN-080  | On `assign`, wrapper denormalizes `bin_name`, `bin_domain`, `bin_color_hex` from the bin doc into the assignment          | Bin with set fields            | `repo.assign(o, c, b)`                    | Assignment doc has all three denormalized fields equal to the bin's values    |
| T-ASSIGN-081  | When the bin is renamed, OLD assignment denormalized `bin_name` is stale until cascade refresh (V1 explicit drift accept) | Assignment exists; rename bin  | Inspect assignment immediately            | `bin_name` still old value; documented as "drift accepted, cascade later"      |
| T-ASSIGN-082  | `affinity_weight` and `flick_velocity` are written as provided (no clamping in wrapper; service layer clamps)            | None                           | `repo.assign(o, c, b, weight=2.0)`        | Doc has `affinity_weight == 2.0` (wrapper does not clamp)                      |

---

## Section 6: TribeRepository

`@pytest.mark.integration`. Spec sections validated: static vs dynamic tribes, member_count_cached, query fields.

| ID         | Asserts                                                                                                  | Setup                                              | Trigger                                                              | Expected                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| T-TRIBE-001| `create_static(owner, name, member_contact_ids)` writes a doc with `tribe_type="static"`                    | None                                               | `repo.create_static(o, "Hiking Buddies", [u1, u2])`                  | Doc exists, type correct, members stored                                            |
| T-TRIBE-002| Static tribe `member_contact_ids` is exact (no implicit dedup other than set semantics on write)            | None                                               | Create with duplicates                                                | Dedup applied (set), one entry per user                                             |
| T-TRIBE-003| `update_static_members(tribe_id, add=[...], remove=[...])` mutates correctly                             | Existing static tribe                              | Add and remove                                                       | Final list matches expected                                                          |
| T-TRIBE-004| `member_count_cached` updated on every static-member mutation                                            | Existing static tribe with 3 members               | Add 2                                                                | `member_count_cached == 5`                                                           |
| T-TRIBE-010| `create_dynamic(owner, name, query_bin_ids, query_operator, query_city_filter, query_domain_filter)` writes | None                                            | Create with all four query fields                                     | Doc has all fields; `tribe_type="dynamic"`                                          |
| T-TRIBE-011| Dynamic tribe `query_operator="OR"` resolves via OR over `query_bin_ids`                                 | Dynamic tribe with bins [b1, b2]; assignments mixed | `repo.resolve_dynamic_members(tribe_id)`                              | Result is union of contacts in b1 or b2                                            |
| T-TRIBE-012| Dynamic tribe `query_operator="AND"` resolves via AND (intersection at service layer; wrapper exposes the building blocks) | Same                                               | Same                                                                 | Result is intersection                                                               |
| T-TRIBE-013| `query_city_filter` narrows results to contacts whose city is in the list                                | Some contacts in city A, some B                    | Resolve dynamic                                                       | Only city-A contacts returned                                                        |
| T-TRIBE-014| `query_domain_filter` narrows by bin `domain`                                                            | Bins of various domains                             | Resolve dynamic                                                       | Only matching domains                                                                |
| T-TRIBE-015| `member_count_cached` updated on `resolve_dynamic_members` call                                          | Dynamic tribe                                       | Resolve                                                              | Doc has updated count after resolve                                                 |
| T-TRIBE-016| `preview_query(query_bin_ids, ...)` does NOT write to the tribe doc (read-only preview)                 | Existing tribe                                      | `repo.preview_query(...)`                                            | Tribe doc unchanged                                                                  |
| T-TRIBE-017| Static tribe with `query_bin_ids` set is rejected (wrapper validates type-shape consistency)            | None                                                | `repo.create_static(..., query_bin_ids=[...])`                       | Raises `InvalidTribeShapeError`                                                      |
| T-TRIBE-018| Dynamic tribe with `member_contact_ids` set is rejected                                                    | None                                                | `repo.create_dynamic(..., member_contact_ids=[...])`                    | Raises `InvalidTribeShapeError`                                                      |

---

## Section 7: PendingJobsRepository (NEW)

`@pytest.mark.integration`. Spec sections validated: deterministic `job_id`, status transitions, sweep query, retry, refresh contract.

### Deterministic `job_id`

| ID         | Asserts                                                                                                       | Setup           | Trigger                                                       | Expected                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| T-PJOB-001 | `job_id = sha256(op_type + primary_id)` deterministic                                                         | None            | `repo._compute_job_id("delete_bin", "B-1")` twice              | Equal                                                          |
| T-PJOB-002 | Different `op_type` produces different `job_id`                                                               | None            | `("delete_bin", "B-1")` vs `("delete_contact", "B-1")`         | Distinct                                                       |
| T-PJOB-003 | Different `primary_id` produces different `job_id`                                                            | None            | `("delete_bin", "B-1")` vs `("delete_bin", "B-2")`             | Distinct                                                       |
| T-PJOB-004 | First `create_job(op_type, primary_id, payload)` writes a doc with status `pending`                          | Clean indices   | `repo.create_job("delete_bin", "B-1", {...})`                  | Doc exists, status `pending`, retry_count 0                    |
| T-PJOB-005 | Second `create_job` with same `(op_type, primary_id)` is no-op upsert (no duplicate, no status reset)        | Doc with status `pending`, retry 2 | Second call                                | Still one doc; status `pending`; retry_count remains 2          |
| T-PJOB-006 | Re-submission while doc is `succeeded` does NOT reset to `pending`                                            | Doc status `succeeded`              | Re-submit                                  | Doc remains `succeeded`                                         |
| T-PJOB-007 | Re-submission while doc is `failed_permanent` does NOT reset (operator must intervene)                        | Doc status `failed_permanent`       | Re-submit                                  | Doc remains `failed_permanent`                                  |

### Status transitions and retries

| ID         | Asserts                                                                                                | Setup                                   | Trigger                                | Expected                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| T-PJOB-020 | `mark_succeeded(job_id)` sets status to `succeeded`                                                    | Pending job                             | `repo.mark_succeeded(jid)`             | Doc status `succeeded`                                              |
| T-PJOB-021 | `mark_failed(job_id, error_msg)` increments `retry_count`, sets `last_error`, schedules `next_attempt_at` | Pending job, retry_count 0              | `repo.mark_failed(jid, "boom")`        | retry_count 1, last_error set, next_attempt_at in future            |
| T-PJOB-022 | After 5 consecutive `mark_failed` calls, status transitions to `failed_permanent`                      | Pending job                             | 5 failures                             | retry_count 5, status `failed_permanent`                            |
| T-PJOB-023 | `failed_permanent` jobs emit ERROR-level log (verify via caplog or structlog capture)                  | Pending job                             | 5 failures                             | One ERROR record per permanent failure                              |
| T-PJOB-024 | `mark_failed` on a `succeeded` job is a no-op (defensive; logs warning)                                | Succeeded job                           | `mark_failed`                          | Status remains `succeeded`; warning logged                          |
| T-PJOB-025 | `mark_succeeded` on a `failed_permanent` job is allowed (operator manual recovery path)                | Failed job                              | `mark_succeeded`                       | Status `succeeded`; INFO log of manual recovery                     |

### Sweep query

| ID         | Asserts                                                                                                       | Setup                                                    | Trigger                                | Expected                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| T-PJOB-040 | `find_pending(limit=100)` returns docs with `status="pending" AND retry_count < 5`                            | Mix of statuses                                          | `repo.find_pending(100)`               | Only matching docs                                                  |
| T-PJOB-041 | `find_pending` excludes docs whose `next_attempt_at` is in the future (backoff respected)                     | Pending doc with `next_attempt_at = now + 10min`         | `repo.find_pending(100)` at `now`      | Doc not in result                                                   |
| T-PJOB-042 | `find_pending` includes docs whose `next_attempt_at` <= now                                                   | Pending doc with `next_attempt_at = now - 1s`            | Same                                   | Doc included                                                        |
| T-PJOB-043 | `find_pending(limit=N)` respects limit                                                                        | 200 pending docs                                         | `repo.find_pending(50)`                | Returns 50                                                          |
| T-PJOB-044 | `find_pending` ordered by `next_attempt_at` ASC (oldest first)                                                | 5 pending with varied `next_attempt_at`                  | Same                                   | Sorted ascending                                                    |

### Refresh on create

| ID         | Asserts                                                                                                  | Setup           | Trigger                                | Expected                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| T-PJOB-060 | `create_job` uses `refresh="wait_for"` so the next sweep interval (5min) sees the doc on the first pass  | Clean indices   | `repo.create_job(...)`; `find_pending` | Doc visible immediately to the very next `find_pending` call (no manual refresh) |
| T-PJOB-061 | `mark_succeeded` and `mark_failed` use `refresh=False` (default; not on the wait_for exception list)     | Pending job     | Inspect call args                       | `refresh=False`                                                                 |

---

## Section 8: Cascade Cleanup End-to-End

`@pytest.mark.integration @pytest.mark.slow`. Spec sections validated: cascade cleanup pending-jobs pattern, idempotency, retry budget.

These tests exercise the **service-layer** orchestration that uses the wrapper, but only the wrapper-touching path. The "service layer" here is a thin `CascadeService` that lives next to the repos; its real business-logic clients are out of scope.

| ID            | Asserts                                                                                                                                   | Setup                                                                          | Trigger                                                              | Expected                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| T-CASCADE-001 | Happy path: `delete_bin(bin_id)` deletes the bin doc AND deletes (soft) all assignments referencing it                                    | One bin, 5 assignments                                                         | `service.delete_bin(bin_id)`                                          | Bin doc gone; all 5 assignments `is_active=False`                                                                              |
| T-CASCADE-002 | Happy path: no pending-jobs doc created when both writes succeed                                                                          | Same                                                                           | Same                                                                 | `tribes_pending_jobs` count == 0                                                                                                |
| T-CASCADE-003 | Happy path: cascade is observed atomically from caller's POV (within the refresh window)                                                  | Same                                                                           | Same; immediately query                                              | No half-state visible                                                                                                          |
| T-CASCADE-010 | Failure path: ES injected error on assignment cleanup -> wrapper writes a `pending_job` for the failed leg                                | Inject 5xx via Toxiproxy on `tribes_assignments.update_by_query`               | `service.delete_bin(bin_id)`                                          | Bin doc gone; pending_job doc with `op_type="cascade_assignments_for_bin"`, `primary_id=bin_id`, status `pending`              |
| T-CASCADE-011 | Sweep picks up the pending job and retries; on second attempt (Toxiproxy now passing) it succeeds                                         | Run T-CASCADE-010; remove fault; trigger sweep                                 | `sweeper.run_once()`                                                  | Pending job marked `succeeded`; assignments now `is_active=False`                                                              |
| T-CASCADE-012 | Sweep retries 5 times; each failure increments `retry_count`; on 5th failure status -> `failed_permanent`                                  | Permanent fault (always 5xx)                                                   | 5 sweep cycles                                                        | retry_count 5, status `failed_permanent`, ERROR log                                                                            |
| T-CASCADE-013 | After `failed_permanent`, sweep does NOT pick the job up again                                                                            | Job in `failed_permanent`                                                      | `sweeper.run_once()`                                                  | Job not in `find_pending` result; no further attempts                                                                          |
| T-CASCADE-020 | Idempotency: two concurrent `delete_bin(same_bin_id)` calls produce exactly one pending-job (deterministic `job_id`)                      | Inject fault                                                                   | `gather` two delete_bin calls                                         | `tribes_pending_jobs` count == 1                                                                                                |
| T-CASCADE-021 | Re-submission: replaying a successful pending job (deterministic id) is a no-op upsert                                                    | Pending job in `succeeded`                                                     | Re-issue `create_job` with same `(op_type, primary_id)`               | Status remains `succeeded`; no duplicate                                                                                       |
| T-CASCADE-030 | Cascade for `delete_contact` removes contact and queues pending-job for assignment cleanup if needed                                      | One contact, 3 assignments                                                     | `service.delete_contact(contact_id)`                                  | Contact gone; assignments soft-deleted (or pending-job queued on failure)                                                       |
| T-CASCADE-031 | Cascade for `delete_tribe` removes tribe (no cross-index cleanup needed for tribes; wrapper handles directly)                              | One tribe                                                                      | `service.delete_tribe(tribe_id)`                                      | Tribe gone; no pending-job created                                                                                              |
| T-CASCADE-032 | Cascade for bin rename, end-to-end: rename a bin, trigger sweep manually (or wait for the 5-min cycle), assert that affected assignment documents now show updated `bin_name` | Bin with N assignments                                                         | `service.rename_bin(...)`; then `sweeper.run_once()`                    | Before sweep: assignments show OLD `bin_name`. After sweep: all affected assignments show NEW `bin_name`; pending-job marked `succeeded`                                                              |

**T-CASCADE-RENAME-COLOR** — Bin color change queues `reconcile_bin_color` pending job. Setup: bin exists with assignments. Trigger: `BinRepository.update(bin_id, color_hex="#abc123")`. Expected: pending job with `op_type="reconcile_bin_color"` exists; after sweep, assignments show updated `bin_color_hex`. Validates: spec §14.3, §14.4.

**T-CASCADE-RENAME-STALENESS** — Denormalized `bin_name` on assignments stale within 5-minute window is acceptable. Setup: bin with 100 assignments; rename bin. Trigger: query an assignment immediately (before sweep). Expected: assignment.bin_name returns OLD name (drift acceptable per contract); after sweep cycle (≤ 5 min), returns NEW name. Validates: spec §14.3 staleness window contract.

---

## Section 9: Refresh Contract Compliance

`@pytest.mark.integration` for behavior tests, `@pytest.mark.unit` for the grep test.

Spec sections validated: refresh contract — `False` default, `wait_for` exception list (`BinRepository.create/upsert`, `ContactRepository.import_contact` merge, `PendingJobsRepository.create_job`), `refresh=true` PROHIBITED.

### Approach

Two complementary techniques:

1. **Behavior tests**: write then immediately read; the read must (or must not) see the write depending on the refresh setting.
2. **Call-trace tests**: instrument the `AsyncElasticsearch` transport (or use a thin spy wrapper) to capture the `refresh` kwarg sent to ES on every call; assert against an expected matrix.

### Per-method refresh matrix

| ID            | Method                                              | Expected `refresh` | Test type                                                 |
| ------------- | --------------------------------------------------- | ------------------ | --------------------------------------------------------- |
| T-REFRESH-001 | `BinRepository.create`                              | `wait_for`         | Trace + behavior (read after create sees doc immediately) |
| T-REFRESH-002 | `BinRepository.upsert`                              | `wait_for`         | Trace + behavior                                          |
| T-REFRESH-003 | `BinRepository.update` (non-name change)            | `False`            | Trace                                                     |
| T-REFRESH-004 | `BinRepository.rename`                              | `wait_for` on the new doc AND `wait_for` on the old-doc delete (so Safeguard B's post-write verification on the new doc sees the absence of the old doc) | Trace + behavior |
| T-REFRESH-005 | `BinRepository.delete`                              | `False`            | Trace                                                     |
| T-REFRESH-006 | `ContactRepository.create` (cold path, no merge)    | `False`            | Trace                                                     |
| T-REFRESH-007 | `ContactRepository.import_contact` (merge update)   | `wait_for`         | Trace + behavior                                          |
| T-REFRESH-008 | `ContactRepository.delete`                          | `False`            | Trace                                                     |
| T-REFRESH-009 | `AssignmentRepository.assign`                       | `False`            | Trace                                                     |
| T-REFRESH-010 | `AssignmentRepository.unassign`                   | `False`            | Trace                                                     |
| T-REFRESH-011 | `AssignmentRepository.update`                       | `False`            | Trace                                                     |
| T-REFRESH-012 | `TribeRepository.*` (all writes)                    | `False`            | Trace                                                     |
| T-REFRESH-013 | `PendingJobsRepository.create_job`                  | `wait_for`         | Trace + behavior (sweep sees on next interval)            |
| T-REFRESH-014 | `PendingJobsRepository.mark_succeeded`              | `False`            | Trace                                                     |
| T-REFRESH-015 | `PendingJobsRepository.mark_failed`                 | `False`            | Trace                                                     |

**T-REFRESH-BIN-RENAME-DELETE** — Bin rename old-doc delete uses `refresh="wait_for"`. Setup: bin exists at `_id_old`. Trigger: rename to a new name (which produces `_id_new` via deterministic hash). Expected: the delete call to ES for `_id_old` includes `refresh="wait_for"` parameter; verified by inspecting the elasticsearch-py call args (use a thin spy wrapper around the AsyncElasticsearch client) OR by asserting the post-write verification search at `_id_new` returns exactly 1 hit (proving the old delete was visible). Validates: spec §15 wait_for exception list.

### Code-shape regression guards (`@pytest.mark.unit`)

| ID            | Asserts                                                                                                                            | Setup                  | Trigger                                                    | Expected                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------- | ------------------------------------- |
| T-REFRESH-100 | `refresh="true"` and `refresh=True` and `refresh=true` literals do NOT appear anywhere in `src/tribes_api/persistence/elasticsearch/` | None                   | `grep -rE 'refresh\s*=\s*(True\|"true"\|true)' src/...`    | Zero matches                          |
| T-REFRESH-101 | `wait_for` literal appears only in the four documented methods (create, upsert, import_contact, create_job)                        | None                   | grep + parse caller                                        | Match set equals expected set         |
| T-REFRESH-102 | A new method must declare its refresh policy explicitly (lint via custom AST checker over `_request` calls)                        | None                   | AST walk                                                   | All `client.*` write calls have `refresh=` kwarg |

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

## Section 11: Concurrency & Idempotency Property Tests

`@pytest.mark.integration @pytest.mark.property @pytest.mark.slow`. Spec sections validated: deterministic ID idempotence under concurrency.

### Hypothesis strategies

- `owners` strategy: synthetic UUID4 strings.
- `names` strategy: `text(alphabet=printable_unicode, min_size=1, max_size=64)`.
- `concurrency_levels` strategy: `integers(min_value=2, max_value=50)`.

### Tests

| ID            | Asserts                                                                                                                                                | Setup            | Trigger                                                                                                  | Expected                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| T-CONCUR-001  | For all `(owner, contact_id, bin_id, N)`: N concurrent `assign` calls produce exactly 1 doc                                                            | Clean indices    | `asyncio.gather` N assigns                                                                               | Exactly 1 doc with deterministic `_id`                                                                                    |
| T-CONCUR-002  | For all `(owner, contact_id, bin_id, N)`: N concurrent `assign` calls increment bin count by exactly 1 (not N)                                         | Clean indices    | Same                                                                                                     | Bin `assignment_count == 1`                                                                                               |
| T-CONCUR-003  | For all `(token, payload, N)`: N concurrent `import_contact` calls with same idempotency token produce exactly 1 contact and 1 merge_audit entry      | Clean indices    | `gather` N imports                                                                                       | 1 contact, 1 audit entry                                                                                                  |
| T-CONCUR-004  | For all `(owner, name, N)`: N concurrent `BinRepository.create(owner, name)` calls produce exactly 1 doc; N-1 callers receive `BinNameConflictError`   | Clean indices    | `gather` N creates                                                                                       | 1 doc; (N-1) typed exceptions; 1 success                                                                                  |
| T-CONCUR-005  | For all `(o, c, b, N)`: N concurrent `unassign` calls decrement bin count by exactly 1 (not N)                                                       | Active doc       | `gather` N unassigns                                                                                   | Bin count decremented by 1                                                                                                |
| T-CONCUR-006  | For all `(op_type, primary_id, N)`: N concurrent `create_job` calls produce exactly 1 doc                                                              | Clean indices    | `gather` N create_job                                                                                    | 1 doc                                                                                                                     |
| T-CONCUR-007  | Mixed concurrent assign+unassign on same triple: final state is internally consistent (count is non-negative; doc state matches last-write-wins)    | Clean indices    | `gather` mix                                                                                             | Count >= 0; state consistent                                                                                              |

---

## Section 12: Drift Tolerance Verification (the `assignment_count` escape hatch)

`@pytest.mark.unit @pytest.mark.regression_guard`. Spec sections validated: V1 explicitly tolerates rough counts; count is not used as a control-flow gate.

### Approach

Static analysis tests (grep + AST) over `src/tribes_api/persistence/`. The point is to prevent a future contributor from adding a guard like `if bin.assignment_count == 0: hide()` in the persistence layer.

| ID         | Asserts                                                                                                                                            | Setup | Trigger                                                                                                | Expected                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| T-DRIFT-001 | `assignment_count` only appears in display/sort code paths in the persistence layer, never in `if`/`while`/`assert` branches                       | None  | AST walk: find all references to `assignment_count`; classify usage as read-only-sort, write, or branch | Zero branch-usages                                                                                  |
| T-DRIFT-002 | No persistence-layer code path performs an action conditioned on `assignment_count == 0`                                                            | None  | grep for `assignment_count == 0`, `assignment_count > `, `assignment_count <`                          | Zero matches in `src/tribes_api/persistence/`                                                       |
| T-DRIFT-003 | No persistence-layer code path triggers a delete or hide based on `assignment_count`                                                                | None  | grep for `delete` and `hide` callsites near `assignment_count`                                          | Zero matches                                                                                        |
| T-DRIFT-004 | Spec doc cross-reference: V1 spec section 5 ("assignment_count drift accepted") is referenced in a code comment near the `assignment_count` script  | None  | grep for `# V1 spec` or `# assignment_count` in `bin.py`                                                 | At least one such comment exists (documentation lock-in)                                            |
| T-DRIFT-005 | Test that a synthetic 100-doc divergence between actual assignment count and stored `assignment_count` does NOT cause the wrapper to misbehave      | Bin with stored count 0; 100 active assignments | Call `repo.list_for_user`, `get_by_id`, `delete`                                                       | All operations succeed; no exception, no silent data loss                                           |

---

## Section 13: Search & Query Patterns

`@pytest.mark.integration`. Spec sections validated: contact search (multi_match, fuzziness, edge_ngram), get_by_bins, cursor pagination, sort stability.

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

Covered in Section 5; cross-references T-ASSIGN-060..065.

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

**T-SEARCH-CURSOR-PIT-OPEN** — First page request opens a PIT. Setup: contact corpus of 100 docs. Trigger: paginated query, page size 20. Expected: ES `_pit` API called with `keep_alive=5m`; cursor token in response is base64-decodable to `{pit_id, sort_values}`. Validates: spec §3 / cursor stability contract.

**T-SEARCH-CURSOR-MUTATION-ISOLATION** — Inserts during pagination are invisible to the cursor. Setup: paginate page 1 of 5. Trigger: insert 10 new contacts; request page 2. Expected: page 2 contains only docs from the original snapshot; the 10 new contacts do not appear. Validates: PIT snapshot semantics.

**T-SEARCH-CURSOR-STALE** — Expired PIT raises `StaleCursorError`. Setup: open PIT, wait 6 minutes. Trigger: request page 2 with the original cursor. Expected: raises `StaleCursorError`; no auto-recovery; client must restart pagination. Validates: spec stale-cursor contract.

### Sort stability

| ID           | Asserts                                                                                                  | Setup           | Trigger                                              | Expected                                            |
| ------------ | -------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------- | --------------------------------------------------- |
| T-SEARCH-040 | `BinRepository.list_for_user` sorted by `(normalized_name, _id)` is deterministic across repeated calls  | 50 bins         | Run 10 times                                          | Same order each run                                 |
| T-SEARCH-041 | Sort uses `keyword` sub-field (not `text`) for `normalized_name` to avoid fielddata cost                 | None            | Inspect query body                                   | Sort field is `normalized_name` (already keyword)   |

### Performance Baselines (P2 — baselining initially, CI-gated after 30 days)

Each test is marked `@pytest.mark.slow @pytest.mark.perf`. Initial runs collect telemetry only; CI gates on these targets after 30 days of baseline data.

**T-PERF-GET-BY-ID** — `get_by_id` p95 < 50ms. Fixture: 1k contacts/user. Operation: 100 sequential `get_by_id` calls. Assertion: p95 latency < 50ms.

**T-PERF-CONTACT-SEARCH** — Contact search (single term, fuzziness AUTO) p95 < 200ms. Fixture: 1k contacts/user. Operation: 100 search queries with random valid terms. Assertion: p95 < 200ms.

**T-PERF-AGG-NORMALIZED** — Cross-user terms agg on `normalized_name` p95 < 500ms. Fixture: 100 users × 50 bins each = 5000 bin docs. Operation: terms aggregation on `normalized_name`. Assertion: p95 < 500ms.

**T-PERF-BULK-IMPORT** — Bulk import 500 contacts p95 < 2s. Fixture: 500 valid ContactImportInput records. Operation: `batch_import`. Assertion: p95 < 2s.

**T-PERF-TRIBE-RESOLVE** — Tribe member resolution (dynamic, ≤2000 contacts/user) p95 < 300ms. Fixture: dynamic tribe over 5 bins, 2000 assignments. Operation: `resolve_members`. Assertion: p95 < 300ms.

**T-PERF-PENDING-SWEEP** — Pending-jobs sweep cycle (100 jobs) p95 < 5s. Fixture: 100 pending jobs across mixed `op_type` values. Operation: trigger sweep. Assertion: p95 cycle time < 5s.

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

## Risk-Weighted Test Priority

P0 = must pass before any production deploy. P1 = must pass before V1 launch. P2 = nice-to-have, can defer to V1.1 or V1.5.

| Priority | Test families                                                                                                                                                  | Rationale                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **P0**   | All idempotency tests (T-CONCUR-001..007)                                                                                                                      | Duplicate writes corrupt the data model. Highest impact; cheapest to detect.                                                         |
| **P0**   | Cascade cleanup E2E (T-CASCADE-001..032)                                                                                                                       | Cross-index ops without atomic guarantees; pending-jobs is the only safety net. Must work or data drifts irrecoverably.              |
| **P0**   | Bin name conflict Safeguard A + B (T-BIN-CONFLICT-A-001..010, T-BIN-CONFLICT-B-001..008)                                                                       | Two bins with same name corrupts UX and aggregation; must hold under concurrency.                                                    |
| **P0**   | Refresh contract compliance (T-REFRESH-001..015, T-REFRESH-100..102)                                                                                           | A regression here silently breaks read-after-write expectations across the system.                                                   |
| **P0**   | Assignment resurrection rule (T-ASSIGN-040..044)                                                                                                               | Implicit resurrection corrupts soft-delete history and invalidates audit assumptions.                                                |
| **P0**   | Identity resolution version pin (T-CONTACT-MERGE-013, T-CONTACT-MERGE-014)                                                                                     | Lost-update on contact merge is silent data loss.                                                                                    |
| **P0**   | Mapping correctness for all 5 indices (T-MAP-001..088)                                                                                                         | A wrong mapping is silent data-quality loss; far cheaper to catch at boot than in production.                                        |
| **P1**   | Identity resolution merge field rules (T-CONTACT-MERGE-001..012, T-CONTACT-MERGE-020..023)                                                                     | Wrong merge rules cause subtle contact corruption; visible in customer support tickets, not crashes.                                 |
| **P1**   | Lexical normalization full suite (T-NORM-001..024, T-NORM-101..110)                                                                                            | Normalization powers cross-user aggregation; bug here means buckets don't collapse correctly.                                        |
| **P1**   | Shard distribution (T-SHARD-001..003, T-SHARD-020..021)                                                                                                        | Hot-shard outage at moderate scale; needs to be verified before launch but not on every test run.                                    |
| **P1**   | PendingJobsRepository core behavior (T-PJOB-001..061)                                                                                                          | Underpins cascade safety net; must be correct.                                                                                       |
| **P1**   | Drift tolerance regression guards (T-DRIFT-001..005)                                                                                                           | Prevents future contributors from breaking the V1 contract.                                                                          |
| **P1**   | Search edge cases (T-SEARCH-001..025, T-SEARCH-040..041)                                                                                                       | Search-quality bugs are visible to users.                                                                                            |
| **P1**   | Assignment denormalization happy path (T-ASSIGN-080, T-ASSIGN-082)                                                                                             | Required for list views to render without N+1 lookups.                                                                               |
| **P1**   | Negative/failure typed exceptions (T-FAIL-001..015)                                                                                                            | Caller branches on these; un-typed exceptions mean callers can't recover.                                                            |
| **P1**   | Cross-user aggregation V1 boundary (T-AGG-001..005)                                                                                                            | The V1/V2 promise hinges on this exact behavior.                                                                                     |
| **P2**   | Performance smoke tests (T-SEARCH-026)                                                                                                                         | Useful but not gating for V1 launch; add to scheduled CI for V1.5.                                                                   |
| **P2**   | Cross-language strip-punctuation edge cases (T-NORM-019..021)                                                                                                  | Likely nice-to-have; English-first product; non-Latin can be addressed in V1.1.                                                      |
| **P2**   | Mapping migration smoke (T-MAP-100..103)                                                                                                                       | Needed when we start mutating mappings post-V1; for V1 launch the mappings are baked.                                                |
| **P2**   | Tribe preview-query (T-TRIBE-016)                                                                                                                              | Read-only and side-effect-free; low risk.                                                                                            |
| **P2**   | Cursor pagination perf (T-SEARCH-026)                                                                                                                          | Functional correctness covered by P1 cursor tests.                                                                                   |
