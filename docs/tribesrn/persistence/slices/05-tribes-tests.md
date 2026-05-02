# Slice 5 — Tribes: Tests

> **Read `00-shared-context.md` FIRST.** This slice assumes the V1 decisions, vector inventory, refresh contract, perf baselines, naming conventions, and glossary are already in context. Do not re-state them here.

## Related slices

Depends on slice 01 (Foundation), slice 02 (Contacts), slice 03 (Bins), and slice 04 (Assignments) for fixtures. Tribe `delete` does NOT cascade — covered indirectly here (T-TRIBE-* state-only assertions) and explicitly in slice 06 (T-CASCADE-031).

---

## Conventions

Test ID area used here: `TRIBE`. Marker: `@pytest.mark.integration`.

Spec sections validated: static vs dynamic tribes, member_count_cached, query fields, type-shape validation, ownership of `query.bin_ids`.

---

## Section 6: TribeRepository

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

Cross-references:
- T-FAIL-013 (`resolve_dynamic_members` on a static tribe → `InvalidTribeShapeError`) lives in slice 08.
- T-CASCADE-031 (delete tribe does NOT cascade) lives in slice 06.
- T-FAIL-013 covers the type-shape boundary at the read path; T-TRIBE-017/018 cover it at write time.

---

Pairs with `05-tribes-spec.md`.
