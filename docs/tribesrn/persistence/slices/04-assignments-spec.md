# Slice 4 — Assignments: Spec

> **Read `00-shared-context.md` FIRST.** This slice assumes the V1 decisions, vector inventory, refresh contract, perf baselines, naming conventions, and glossary are already in context. Do not re-state them here.

## Related slices

Depends on:
- **Slice 01 (Foundation)** — ES client, error contract, lifecycle.
- **Slice 02 (Contacts)** — `Contact` domain model; `delete_by_contact` is the cascade callee from `ContactRepository.delete`.
- **Slice 03 (Bins)** — `Bin` domain model, `bin_name`/`bin_domain`/`bin_color_hex` source for denormalization, `BinRepository.increment_assignment_count` (called from `assign`/`unassign`).

Forward references:
- Slice 05 (Tribes) — dynamic tribes execute queries against `tribes_assignments`.
- Slice 06 (Cascade) — bin/contact delete fans out via `delete_by_bin` / `delete_by_contact`; bin rename refreshes denormalized fields via pending jobs.
- Slice 07 (Consistency) — refresh policy for assignment writes is `refresh=False`.
- Slice 08 (Read Path) — `get_by_bins` query patterns, shard distribution analysis, performance baselines.

---

## 1. `tribes_assignments` Mapping

One document per **contact-bin pairing** (the result of a flick). This is the join table. Designed for high write throughput (every flick = one upsert).

```python
ASSIGNMENTS_MAPPING = {
    "mappings": {
        "dynamic": "strict",
        "properties": {
            "assignment_id":    {"type": "keyword"},          # "{owner_user_id}#{contact_id}#{bin_id}"
            "owner_user_id":    {"type": "keyword"},
            "contact_id":       {"type": "keyword"},
            "bin_id":           {"type": "keyword"},
            "bin_name":         {"type": "keyword"},          # Denormalized for display without join
            "bin_domain":       {"type": "keyword"},          # Denormalized
            "bin_color_hex":    {"type": "keyword"},          # Denormalized

            # --- Weights ---
            "affinity_weight":  {"type": "float"},            # 0.0–1.0; personal confidence
                                                              # Derived from flick velocity V1.5+
            "flick_velocity":   {"type": "float"},            # Raw gesture velocity (stored for future)

            # --- Timestamps ---
            "assigned_at":      {"type": "date"},
            "updated_at":       {"type": "date"},

            # --- Soft delete (unassign preserves history) ---
            "is_active":        {"type": "boolean"},
        }
    },
    "settings": {
        "number_of_shards": 3,                               # Higher shard count: write-heavy
        "number_of_replicas": 1,
    }
}
```

The shard-distribution analysis for this index — including the rationale for keeping default `_id`-based routing rather than `routing=owner_user_id` — lives in slice 08.

---

## 2. Domain Models

```python
# repositories/es/models/assignment.py
from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, Field


class Assignment(BaseModel):
    assignment_id: str                                 # "{owner}#{contact}#{bin}"
    owner_user_id: str
    contact_id: str
    bin_id: str
    bin_name: str                                      # Denormalized
    bin_domain: str                                    # Denormalized
    bin_color_hex: str                                 # Denormalized
    affinity_weight: float = Field(default=1.0, ge=0.0, le=1.0)
    flick_velocity: float | None = None
    is_active: bool = True
    assigned_at: datetime
    updated_at: datetime


class AssignInput(BaseModel):
    owner_user_id: str
    contact_id: str
    bin_id: str
    flick_velocity: float | None = None               # From gesture controller


class UnassignInput(BaseModel):
    owner_user_id: str
    contact_id: str
    bin_id: str


class BinsForContactInput(BaseModel):
    owner_user_id: str
    contact_id: str
    include_inactive: bool = False
```

---

## 3. AssignmentRepository Contract

