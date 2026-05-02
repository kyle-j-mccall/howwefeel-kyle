# Slice 4 — Assignments: Tests

> **Read `00-shared-context.md` FIRST.** This slice assumes the V1 decisions, vector inventory, refresh contract, perf baselines, naming conventions, and glossary are already in context. Do not re-state them here.

## Related slices

Depends on slice 01 (Foundation) for fixtures and slice 03 (Bins) for `bin_repo`. Cross-references slice 06 (Cascade) for delete-by-bin / delete-by-contact full E2E paths and slice 08 (Read Path) for `get_by_bins` cursor and perf coverage.

---

## Conventions

Test ID area used here: `ASSIGN`. Marker: `@pytest.mark.integration`.

Spec sections validated: deterministic `_id`, soft delete, resurrection rule, get_by_bins OR semantics, denormalized fields.

---

## Section 5: AssignmentRepository

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
| T-ASSIGN-021  | `unassign` decrements bin `assignment_count`                                                                     | Active doc, count 1 | `repo.unassign(...)`            | Bin count == 0                                    |
| T-ASSIGN-022  | Unassign on already-inactive doc is no-op (no double decrement)                                                  | Inactive doc     | Second unassign                    | Bin count unchanged                               |
| T-ASSIGN-023  | Unassign preserves `affinity_weight`, `flick_velocity`, `created_at`, `last_assigned_at` for history             | Active doc       | Unassign                            | All fields preserved                              |

### Resurrection rule (Decision #1, 2026-04-27)

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
| T-ASSIGN-063  | `get_by_bins` filters out `is_active=False` docs by default                                              | Some docs inactive                    | `repo.get_by_bins(o, [b1])`            | Only active                                            |
| T-ASSIGN-064  | `get_by_bins(..., include_inactive=True)` returns both                                                   | Same                                  | With flag                              | Both                                                  |
| T-ASSIGN-065  | AND semantics (intersection) is NOT performed in the wrapper (regression guard)                          | -                                     | Source code grep                       | No `intersection` method on AssignmentRepository       |

### Denormalized field writes

| ID            | Asserts                                                                                                                  | Setup                          | Trigger                                  | Expected                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------ |
| T-ASSIGN-080  | On `assign`, wrapper denormalizes `bin_name`, `bin_domain`, `bin_color_hex` from the bin doc into the assignment          | Bin with set fields            | `repo.assign(o, c, b)`                    | Assignment doc has all three denormalized fields equal to the bin's values    |
| T-ASSIGN-081  | When the bin is renamed, OLD assignment denormalized `bin_name` is stale until cascade refresh (V1 explicit drift accept) | Assignment exists; rename bin  | Inspect assignment immediately            | `bin_name` still old value; documented as "drift accepted, cascade later"      |
| T-ASSIGN-082  | `affinity_weight` and `flick_velocity` are written as provided (no clamping in wrapper; service layer clamps)            | None                           | `repo.assign(o, c, b, weight=2.0)`        | Doc has `affinity_weight == 2.0` (wrapper does not clamp)                      |

---

Pairs with `04-assignments-spec.md`.
