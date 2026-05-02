# Slice 7 — Consistency: Tests

> **Read `00-shared-context.md` FIRST.** This slice assumes the V1 decisions, vector inventory, refresh contract, perf baselines, naming conventions, and glossary are already in context. Do not re-state them here.

## Related slices

Cross-cutting; references slices 02–06. Tests here are run after the per-repo tests have validated baseline correctness.

---

## Conventions

Test ID areas used here: `REFRESH`, `CONCUR`, `DRIFT`. Markers: `@pytest.mark.integration` for behavior tests, `@pytest.mark.unit` for code-shape and AST grep tests, `@pytest.mark.property` + `@pytest.mark.slow` for concurrency property tests, `@pytest.mark.regression_guard` for drift-tolerance static analysis.

---

## Section 9: Refresh Contract Compliance

`@pytest.mark.integration` for behavior tests, `@pytest.mark.unit` for the grep test.

Spec sections validated: refresh contract — `False` default, `wait_for` exception list (`BinRepository.create/upsert`, `ContactRepository.import_contact` merge, `PendingJobsRepository.create_job`, `BinRepository.rename` old-doc delete), `refresh=true` PROHIBITED.

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
| T-REFRESH-010 | `AssignmentRepository.deactivate`                   | `False`            | Trace                                                     |
| T-REFRESH-011 | `AssignmentRepository.update`                       | `False`            | Trace                                                     |
| T-REFRESH-012 | `TribeRepository.*` (all writes)                    | `False`            | Trace                                                     |
| T-REFRESH-013 | `PendingJobsRepository.create_job`                  | `wait_for`         | Trace + behavior (sweep sees on next interval)            |
| T-REFRESH-014 | `PendingJobsRepository.mark_succeeded`              | `False`            | Trace                                                     |
| T-REFRESH-015 | `PendingJobsRepository.mark_failed`                 | `False`            | Trace                                                     |

**T-REFRESH-BIN-RENAME-DELETE** — Bin rename old-doc delete uses `refresh="wait_for"`. Setup: bin exists at `_id_old`. Trigger: rename to a new name (which produces `_id_new` via deterministic hash). Expected: the delete call to ES for `_id_old` includes `refresh="wait_for"` parameter; verified by inspecting the elasticsearch-py call args (use a thin spy wrapper around the AsyncElasticsearch client) OR by asserting the post-write verification search at `_id_new` returns exactly 1 hit (proving the old delete was visible). Validates: spec §1 wait_for exception list.

### Code-shape regression guards (`@pytest.mark.unit`)

| ID            | Asserts                                                                                                                            | Setup                  | Trigger                                                    | Expected                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------- | ------------------------------------- |
| T-REFRESH-100 | `refresh="true"` and `refresh=True` and `refresh=true` literals do NOT appear anywhere in `src/tribes_api/persistence/elasticsearch/` | None                   | `grep -rE 'refresh\s*=\s*(True\|"true"\|true)' src/...`    | Zero matches                          |
| T-REFRESH-101 | `wait_for` literal appears only in the four documented methods (create, upsert, import_contact, create_job)                        | None                   | grep + parse caller                                        | Match set equals expected set         |
| T-REFRESH-102 | A new method must declare its refresh policy explicitly (lint via custom AST checker over `_request` calls)                        | None                   | AST walk                                                   | All `client.*` write calls have `refresh=` kwarg |

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
| T-CONCUR-005  | For all `(o, c, b, N)`: N concurrent `deactivate` calls decrement bin count by exactly 1 (not N)                                                       | Active doc       | `gather` N deactivates                                                                                   | Bin count decremented by 1                                                                                                |
| T-CONCUR-006  | For all `(op_type, primary_id, N)`: N concurrent `create_job` calls produce exactly 1 doc                                                              | Clean indices    | `gather` N create_job                                                                                    | 1 doc                                                                                                                     |
| T-CONCUR-007  | Mixed concurrent assign+deactivate on same triple: final state is internally consistent (count is non-negative; doc state matches last-write-wins)    | Clean indices    | `gather` mix                                                                                             | Count >= 0; state consistent                                                                                              |

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
| T-DRIFT-004 | Spec doc cross-reference: V1 spec section ("assignment_count drift accepted") is referenced in a code comment near the `assignment_count` script    | None  | grep for `# V1 spec` or `# assignment_count` in `bin.py`                                                 | At least one such comment exists (documentation lock-in)                                            |
| T-DRIFT-005 | Test that a synthetic 100-doc divergence between actual assignment count and stored `assignment_count` does NOT cause the wrapper to misbehave      | Bin with stored count 0; 100 active assignments | Call `repo.list_for_user`, `get_by_id`, `delete`                                                       | All operations succeed; no exception, no silent data loss                                           |

---

Pairs with `07-consistency-spec.md`.
