# Slice 5 — Tribes: Spec

> **Read `00-shared-context.md` FIRST.** This slice assumes the V1 decisions, vector inventory, refresh contract, perf baselines, naming conventions, and glossary are already in context. Do not re-state them here.

## Related slices

Depends on:
- **Slice 01 (Foundation)** — ES client, error contract, lifecycle.
- **Slice 02 (Contacts)** — `Contact` model and `get_by_bins` query for dynamic tribe member resolution; `Contact` `mget` for static tribe member resolution.
- **Slice 03 (Bins)** — bin ownership validation for `query_bin_ids`.
- **Slice 04 (Assignments)** — dynamic tribe queries execute against `tribes_assignments`.

Forward references:
- Slice 06 (Cascade) — `delete` does NOT cascade to contacts/bins/assignments. This is explicit (T-CASCADE-031).
- Slice 07 (Consistency) — all tribe writes use `refresh=False`.
- Slice 08 (Read Path) — preview / resolve member-list pagination.

---

## 1. `tribes_tribes` Mapping

One document per **tribe** (the unit of coordination). Static tribes store explicit member lists; dynamic tribes store a `TribeQuery` that gets executed against `tribes_assignments` at read time.

```python
TRIBES_MAPPING = {
    "mappings": {
        "dynamic": "strict",
        "properties": {
            "tribe_id":         {"type": "keyword"},
            "owner_user_id":    {"type": "keyword"},
            "name":             {"type": "keyword"},
            "emoji":            {"type": "keyword"},
            "color_hex":        {"type": "keyword"},
            "tribe_type":       {"type": "keyword"},          # "static" | "dynamic"

            # --- Static tribe ---
            "member_contact_ids": {"type": "keyword"},        # Array of contact_ids

            # --- Dynamic tribe (stored query) ---
            "query_bin_ids":    {"type": "keyword"},          # Bins that define membership
            "query_operator":   {"type": "keyword"},          # "AND" | "OR"
            "query_city_filter": {"type": "keyword"},         # Optional city restriction
            "query_domain_filter": {"type": "keyword"},       # Optional domain filter

            # --- Metadata ---
            "created_at":       {"type": "date"},
            "updated_at":       {"type": "date"},
            "last_coordination_at": {"type": "date"},
            "member_count_cached": {"type": "integer"},       # Refreshed on read
        }
    },
    "settings": {
        "number_of_shards": 1,
        "number_of_replicas": 1,
    }
}
```

> Field-name discrepancy: the test plan references `member_user_ids`. Foundation/slice-5 epic locks `member_contact_ids` (matches spec, the domain glossary, and the model below). Same applies to test plan `query_operator` values `"any"`/`"all"` vs spec `"OR"`/`"AND"` — slice-5 epic locks `"OR"`/`"AND"`.

---

## 2. Domain Models

```python
# repositories/es/models/tribe.py
from __future__ import annotations
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class TribeQuery(BaseModel):
    bin_ids: list[str]
    operator: Literal["AND", "OR"] = "OR"
    city_filter: str | None = None
    domain_filter: str | None = None


class Tribe(BaseModel):
    tribe_id: str
    owner_user_id: str
    name: str
    emoji: str | None = None
    color_hex: str
    tribe_type: Literal["static", "dynamic"]
    member_contact_ids: list[str] = Field(default_factory=list)   # Static only
    query: TribeQuery | None = None                               # Dynamic only
    member_count_cached: int = 0
    created_at: datetime
    updated_at: datetime
    last_coordination_at: datetime | None = None


class TribeCreateInput(BaseModel):
    owner_user_id: str
    name: str
    emoji: str | None = None
    color_hex: str
    tribe_type: Literal["static", "dynamic"]
    member_contact_ids: list[str] | None = None
    query: TribeQuery | None = None


class TribeMemberPage(BaseModel):
    tribe_id: str
    contacts: list[Contact]                            # Resolved at query time
    total: int
```

---

## 3. TribeRepository Contract

