# Elasticsearch Wrapper — Slice Set

This directory holds the spec and test plan for the Elasticsearch wrapper, sliced into eight self-contained pairs that can be fed to `bmad-create-epics-and-stories` one at a time. Each pair is small enough that the skill produces a focused, low-noise epic; the eight epics combine into the V1 wrapper backlog.

The source documents (`elasticsearch-wrapper-spec.md`, ~2300 lines, and `elasticsearch-wrapper-test-plan.md`, ~788 lines) live one directory up. They remain the canonical reference; the slice files are extracts shaped to fit the BMAD epic-creation workflow.

---

## Feed Order

Run `bmad-create-epics-and-stories` against the slices in this order. Slices 02 and 03 are independent leaves and can swap; slices 06–08 are cross-cutting and must come after their referenced repository slices.

1. **Foundation** (`01-foundation-spec.md` + `01-foundation-tests.md`) — must be epic'd first; everyone depends on the ES client, error contract, lifecycle, analyzer config, and `tribes_pending_jobs` mapping.
2. **Bins** (`03-bins-spec.md` + `03-bins-tests.md`) — independent leaf. Either order with Contacts works; recommend Bins first because the `normalize_bin_name` unit suite catches lexical drift early and the deterministic-`_id`/Safeguard-A-and-B work informs the assignment slice.
3. **Contacts** (`02-contacts-spec.md` + `02-contacts-tests.md`) — independent leaf. Identity resolution (blocking, scoring, merge rules, idempotency token, version pin) is heavy; running after Bins lets the `import_contact` story author lean on the Foundation error contract being settled.
4. **Assignments** (`04-assignments-spec.md` + `04-assignments-tests.md`) — references Contact and Bin domain models; denormalizes `bin_*`; calls `BinRepository.increment_assignment_count`. Resurrection rule is the headline.
5. **Tribes** (`05-tribes-spec.md` + `05-tribes-tests.md`) — references Assignments via `get_by_bins`; static vs dynamic shapes; type-shape validation; bin ownership for `query_bin_ids`.
6. **Cascade Cleanup** (`06-cascade-spec.md` + `06-cascade-tests.md`) — references Bin/Contact delete and rename paths; introduces `PendingJobsRepository`, write protocol, sweep lifecycle, four V1 `op_type`s.
7. **Consistency** (`07-consistency-spec.md` + `07-consistency-tests.md`) — cross-cutting; the per-method refresh matrix, version pin, drift tolerance for `assignment_count`, and concurrency invariants. Runs after the repos are epic'd so it can name them concretely.
8. **Read Path** (`08-readpath-spec.md` + `08-readpath-tests.md`) — cross-cutting; contact search, cursor stability with PIT, shard distribution, perf baselines, cross-user aggregation, and the failure-mode catalog.

---

## Per-Slice Briefing

What to expect when each slice produces an epic.

**Slice 1 — Foundation.** ES client singleton, env-driven `ESConfig`, the canonical error class hierarchy, `ensure_indices` lifecycle, FastAPI DI wiring. Stories map to spec §13 Story 1 and Story 15. The Foundation epic must also lock three open naming/shape questions that recur across slices: (a) analyzer name `tribes_name` vs `tribes_text`; (b) `tribes_bins` shard count 1 vs 3 (recommend 3); (c) `member_contact_ids` vs `member_user_ids`. Resolve these once, then propagate.

**Slice 2 — Contacts.** `tribes_contacts` mapping, Pydantic models, `IContactRepository` (write subset), blocking-key generation, probabilistic scorer, field-level merge rules, idempotency token, append-only `merge_audit`, phone E.164 contract, Soundex contract. Stories: 2, 3, 5, 13, 14 from spec §13. Search/get_by_bins/get_unlabeled are deferred to slice 08.

**Slice 3 — Bins.** `tribes_bins` mapping, the V1 lexical normalization pipeline (NFKC + casefold + P/S strip + Snowball stem), `BinRepository` CRUD, deterministic `_id` Safeguard A, post-write Safeguard B, `seed_defaults` idempotent bulk upsert, `assignment_count` Painless script. Stories: 7, 8 from spec §13. Rename mechanics are detailed here; the cascade fan-out lives in slice 06.

