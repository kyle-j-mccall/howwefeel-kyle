# Slice 7 — Consistency: Spec

> **Read `00-shared-context.md` FIRST.** This slice assumes the V1 decisions, vector inventory, refresh contract, perf baselines, naming conventions, and glossary are already in context. Do not re-state them here.

## Related slices

Cross-cutting; references every repository slice. Owns the per-method refresh matrix, version-pin / optimistic-lock semantics, drift tolerance for `assignment_count`, and concurrency / idempotency invariants.

Depends on:
- **Slice 01 (Foundation)** — error contract (`VersionConflictError`, `EsScriptError`).
- **Slice 02 (Contacts)** — `import_contact` merge update path uses `wait_for`; version pin enforces optimistic lock on merges.
- **Slice 03 (Bins)** — `BinRepository.create` / `upsert` uses `wait_for`; rename old-doc delete uses `wait_for`; `assignment_count` drift acceptance.
- **Slice 04 (Assignments)** — all writes use `refresh=False`; resurrection-rule concurrency invariants.
- **Slice 05 (Tribes)** — all writes use `refresh=False`.
- **Slice 06 (Cascade)** — `PendingJobsRepository.create_job` uses `wait_for`; idempotent retry under concurrent submission.

The shared-context's "Refresh Contract Summary" is the high-level rule. This slice is the per-method matrix and the supporting invariants.

---

## 1. Per-Method Refresh Matrix

The exception list in shared-context names four method categories that use `refresh="wait_for"`. Below is the full matrix every wrapper write call SHALL match. Test-side verification uses both behavior tests (write then immediately read) and call-trace tests (instrument transport, assert `refresh=` kwarg).

| Repository Method | Expected `refresh` | Notes |
|---|---|---|
| `BinRepository.create` | `wait_for` | Safeguard B post-write search depends on visibility. |
| `BinRepository.upsert` | `wait_for` | Same as above. |
| `BinRepository.update` (non-name change) | `False` | Default. Color change separately enqueues a pending job. |
| `BinRepository.rename` (write of new doc) | `wait_for` | Safeguard B. |
| `BinRepository.rename` (delete of old doc) | `wait_for` | Safeguard B's verify on the new doc must see the absence of the old. |
| `BinRepository.delete` | `False` | |
| `ContactRepository.create` (cold path, no merge) | `False` | |
| `ContactRepository.import_contact` (merge update path) | `wait_for` | Identity resolution chained ops must see merged state. |
| `ContactRepository.delete` | `False` | |
| `AssignmentRepository.assign` | `False` | |
| `AssignmentRepository.unassign` / `deactivate` | `False` | |
| `AssignmentRepository.update` | `False` | |
| `TribeRepository.*` (all writes) | `False` | |
| `PendingJobsRepository.create_job` | `wait_for` | Sweep query must see the doc on its very next pass. |
| `PendingJobsRepository.mark_succeeded` | `False` | |
| `PendingJobsRepository.mark_failed` | `False` | |

**Bin rename old-doc delete** (T-REFRESH-BIN-RENAME-DELETE): the delete call to ES for `_id_old` includes `refresh="wait_for"` parameter. Verified by inspecting the elasticsearch-py call args (use a thin spy wrapper around the AsyncElasticsearch client) OR by asserting the post-write verification search at `_id_new` returns exactly 1 hit (proving the old delete was visible).

---

## 2. `refresh=true` is Prohibited in Production Write Paths

`refresh=True` (synchronous force) is a cluster-wide performance hazard. The wrapper MUST NOT use it in production. `wait_for` is the only acceptable mechanism when search-visibility is required.

This is enforced by a code-shape regression guard:

```bash
# T-REFRESH-100
grep -rE 'refresh\s*=\s*(True|"true"|true)' src/tribes_api/persistence/elasticsearch/
# Expected: zero matches.
```

A second regression guard (T-REFRESH-101) asserts `wait_for` literal appears only in the four documented methods (create/upsert, import_contact, create_job, rename old-doc delete).

A third (T-REFRESH-102) is an AST-level lint: every `client.*` write call must include a `refresh=` kwarg explicitly. New methods must declare their refresh policy on day one.

---

## 3. Version Pin (`if_seq_no` / `if_primary_term`)

