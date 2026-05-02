# Slice 6 — Cascade Cleanup: Spec

> **Read `00-shared-context.md` FIRST.** This slice assumes the V1 decisions, vector inventory, refresh contract, perf baselines, naming conventions, and glossary are already in context. Do not re-state them here.

## Related slices

Depends on:
- **Slice 01 (Foundation)** — `tribes_pending_jobs` index mapping (top-level fields), error contract, lifecycle. The mapping itself is owned by slice 01; this slice owns the lifecycle, the write protocol, and the sweep.
- **Slice 03 (Bins)** — bin rename and color change enqueue pending jobs. Bin delete primary-write happens here, with cascade to assignments.
- **Slice 02 (Contacts)** — contact delete primary-write cascades to assignments.
- **Slice 04 (Assignments)** — `delete_by_bin` / `delete_by_contact` are the cascade callees.

Forward references:
- Slice 07 (Consistency) — `PendingJobsRepository.create_job` is on the `wait_for` exception list. Concurrency invariants for cascade idempotency live there too.

---

## 1. Cascade-Cleanup Pattern

**Context.** Multi-index write sequences (e.g., delete bin → remove all assignments for that bin) are not atomic in ES. A partial failure leaves orphaned documents in a secondary index.

**Approach.** Every secondary write is preceded by a `tribes_pending_jobs` upsert. On primary success + secondary success, the job transitions to `succeeded`. On primary success + secondary failure, the job remains `pending` and is retried by the sweep. The primary write is never rolled back — it is already committed.

This pattern is invoked in three V1 cases:

| Trigger | Secondary writes |
|---|---|
| `BinRepository.delete` | hard-delete all `tribes_assignments` matching `bin_id` |
| `ContactRepository.delete` | hard-delete all `tribes_assignments` matching `contact_id` |
| `BinRepository.update` (name change) | update denormalized `bin_name` on all matching assignments |
| `BinRepository.update` (color_hex change) | update denormalized `bin_color_hex` on all matching assignments |

`TribeRepository.delete` does NOT cascade (T-CASCADE-031).

---

## 2. `tribes_pending_jobs` Mapping (Recap)

The full mapping lives in slice 01. Recap of fields used in this slice:

```json
{
  "mappings": {
    "properties": {
      "job_id":         { "type": "keyword" },
      "op_type":        { "type": "keyword" },
      "primary_id":     { "type": "keyword" },
      "target_index":   { "type": "keyword" },
      "query_dsl":      { "type": "object", "enabled": false },
      "created_at":     { "type": "date" },
      "retry_count":    { "type": "integer" },
      "last_attempted": { "type": "date" },
      "next_attempt_at": { "type": "date" },
      "status":         { "type": "keyword" },
      "error_log":      { "type": "text" }
    }
  }
}
```

`job_id` is `sha256(op_type + primary_id)` and serves as the document `_id`. Re-submitting the same logical cascade is a no-op upsert.

`status` enum: `"pending"`, `"succeeded"`, `"failed_permanent"`.

---

## 3. PendingJobsRepository Contract

```python
class IPendingJobsRepository(ABC):

    @abstractmethod
    async def create_job(
        self,
        op_type: str,
        primary_id: str,
        target_index: str,
        query_dsl: dict,
    ) -> str:
        """Upsert a pending job. Returns deterministic job_id.
        Re-submission while doc is `pending` does NOT reset retry_count.
        Re-submission while doc is `succeeded` or `failed_permanent` is a no-op.
        Uses refresh='wait_for' so the next sweep interval sees it."""

    @abstractmethod
    async def find_pending(self, limit: int) -> list[PendingJob]:
        """Returns docs with status='pending' AND retry_count < MAX_RETRIES
        AND next_attempt_at <= now. Ordered by next_attempt_at ASC (oldest first)."""

    @abstractmethod
    async def mark_succeeded(self, job_id: str) -> None:
        """Sets status='succeeded'. refresh=False.
        Idempotent: calling on a `succeeded` job is a no-op.
        Calling on a `failed_permanent` job is allowed (manual recovery; INFO log)."""

    @abstractmethod
    async def mark_failed(self, job_id: str, error_msg: str) -> None:
        """Increments retry_count, records last_error, schedules next_attempt_at.
        On retry_count == MAX_RETRIES, transitions to `failed_permanent` + ERROR log.
        Calling on a `succeeded` job is a defensive no-op + WARNING log.
        refresh=False."""
```

`MAX_RETRIES = 5` (V1 default). Backoff schedule for `next_attempt_at` is exponential per retry (initial 1 minute, doubling, capped at the sweep interval).

---

## 4. Write Protocol

The full protocol for any secondary cascade write:

```
1. Compute job_id = sha256(op_type + primary_id).
2. Upsert pending-job document with status='pending', refresh='wait_for'.
3. Execute the secondary write (delete_by_query, update_by_query, etc.).
4a. On success: pending_jobs.mark_succeeded(job_id).
4b. On failure: pending_jobs.mark_failed(job_id, error_msg). Do NOT raise — primary
    is already committed.
```

Step 2 uses `wait_for` so the sweeper sees the job on its very next pass even if it fires within milliseconds of the write. This is on the shared-context refresh exception list.

If two concurrent primary writes target the same logical cascade (e.g., two `delete_bin(B1)` calls racing), the deterministic `job_id` makes step 2 a no-op upsert — exactly one pending job exists (T-CASCADE-020).