```python
class ITribeRepository(ABC):

    @abstractmethod
    async def create(self, data: TribeCreateInput) -> Tribe:
        """Create tribe. Validates: static requires member_contact_ids,
        dynamic requires query and ALL query.bin_ids must be owned by the user.
        Static tribe with query_bin_ids set is rejected (InvalidTribeShapeError).
        Dynamic tribe with member_contact_ids set is rejected."""

    @abstractmethod
    async def get_by_id(self, user_id: str, tribe_id: str) -> Tribe | None:
        """Fetch tribe metadata (not members)."""

    @abstractmethod
    async def list_for_user(self, user_id: str) -> list[Tribe]:
        """All tribes owned by user, ordered by last_coordination_at DESC,
        then created_at DESC."""

    @abstractmethod
    async def resolve_members(
        self, user_id: str, tribe_id: str, limit: int, offset: int
    ) -> TribeMemberPage:
        """For static: fetch contacts by member_contact_ids (mget).
        For dynamic: execute stored TribeQuery against tribes_assignments,
        then fetch matching contacts.
        Updates member_count_cached on the tribe document (best-effort)."""

    @abstractmethod
    async def preview_query(
        self, user_id: str, query: TribeQuery, limit: int
    ) -> TribeMemberPage:
        """Execute a TribeQuery without saving it. Used for real-time tribe preview
        in the tribe builder UI. Returns matching contacts + total count.
        Read-only — does NOT write to any tribe doc."""

    @abstractmethod
    async def update(self, user_id: str, tribe_id: str, data: dict) -> Tribe:
        """Partial update for name, emoji, color, query, or member list.
        Updates `member_count_cached` on every static-member mutation."""

    @abstractmethod
    async def delete(self, user_id: str, tribe_id: str) -> None:
        """Delete tribe document. Does NOT delete contacts or bins. No cascade."""
```

---

## 4. Static vs Dynamic — Type Shape Rules

| Tribe type | Required | Forbidden |
|---|---|---|
| `static` | `member_contact_ids` (non-empty list) | `query_*` fields (raises `InvalidTribeShapeError`) |
| `dynamic` | `query` (with `bin_ids` non-empty); all `bin_ids` owned by user | `member_contact_ids` (raises `InvalidTribeShapeError`) |

`InvalidTribeShapeError` is raised on:
- `create_static(..., query_bin_ids=...)` — T-TRIBE-017.
- `create_dynamic(..., member_user_ids=...)` — T-TRIBE-018.
- `resolve_dynamic_members(static_tribe_id)` — T-FAIL-013.

`TribeQueryInvalidError` (separate exception) is raised when a dynamic tribe references `bin_ids` not owned by the user.

---

## 5. Write Internals

### `create`

```python
# Validate type-shape constraints
if data.tribe_type == "static" and not data.member_contact_ids:
    raise InvalidTribeShapeError("Static tribe requires member_contact_ids")
if data.tribe_type == "dynamic" and not data.query:
    raise InvalidTribeShapeError("Dynamic tribe requires query")
if data.tribe_type == "static" and data.query:
    raise InvalidTribeShapeError("Static tribe must not carry a query")
if data.tribe_type == "dynamic" and data.member_contact_ids:
    raise InvalidTribeShapeError("Dynamic tribe must not carry member_contact_ids")

# For dynamic tribes, validate every bin_id is owned by user
if data.query:
    for bin_id in data.query.bin_ids:
        bin_doc = await self.bin_repo.get_by_id(data.owner_user_id, bin_id)
        if not bin_doc:
            raise TribeQueryInvalidError(f"Bin {bin_id} not found or not owned by user")

tribe_id = str(uuid4())
doc = {
    "tribe_id":              tribe_id,
    "owner_user_id":         data.owner_user_id,
    "name":                  data.name,
    "emoji":                 data.emoji,
    "color_hex":             data.color_hex,
    "tribe_type":            data.tribe_type,
    "member_contact_ids":    list(set(data.member_contact_ids or [])),  # Dedup on write
    "query_bin_ids":         data.query.bin_ids if data.query else [],
    "query_operator":        data.query.operator if data.query else None,
    "query_city_filter":     data.query.city_filter if data.query else None,
    "query_domain_filter":   data.query.domain_filter if data.query else None,
    "member_count_cached":   len(data.member_contact_ids or []),
    "created_at":            utcnow(),
    "updated_at":            utcnow(),
    "last_coordination_at":  None,
}

await self.client.index(
    index=self.config.tribes_index,
    id=tribe_id,
    document=doc,
    # refresh=False per slice 07 contract
)
return Tribe(**doc)
```