All update operations that read-then-write under contention MUST use the optimistic-lock primitive: pass `if_seq_no` and `if_primary_term` from the candidate read.

The canonical case is `ContactRepository.import_contact`'s merge path:

```python
candidate = await self.client.get(index=..., id=...)
seq_no   = candidate["_seq_no"]
prim_term = candidate["_primary_term"]

merged_doc = apply_field_level_merge_rules(candidate["_source"], incoming)

await self.client.update(
    index=...,
    id=...,
    doc=merged_doc,
    if_seq_no=seq_no,
    if_primary_term=prim_term,
)
```

On `VersionConflictEngineException`:

1. Wrapper retries the full fetch-and-merge cycle up to 3 times.
2. On exhaustion, raises typed `MergeConflictError` (subclass of `TribesRepositoryError` and re-exposed as `VersionConflictError` for the broader optimistic-lock contract).
3. Caller branches on `VersionConflictError` and decides whether to retry with a fresh read.

This is exercised by T-CONTACT-MERGE-013 / T-CONTACT-MERGE-014 (slice 02) and the cross-cutting T-FAIL-005 here.

For `BinRepository.increment_assignment_count`, the wrapper uses `retry_on_conflict=3` directly on the `update` call (T-BIN-043) — this is a Painless-script-update-only mechanism that retries on the server side. It is the equivalent of version pin for that specific case.

---

## 4. Drift Tolerance for `assignment_count` (Decision #2)

V1 explicitly accepts rough counts on `bin.assignment_count`. The Painless increment script clamps at zero (`Math.max(0, ...)`), but the count may diverge from the true count of `is_active=True` assignment docs under any of:

- Concurrent assign + soft-delete races (one increment + one decrement may collide; `retry_on_conflict=3` mitigates but does not eliminate).
- `bulk_assign` does NOT increment per item (V1.5 introduces a reconciliation job).
- Reactivation via the explicit-resurrection rule (slice 04 §5) increments; the wrapper does not detect that the previous soft-delete already decremented.

**Acceptance condition:** the wrapper MUST NOT use `assignment_count` as a control-flow gate. The drift slice (slice 07 tests) verifies this via static analysis: zero references to `assignment_count` in `if`, `while`, `assert` branches; zero callsites near `delete` or `hide`.

If a future PR adds such a gate, the regression guard fails — the contributor must either (a) introduce an authoritative count (recompute from assignments) or (b) escalate to a spec amendment.

A documentation-lock-in test (T-DRIFT-004) requires a `# V1 spec` or `# assignment_count` comment near the increment script in `bin.py` so the contract is visible at the call site.

---

## 5. Concurrency Invariants

The system-wide invariants the test plan asserts under `asyncio.gather` concurrency:

| Invariant | Operation | Property |
|---|---|---|
| C1 | `assign(triple)` × N concurrent | Exactly 1 doc; bin count incremented exactly 1 |
| C2 | `import_contact(token, payload)` × N with same token | Exactly 1 contact; exactly 1 merge_audit entry |
| C3 | `BinRepository.create(owner, name)` × N | Exactly 1 doc; (N-1) typed `BinNameConflictError` |
| C4 | `deactivate(triple)` × N | Bin count decremented exactly 1 |
| C5 | `create_job(op_type, primary_id)` × N | Exactly 1 doc |
| C6 | Mixed assign + deactivate on same triple | Count >= 0; doc state matches last-write-wins |
| C7 | `increment_assignment_count(bin_id, +1)` × N | Final count == N (Painless `retry_on_conflict=3`) |

C1–C7 cover the full set of concurrent-safety claims the wrapper makes. They are exercised under Hypothesis property tests with concurrency levels in `[2, 50]` (T-CONCUR-001..007).

---

## 6. Stories (Reference)

Consistency does not introduce a new story; it is the cross-cutting contract every repository story must respect. The slice-7 epic should produce:

- **A consistency-checklist story** that adds the per-method refresh matrix to a code-review template.
- **A regression-guard story** for the three code-shape tests (no `refresh=True`, `wait_for` only in documented methods, every write has explicit `refresh=` kwarg).
- **A drift-tolerance regression-guard story** for `assignment_count` (T-DRIFT-001..005).

---

Pairs with `07-consistency-tests.md`.