```python
class IAssignmentRepository(ABC):

    @abstractmethod
    async def assign(self, data: AssignInput) -> Assignment:
        """
        Upsert an assignment. Idempotent: assigning twice is a no-op (returns existing).
        Does NOT implicitly resurrect a soft-deleted assignment — see §5 below.
        Updates assignment_count on the bin document for new docs only.
        """

    @abstractmethod
    async def unassign(self, data: UnassignInput) -> None:
        """Soft-delete: sets is_active=False, preserves history.
        Decrements bin assignment_count.
        Raises AssignmentNotFoundError if no active assignment exists."""

    @abstractmethod
    async def update(
        self,
        owner_user_id: str,
        contact_id: str,
        bin_id: str,
        patch: dict,
    ) -> Assignment:
        """Explicit caller-controlled update. The ONLY path that may set is_active=True
        on a previously-inactive doc (the explicit resurrection rule, §5)."""

    @abstractmethod
    async def get_bins_for_contact(self, params: BinsForContactInput) -> list[Assignment]:
        """All bin assignments for a contact. Default: active only.
        Ordered by assigned_at DESC."""

    @abstractmethod
    async def get_contacts_for_bin(
        self, user_id: str, bin_id: str, limit: int, offset: int
    ) -> list[str]:
        """Returns list of contact_ids assigned to a bin (active only).
        Pagination: ordered by assigned_at DESC."""

    @abstractmethod
    async def get_by_bins(
        self,
        user_id: str,
        bin_ids: list[str],
        *,
        include_inactive: bool = False,
    ) -> list[Assignment]:
        """OR semantics over bin_ids. AND/intersection is NOT performed in the wrapper —
        callers (or slice 05 dynamic tribes) compose AND in the service layer."""

    @abstractmethod
    async def delete_by_bin(self, user_id: str, bin_id: str) -> int:
        """Hard delete all assignments for a bin. Returns count deleted.
        Cascade entry point — see slice 06."""

    @abstractmethod
    async def delete_by_contact(self, user_id: str, contact_id: str) -> int:
        """Hard delete all assignments for a contact. Returns count deleted.
        Cascade entry point — see slice 06."""

    @abstractmethod
    async def bulk_assign(
        self, user_id: str, assignments: list[AssignInput]
    ) -> BulkAssignResult:
        """Batch assign for staging deck multi-select. Atomic per item, not transactional.
        Bin assignment_count is NOT incremented in bulk (reconciliation in V1.5)."""
```

Public API regression guard: there is NO `assign_or_resurrect` convenience method (T-ASSIGN-044).

---

## 4. Deterministic `_id`

```
_id = f"{owner_user_id}#{contact_id}#{bin_id}"
```

Same triple → same `_id`. Two concurrent `assign(triple)` calls collapse to one upsert (T-ASSIGN-001..006). The concrete production form is the literal triple-with-`#` string; the test plan asserts SHA-256-truncated form for some scenarios (`sha256(owner + "#" + contact + "#" + bin)[:32]`). The slice-4 epic locks one form. Recommendation: literal triple — easier to debug, ES handles long `_id`s natively, no collision risk under V1 entity-count assumptions.

---

## 5. Soft-Delete + Resurrection Rule (Decision #1, 2026-04-27)

Soft-delete is `is_active=False`. The wrapper does NOT implicitly resurrect on `assign`. Resurrection requires an explicit caller-set `is_active=True` in an `update` payload.

| Scenario | Caller call | Wrapper behavior |
|---|---|---|
| Active doc, `assign` again | `repo.assign(o, c, b)` | No-op upsert; bin count unchanged |
| Inactive doc, `assign` again | `repo.assign(o, c, b)` | Doc remains `is_active=False`; bin count unchanged |
| Inactive doc, `update(is_active=True)` | `repo.update(o, c, b, {"is_active": True})` | Doc becomes active; bin count incremented |
| Active doc, `update` no `is_active` field | `repo.update(o, c, b, {"affinity_weight": 0.5})` | `is_active` unchanged |
| Active doc, `update(is_active=False)` | `repo.update(o, c, b, {"is_active": False})` | Doc becomes inactive; bin count decremented (consistent with `unassign`) |

This rule is enforced by code review and by T-ASSIGN-040..044 (slice 04 tests).

---

## 6. Denormalized Fields

On `assign`, the wrapper denormalizes `bin_name`, `bin_domain`, `bin_color_hex` from the bin doc into the assignment doc. This avoids a join on every read of an assignment list.

**Drift contract.** When a bin is renamed or its color changes, existing assignment docs carry stale denormalized values until the cascade-cleanup sweep reconciles them (max 5 minutes — see slice 06). V1 explicitly accepts this drift window.

`affinity_weight` and `flick_velocity` are written as provided. The wrapper does NOT clamp them; clamping is a service-layer concern (T-ASSIGN-082).

---

## 7. Write Internals

### `assign`

