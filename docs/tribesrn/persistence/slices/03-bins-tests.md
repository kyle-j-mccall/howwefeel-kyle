# Slice 3 — Bins: Tests

> **Read `00-shared-context.md` FIRST.** This slice assumes the V1 decisions, vector inventory, refresh contract, perf baselines, naming conventions, and glossary are already in context. Do not re-state them here.

## Related slices

Depends on slice 01 (Foundation) for fixtures and index bootstrap. Cross-references slice 06 (Cascade) for the pending-job-on-rename verification (T-BIN-024). Drift tolerance for `assignment_count` is fully exercised in slice 07.

---

## Conventions

Test ID areas used here: `BIN`, `BIN-CONFLICT-A`, `BIN-CONFLICT-B`, `NORM`. Markers: `@pytest.mark.unit` for the lexical-normalization suite (Section 1 of source plan), `@pytest.mark.integration` for the rest.

Spec sections validated: deterministic `_id`, post-write verify, normalized_name derivation, rename, assignment_count Painless script.

---

## Section 1: Lexical Normalization (`normalize_bin_name`)

These are pure unit tests. No ES needed. `@pytest.mark.unit`.

### Single-step tests

| ID         | Asserts                                                                                                            | Setup           | Trigger                                  | Expected                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------ | --------------- | ---------------------------------------- | --------------------------------------------------------------- |
| T-NORM-001 | NFKC normalization collapses compatibility characters (e.g., `"Café"` and `"Café"` produce same output)            | None            | `normalize_bin_name(input)`              | Both inputs produce identical output                            |
| T-NORM-002 | NFKC collapses full-width digits/letters to ASCII equivalents                                                      | None            | `normalize_bin_name("Ｈiking")`           | Output equals `normalize_bin_name("Hiking")`                    |
| T-NORM-003 | Casefold lowercases ASCII                                                                                          | None            | `normalize_bin_name("HIKING")`           | Output equals `normalize_bin_name("hiking")`                    |
| T-NORM-004 | Casefold handles German sharp-s (`"Straße"` -> `"strasse"`)                                                        | None            | `normalize_bin_name("Straße")`           | Output starts with `strasse`                                    |
| T-NORM-005 | Casefold handles Turkish dotted-I edge case to spec (Python default casefold semantics)                            | None            | `normalize_bin_name("İstanbul")`         | Output stable, documented behavior                              |
| T-NORM-006 | Leading/trailing whitespace stripped                                                                               | None            | `normalize_bin_name("  hiking  ")`       | Equals `normalize_bin_name("hiking")`                           |
| T-NORM-007 | Punctuation in Unicode category `P*` stripped (em-dash, smart quotes, ellipsis)                                    | None            | `normalize_bin_name("hiking—club")`      | Equals `normalize_bin_name("hiking club")`                      |
| T-NORM-008 | Punctuation strip handles ASCII period, comma, hyphen, parentheses                                                 | None            | `normalize_bin_name("(hiking, club).")`  | Equals `normalize_bin_name("hiking club")`                      |
| T-NORM-009 | Internal multi-space collapsed to single space before tokenize                                                     | None            | `normalize_bin_name("hiking    club")`   | Equals `normalize_bin_name("hiking club")`                      |
| T-NORM-010 | Tab and newline treated as whitespace                                                                              | None            | `normalize_bin_name("hiking\tclub\n")`   | Equals `normalize_bin_name("hiking club")`                      |
| T-NORM-011 | Snowball stem collapses `"hiking"` and `"hike"` to same token                                                      | None            | Both inputs                              | Equal output                                                    |
| T-NORM-012 | Snowball stem collapses `"running"`, `"runs"`, `"ran"` (where Snowball does)                                       | None            | All three inputs                         | First two equal; `"ran"` documented as separate per Snowball    |
| T-NORM-013 | Snowball stem leaves single-syllable irregulars stable                                                             | None            | `"go"`, `"is"`                           | Output unchanged                                                |
| T-NORM-014 | Tokenize then rejoin uses single ASCII space as separator                                                          | None            | `normalize_bin_name("Hiking Club")`     | Output contains exactly one space, no double-space              |
| T-NORM-015 | Empty string input returns empty string (not None, not error)                                                      | None            | `normalize_bin_name("")`                 | `""`                                                            |
| T-NORM-016 | Whitespace-only input returns empty string                                                                         | None            | `normalize_bin_name("   ")`              | `""`                                                            |
| T-NORM-017 | Punctuation-only input returns empty string                                                                        | None            | `normalize_bin_name("!!!---")`           | `""`                                                            |
| T-NORM-018 | Single-character input survives the pipeline                                                                       | None            | `normalize_bin_name("A")`                | `"a"`                                                           |
| T-NORM-019 | Non-Latin script (Cyrillic) survives NFKC + casefold; stem is no-op for non-English                                | None            | `normalize_bin_name("Пиво")`             | Output stable; Snowball English stemmer leaves token intact     |
| T-NORM-020 | Mixed script input does not crash                                                                                  | None            | `normalize_bin_name("Hiking Пиво")`      | Returns a valid string, no exception                            |
| T-NORM-021 | Emoji input: stripped because the algorithm strips both Unicode category P* (Punctuation) and S* (Symbol); emoji are typically `So` (Symbol Other), removed at step 4; e.g., `"HIKERS 🏔"` normalizes to `"hiker"` (the 🏔 is removed) | None | `normalize_bin_name("HIKERS 🏔")` | Equals `"hiker"` (per spec §2 step 4 strip rule)     |
| T-NORM-022 | Numeric tokens preserved (no stemmer mangling of `"5k"`)                                                           | None            | `normalize_bin_name("5K Run")`           | Output contains `"5k"` and stemmed `"run"`                      |
| T-NORM-023 | Apostrophe handled: `"Sam's Friends"` -> `"sam friend"` (apostrophe is Pc/Po, stripped)                            | None            | `normalize_bin_name("Sam's Friends")`    | Equals normalize of `"sam friends"` post-strip                  |
| T-NORM-024 | Hyphenated compound: `"co-workers"` -> token boundary at hyphen                                                    | None            | `normalize_bin_name("co-workers")`       | Equals normalize of `"co workers"`                              |

**T-NORM-EMOJI-A** — Emoji stripped regardless of position. Setup: input strings with emoji at start, middle, end (e.g., `"🌲hike"`, `"hike🌲crew"`, `"hike crew🌲"`). Trigger: `normalize_bin_name`. Expected: all emoji removed; remaining text stemmed normally. Validates: spec §2 step 4 — emoji handling.

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

## Section 4: BinRepository — Deterministic `_id` Safeguard A

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
| T-BIN-CONFLICT-B-001  | After `create()`, wrapper issues a follow-up `search` with `refresh="wait_for"` semantics to verify single-result                          | Clean indices                                                          | `repo.create()`                                          | Trace shows search call after write; `wait_for` used (covered also slice 07)                          |
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
| T-BIN-046  | `assignment_count` is documented-best-effort (drift tolerated; covered explicitly slice 07)                       | -                                                      | -                                                                | -                                                                  |

---

Pairs with `03-bins-spec.md`.
