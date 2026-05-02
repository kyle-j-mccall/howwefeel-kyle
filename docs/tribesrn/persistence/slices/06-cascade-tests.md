# Slice 6 — Cascade Cleanup: Tests

> **Read `00-shared-context.md` FIRST.** This slice assumes the V1 decisions, vector inventory, refresh contract, perf baselines, naming conventions, and glossary are already in context. Do not re-state them here.

## Related slices

Depends on slice 01 (Foundation) for fixtures and `tribes_pending_jobs` mapping, slice 03 (Bins) and slice 02 (Contacts) for primary writes, slice 04 (Assignments) for cascade targets. Sweep-cycle perf baseline is owned by slice 08 (T-PERF-PENDING-SWEEP).

---

## Conventions

Test ID areas used here: `PJOB`, `CASCADE`. Markers: `@pytest.mark.integration` for behavior tests; `@pytest.mark.slow` for end-to-end sweep cycles; `@pytest.mark.network_fault` for tests using Toxiproxy fault injection.

Spec sections validated: deterministic `job_id`, status transitions, sweep query, retry, refresh contract on `create_job`, end-to-end cascade orchestration, `op_type` enumeration.

---

## Section 7: PendingJobsRepository

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

**T-CASCADE-RENAME-COLOR** — Bin color change queues `reconcile_bin_color` pending job. Setup: bin exists with assignments. Trigger: `BinRepository.update(bin_id, color_hex="#abc123")`. Expected: pending job with `op_type="reconcile_bin_color"` exists; after sweep, assignments show updated `bin_color_hex`. Validates: spec §3, §6.

**T-CASCADE-RENAME-STALENESS** — Denormalized `bin_name` on assignments stale within 5-minute window is acceptable. Setup: bin with 100 assignments; rename bin. Trigger: query an assignment immediately (before sweep). Expected: assignment.bin_name returns OLD name (drift acceptable per contract); after sweep cycle (≤ 5 min), returns NEW name. Validates: spec §8 staleness window contract.

---

Pairs with `06-cascade-spec.md`.