### `update` (partial, any fields)

```python
update_fields = {k: v for k, v in data.items() if v is not None}
update_fields["updated_at"] = utcnow()

# If member_contact_ids mutates, recompute member_count_cached
if "member_contact_ids" in update_fields:
    update_fields["member_count_cached"] = len(set(update_fields["member_contact_ids"]))

try:
    await self.client.update(
        index=self.config.tribes_index,
        id=tribe_id,
        doc=update_fields,
    )
except NotFoundError:
    raise TribeNotFoundError(tribe_id)

return await self.get_by_id(user_id, tribe_id)
```

### `delete`

```python
# Ownership check
await self.get_by_id(user_id, tribe_id)   # Raises TribeNotFoundError if missing

await self.client.delete(index=self.config.tribes_index, id=tribe_id)
# Note: does NOT delete contacts, bins, or assignments. No cascade. No pending job.
```

### `resolve_members` — dynamic path

```python
# Step 1: Execute TribeQuery (delegates to ContactRepository.get_by_bins, slice 02 + slice 08)
members = await self.contact_repo.get_by_bins(ContactsByBinsInput(
    owner_user_id=user_id,
    bin_ids=tribe.query.bin_ids,
    operator=tribe.query.operator,
    city_filter=tribe.query.city_filter,
    limit=limit,
    offset=offset,
))

# Step 2: Update cached count (best-effort, not critical path)
await self.client.update(
    index=self.config.tribes_index,
    id=tribe_id,
    doc={"member_count_cached": members.total, "updated_at": utcnow()},
)

return TribeMemberPage(tribe_id=tribe_id, contacts=members.contacts, total=members.total)
```

For static tribes, `resolve_members` issues an `mget` against `tribes_contacts` keyed on `member_contact_ids`.

### `preview_query`

Same query execution as `resolve_members` (dynamic path) but without saving and without updating `member_count_cached`. Returns first 10 contacts + total count for the tribe builder UI. Side-effect-free (T-TRIBE-016).

---

## 6. `query_*` Field Semantics

The dynamic-tribe `TribeQuery` stored on the doc has four operative fields:

| Field | Effect at resolve time |
|---|---|
| `query_bin_ids` | The set of bins membership is computed from. |
| `query_operator` | `"OR"` (union) or `"AND"` (intersection). The wrapper exposes only OR via `AssignmentRepository.get_by_bins`; AND is composed at the service layer (T-TRIBE-012 explicitly notes the wrapper exposes the building blocks). |
| `query_city_filter` | Narrows results to contacts whose `city` matches. |
| `query_domain_filter` | Narrows by bin `domain` (e.g., `"home_team"`). |

`member_count_cached` is updated on every static-member mutation (T-TRIBE-004) and on every dynamic `resolve_members` call (T-TRIBE-015). It is NOT updated by `preview_query` (T-TRIBE-016).

---

## 7. Stories (Reference)

From spec §13:

- **Story 11: Tribe Domain Model & TribeRepository — Static Tribes** — domain model, `create` (static), `get_by_id`, `list_for_user`, `update`, `delete`, `resolve_members` (static path).
- **Story 12: TribeRepository — Dynamic Tribes & Query Preview** — `create` (dynamic), `resolve_members` (dynamic path), `preview_query`.

---

Pairs with `05-tribes-tests.md`.