---

## 5. Sweep Lifecycle

**Cadence.** 5 minutes (configurable; baseline-targeted at < 5s wall clock for 100 jobs).

**Per cycle:**

```
1. jobs = pending_jobs.find_pending(limit=100)
2. For each job in jobs:
   2a. Look up the worker registered for job.op_type.
   2b. Execute job.query_dsl against job.target_index.
   2c. On success: pending_jobs.mark_succeeded(job.job_id).
   2d. On failure: pending_jobs.mark_failed(job.job_id, error_msg).
       If retry_count == MAX_RETRIES, transition to `failed_permanent`,
       emit a structured ERROR log for human triage. The sweep does NOT
       attempt the job again.
```

**Worker registry.** Each `op_type` has a registered handler. Adding a new op_type requires registering the worker; the lifecycle test (slice 06 tests) treats the registry as authoritative.

---

## 6. `op_type` Enumeration (V1)

| `op_type` | Trigger | Secondary action |
|---|---|---|
| `cascade_delete_assignments_for_bin` | `BinRepository.delete` | `delete_by_query` on `tribes_assignments` filter `bin_id=primary_id` |
| `cascade_delete_assignments_for_contact` | `ContactRepository.delete` | `delete_by_query` on `tribes_assignments` filter `contact_id=primary_id` |
| `reconcile_bin_name` | `BinRepository.update` with `name` change | `update_by_query` on `tribes_assignments` filter `bin_id=primary_id`, set `bin_name = <new_name>` |
| `reconcile_bin_color` | `BinRepository.update` with `color_hex` change | `update_by_query` on `tribes_assignments` filter `bin_id=primary_id`, set `bin_color_hex = <new_color>` |

This list grows with each new denormalization or cross-index dependency. New op_types require a corresponding worker registration in the slice that introduces the new dependency.

---

## 7. Idempotency, Retry Budget, Failure Modes

- **Deterministic `job_id`** prevents duplicate jobs under concurrent primary writes.
- **`retry_count < MAX_RETRIES`** in the sweep query bounds retries.
- **`failed_permanent`** terminal state: no further sweep attempts; structured ERROR log surfaces the issue for ops triage.
- **Re-submission semantics:** re-submitting a `succeeded` job is a no-op (T-PJOB-006). Re-submitting a `failed_permanent` job is also a no-op — operators must manually recover via `mark_succeeded` (T-PJOB-007, T-PJOB-025).
- **`mark_failed` on a `succeeded` job** is a defensive no-op + WARNING log (T-PJOB-024).

---

## 8. End-to-End Cascade Examples

### Bin delete (happy path)

```python
# Primary: delete the bin doc
await self.client.delete(index=self.config.bins_index, id=bin_id)

# Secondary cascade
job_id = await self.pending_jobs.create_job(
    op_type="cascade_delete_assignments_for_bin",
    primary_id=bin_id,
    target_index=self.config.assignments_index,
    query_dsl={"query": {"bool": {"filter": [
        {"term": {"owner_user_id": user_id}},
        {"term": {"bin_id": bin_id}},
    ]}}},
)

try:
    deleted = await self.assignment_repo.delete_by_bin(user_id, bin_id)
    await self.pending_jobs.mark_succeeded(job_id)
except Exception as e:
    # Primary is already committed. Leave the job pending; sweep retries.
    await self.pending_jobs.mark_failed(job_id, str(e))
    # Do NOT re-raise; the primary delete succeeded from the caller's POV.
    log.warning("cascade deferred for bin %s: %s", bin_id, e)
```

### Bin rename (denormalization refresh)

`BinRepository.update` with a `name` change:

1. Rename mechanics in slice 03 produce a new doc at the new `_id`, hard-delete the old doc, and trigger Safeguard B verify.
2. After the rename completes, the bin repo enqueues a `reconcile_bin_name` pending job:
   ```python
   await self.pending_jobs.create_job(
       op_type="reconcile_bin_name",
       primary_id=bin_id,
       target_index=self.config.assignments_index,
       query_dsl={"query": {"term": {"bin_id": bin_id}}, "script": {
           "source": "ctx._source.bin_name = params.new_name",
           "params": {"new_name": new_name},
       }},
   )
   ```
3. The sweep picks up the job and runs `update_by_query` on the assignments index. Until the sweep runs (max 5 minutes), assignment docs carry the OLD `bin_name`. This is the "drift accepted, cascade later" contract referenced by slice 04 (T-ASSIGN-081).

### Bin color change

Same pattern as rename but with `op_type="reconcile_bin_color"`. T-CASCADE-RENAME-COLOR validates the full path.

---

## 9. Stories (Reference)

The pending-jobs infrastructure is not enumerated in spec §13's original 15-story list (it was added in the 2026-04-27 session along with decision #3). The slice-6 epic must enumerate:

- **PendingJobs domain model + mapping bootstrap** (mapping owned by Foundation, repository owned here).
- **PendingJobsRepository — `create_job`, `find_pending`, `mark_succeeded`, `mark_failed`** with the full state-machine semantics.
- **CascadeService orchestrator** — the thin layer that calls primary write + pending-job upsert + secondary write + finalize.
- **Sweep job runner** — scheduled task (5-minute cadence) that drives the worker registry.
- **Worker registration for the V1 four `op_type`s.**

---

Pairs with `06-cascade-tests.md`.