```python
# Deterministic _id: enables idempotency and upsert semantics
assignment_id = f"{data.owner_user_id}#{data.contact_id}#{data.bin_id}"

# Fetch bin for denormalized fields (raises BinNotFoundError if missing)
bin_doc = await self.bin_repo.get_by_id(data.owner_user_id, data.bin_id)
if not bin_doc:
    raise BinNotFoundError(data.bin_id)

# Compute affinity_weight from flick velocity (V1: default 1.0; V1.5: derived)
affinity_weight = compute_affinity_weight(data.flick_velocity)   # 1.0 in V1

doc = {
    "assignment_id":  assignment_id,
    "owner_user_id":  data.owner_user_id,
    "contact_id":     data.contact_id,
    "bin_id":         data.bin_id,
    "bin_name":       bin_doc.name,
    "bin_domain":     bin_doc.domain,
    "bin_color_hex":  bin_doc.color_hex,
    "affinity_weight": affinity_weight,
    "flick_velocity": data.flick_velocity,
    "is_active":      True,
    "assigned_at":    utcnow(),
    "updated_at":     utcnow(),
}

# Upsert — refresh=False per slice 07 contract
response = await self.client.update(
    index=self.config.assignments_index,
    id=assignment_id,
    doc=doc,
    doc_as_upsert=True,
    # NOTE: this is the cold path; the resurrection rule is enforced by NOT
    # setting is_active=True for an existing inactive doc — see §5
)

# Increment bin counter only if this is a NEW doc
if response["result"] == "created":
    await self.bin_repo.increment_assignment_count(data.bin_id, +1)

return Assignment(**doc)
```

### `unassign` (soft delete)

```python
assignment_id = f"{data.owner_user_id}#{data.contact_id}#{data.bin_id}"

# Verify assignment exists and is active
try:
    current = await self.client.get(
        index=self.config.assignments_index, id=assignment_id
    )
except NotFoundError:
    raise AssignmentNotFoundError(assignment_id)

if not current["_source"]["is_active"]:
    raise AssignmentNotFoundError(f"{assignment_id} is already inactive")

# Soft delete
await self.client.update(
    index=self.config.assignments_index,
    id=assignment_id,
    doc={"is_active": False, "updated_at": utcnow()},
)

# Decrement bin counter
await self.bin_repo.increment_assignment_count(data.bin_id, -1)
```

### `delete_by_bin` / `delete_by_contact` (cascade entry points)

```python
response = await self.client.delete_by_query(
    index=self.config.assignments_index,
    body={
        "query": {"bool": {"filter": [
            {"term": {"owner_user_id": user_id}},
            {"term": {"bin_id": bin_id}},     # or contact_id for delete_by_contact
        ]}}
    },
    wait_for_completion=True,
    refresh=True,
)
return response["deleted"]
```

These are hard deletes (not soft-delete) because they only run as cascades from a primary delete (bin or contact). Cascade orchestration and pending-job retry on partial failure live in slice 06.

### `bulk_assign`

```python
results = BulkAssignResult(succeeded=[], failed=[])

operations = []
for item in assignments:
    assignment_id = f"{item.owner_user_id}#{item.contact_id}#{item.bin_id}"
    operations.extend([
        {"update": {"_index": self.config.assignments_index, "_id": assignment_id}},
        {"doc": build_assignment_doc(item), "doc_as_upsert": True},
    ])

response = await self.client.bulk(operations=operations)

for i, result in enumerate(response["items"]):
    if "error" in result["update"]:
        results.failed.append({"input": assignments[i], "error": result["update"]["error"]})
    else:
        results.succeeded.append(assignments[i])
        # Note: bin.assignment_count not incremented in bulk for performance.
        # A background reconciliation job (V1.5) recomputes counts from assignments.

return results
```

---

## 8. `get_by_bins` — OR Semantics

```json
// Query tribes_assignments index:
{
  "query": {
    "bool": {
      "filter": [
        {"term": {"owner_user_id": "<user_id>"}},
        {"terms": {"bin_id": ["<bin_id_1>", "<bin_id_2>"]}},
        {"term": {"is_active": true}}      // omitted if include_inactive=True
      ]
    }
  },
  "_source": ["contact_id"],
  "collapse": {"field": "contact_id"},
  "size": <limit>,
  "from": <offset>
}
// Then fetch full Contact docs by IDs via mget — see slice 08 for cursor + perf
```

`get_by_bins` accepts an empty `bin_ids` list as either an empty result or a `ValueError` per the documented contract — slice-4 epic locks one and the test asserts it (T-ASSIGN-062). AND-semantics intersection is composed at the service layer; the wrapper exposes only OR (T-ASSIGN-065 regression guard).

Pagination cursor stability for this query is owned by slice 08.

---

## 9. Stories (Reference)

From spec §13:

- **Story 9: Assignment Domain Model & AssignmentRepository — assign/unassign** — domain model, `assign`, `unassign`, deterministic `_id`, idempotency, resurrection rule.
- **Story 10: AssignmentRepository — Queries & Bulk** — `get_bins_for_contact`, `get_contacts_for_bin`, `delete_by_bin`, `delete_by_contact`, `bulk_assign`.

The `get_by_bins` interface method has its query-pattern coverage in slice 08; this slice owns the OR-semantics regression guard and the wrapper-side method shape.

---

Pairs with `04-assignments-tests.md`.