**Slice 4 — Assignments.** `tribes_assignments` mapping, `IAssignmentRepository`, deterministic `_id` triple, soft-delete + explicit-resurrection rule (Decision #1, 2026-04-27), denormalized `bin_*` fields with documented drift, OR-only `get_by_bins`. Stories: 9, 10 from spec §13.

**Slice 5 — Tribes.** `tribes_tribes` mapping, `ITribeRepository`, static vs dynamic type-shape validation, `query_*` field semantics, `member_count_cached` lifecycle, `preview_query` (read-only, side-effect-free). Stories: 11, 12 from spec §13. Tribe `delete` does NOT cascade — the slice 06 epic will assert this explicitly.

**Slice 6 — Cascade Cleanup.** `PendingJobsRepository`, deterministic `job_id`, write protocol (primary then pending-job-on-failure), sweep lifecycle (5-min cadence, exponential backoff, MAX_RETRIES=5), four V1 `op_type`s (`cascade_delete_assignments_for_bin/contact`, `reconcile_bin_name`, `reconcile_bin_color`). The slice-6 epic introduces the new stories not enumerated in spec §13's original 15-story list (the cascade infrastructure was added with Decision #3 in the 2026-04-27 session).

**Slice 7 — Consistency.** Per-method refresh matrix (15 entries), three code-shape regression guards (no `refresh=True`, `wait_for` only in documented methods, every write declares `refresh=` kwarg explicitly), version pin / optimistic lock contract, drift tolerance for `assignment_count` (5 static-analysis tests), 7 concurrency invariants under Hypothesis. The slice-7 epic produces a consistency-checklist story plus regression-guard stories.

**Slice 8 — Read Path.** Contact search query shape, cursor stability via PIT + `search_after`, `StaleCursorError` contract, shard distribution analysis for `tribes_assignments`, the V1 perf baselines (six `T-PERF-*` tests, baselining-only initially, CI-gated after 30 days), cross-user aggregation V1/V2 boundary, and the typed-exception failure-mode catalog. Stories: 4, 6 from spec §13 plus four new stories the slice-8 epic introduces (cursor pagination, shard-distribution regression guards, perf baselines, failure-mode catalog).

---

## Skill Invocation Pattern

> **Path note (post-reorg):** the canonical PRD now lives at `_bmad-output/shared/prd.md`
> and the architecture is split across `_bmad-output/shared/architecture/overview.md`
> (cross-layer) and `_bmad-output/{persistence,server,client}/planning/architecture.md`
> (per-layer). The symlink dance below is run from `_bmad-output/persistence/planning/`
> against locally-staged copies of `prd.md` and `architecture.md` so `bmad-create-epics-and-stories`
> sees a single working pair per slice. The originals are not touched.

`bmad-create-epics-and-stories` reads a working `architecture.md` and `prd.md` next to the slices. The pattern below stages those copies and then symlinks them to the slice files, leaving the canonical sources alone.

```bash
cd _bmad-output/persistence/planning
cp ../../shared/prd.md prd.md
cp ../../shared/architecture/overview.md architecture.md

# Each slice run:
ln -sf slices/01-foundation-spec.md  architecture.md
ln -sf slices/01-foundation-tests.md prd.md
# Invoke /bmad-create-epics-and-stories
mv epics.md slices/epics-01-foundation.md

ln -sf slices/02-contacts-spec.md  architecture.md
ln -sf slices/02-contacts-tests.md prd.md
# Invoke /bmad-create-epics-and-stories
mv epics.md slices/epics-02-contacts.md

# ...repeat for slices 03 through 08...
```

When you finish, remove the staged copies/symlinks:

```bash
rm _bmad-output/persistence/planning/architecture.md _bmad-output/persistence/planning/prd.md
# (architecture.md here is the staged working copy — NOT the per-layer architecture file
#  in `_bmad-output/persistence/planning/architecture.md`. If you set up the symlinks in
#  this directory you'll have temporarily shadowed the per-layer file; remove the symlink
#  to restore visibility, or do the symlink dance in a scratch directory instead.)
```

---

## The Role of `00-shared-context.md`

`00-shared-context.md` (10 KB) is the V1 baseline that every slice assumes the reader has already loaded: the 9 V1 decisions, the V1 vector inventory (NONE), the refresh contract summary, the V1 perf baselines, naming conventions, glossary, and cross-slice dependency map. It is intentionally short.

Each slice's preamble explicitly says "Read `00-shared-context.md` FIRST" and refuses to re-state that material. This keeps each slice tight — typically 200–400 lines — without losing the V1 framing.

**Best practice for the skill run:** make the shared context reachable from the same glob the skill uses to ingest planning artifacts. Two equally good options:

1. **Paste-in.** Open `00-shared-context.md`, paste its contents into the conversation, then invoke `/bmad-create-epics-and-stories`. The skill's context window already holds the framing.
2. **Glob symlink.** Before the first slice run, create a stable copy the skill picks up alongside the symlinked architecture/prd:
   ```bash
   cp slices/00-shared-context.md slices/architecture-shared.md
   ```
   The skill globs `architecture*.md` in the working directory and ingests both the slice-specific architecture.md (symlinked) and the shared context (`architecture-shared.md`).

Either works. Pasting is simpler for one-shot runs; the glob symlink is better if you re-invoke the skill across multiple sessions.

---

## After All 8 Runs

You will have eight `epics-NN-*.md` files in this directory:

```
slices/
├── epics-01-foundation.md
├── epics-02-contacts.md
├── epics-03-bins.md
├── epics-04-assignments.md
├── epics-05-tribes.md
├── epics-06-cascade.md
├── epics-07-consistency.md
└── epics-08-readpath.md
```

Combine and push to beads:

```bash
# Combine the 8 epic files into one canonical epics-combined.md
cat slices/epics-{01..08}-*.md > slices/epics-combined.md

# (Or open each in turn and curate manually — recommended for first pass
#  so you can dedupe stories that overlap across cross-cutting slices 06–08.)

# Then run sprint planning to produce sprint-status.yaml and push to beads
/bmad-sprint-planning
```

`bmad-sprint-planning` reads the combined epics, generates `_bmad-output/shared/sprint-status.yaml`, and (per project CLAUDE.md) creates the corresponding beads issues via `bd create`. Verify with `bd ready` and `bd dep tree <epic-id>` before declaring the work landed.
