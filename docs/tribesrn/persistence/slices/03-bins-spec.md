# Slice 3 — Bins: Spec

> **Read `00-shared-context.md` FIRST.** This slice assumes the V1 decisions, vector inventory, refresh contract, perf baselines, naming conventions, and glossary are already in context. Do not re-state them here.

## Related slices

Depends on **slice 01 (Foundation)** for the ES client, config, base error contract, and `tribes_bins` index bootstrap.

Forward references:
- Slice 04 (Assignments) — denormalizes `bin_name`, `bin_domain`, `bin_color_hex` from this slice's `Bin` doc.
- Slice 06 (Cascade) — bin rename queues `reconcile_bin_name`/`reconcile_bin_color` pending jobs that fan out to assignments; bin delete cascades to assignments.
- Slice 07 (Consistency) — `BinRepository.create`, `upsert`, and `rename` (old-doc delete) are on the `wait_for` exception list.
- Slice 08 (Read Path) — `list_for_user` ordering, cross-user `terms` aggregation on `normalized_name`.

---

## 1. `tribes_bins` Mapping

One document per **label/bin** owned by a user. Bins belong to exactly one user; community bins are V2.

```python
BINS_MAPPING = {
    "mappings": {
        "dynamic": "strict",
        "properties": {
            "bin_id":           {"type": "keyword"},
            "owner_user_id":    {"type": "keyword"},

            "name":             {"type": "keyword"},          # Exact match; display name
            "name_search":      {"type": "text",
                                 "analyzer": "standard"},     # For search-by-label-name
            "normalized_name":  {                              # See §2 below — V1 lexical normalization
                "type": "keyword",
                "doc_values": True,
                "fields": {
                    "text": {"type": "text", "analyzer": "standard"}
                }
            },
            "domain":           {"type": "keyword"},          # "helpers_fixers" | "activity_partners"
                                                              # | "life_teachers" | "social_connectors"
                                                              # | "home_team" | "custom"
            "color_hex":        {"type": "keyword"},          # "#4A90E2"
            "emoji":            {"type": "keyword"},          # Optional "🏔️"
            "is_default":       {"type": "boolean"},          # True = system-provided starter
            "is_negative":      {"type": "boolean"},          # True = private exclusion bin
            "sort_order":       {"type": "integer"},          # User-defined display order

            # --- Agentic rule (stored here, evaluated in service layer V1) ---
            "rule_type":        {"type": "keyword"},          # null | "time_based" | "threshold"
            "rule_config":      {"type": "object",
                                 "enabled": False},           # Raw JSON, opaque to ES

            "created_at":       {"type": "date"},
            "updated_at":       {"type": "date"},
            "assignment_count": {"type": "integer"},          # Denormalized; updated on assign/unassign
        }
    },
    "settings": {
        "number_of_shards": 3,
        "number_of_replicas": 1,
    }
}
```

**Note:** Foundation epic locks shard count at 3 (matches test plan T-MAP-027 and shard-distribution slice 08).

---

## 2. V1 Lexical Normalization (`normalized_name`)

**Purpose.** Enable cross-user aggregation queries that collapse spelling, case, punctuation, and morphological variants of the same English root (e.g., "Hiking", "hike", "HIKERS!" all → `"hike"` or `"hiker"` stem). Conceptual synonymy across distinct stems is deferred to V2.

### Algorithm — exact transformation pipeline

1. **NFKC normalize** — `unicodedata.normalize('NFKC', text)` (decomposes ligatures, superscripts).
2. **Case fold** — `text.casefold()` (handles `ß` → `ss`, etc).
3. **Strip leading/trailing whitespace** — `text.strip()`.
4. **Strip punctuation and symbols** — remove all chars where `unicodedata.category(ch)` starts with `"P"` (Punctuation: `Pc`, `Pd`, `Pe`, `Pf`, `Pi`, `Po`, `Ps`) OR `"S"` (Symbol: `Sc`, `Sk`, `Sm`, `So`).

   The `S` category strip handles emoji (`So` — Symbol Other), currency symbols (`Sc`), math symbols (`Sm`), and modifier symbols (`Sk`). Without it, emoji like 🏔 would survive through to stemming and produce non-deterministic stem outputs depending on the stemmer's tokenization behavior.
5. **Collapse internal whitespace** — `re.sub(r'\s+', ' ', text)` then strip again.
6. **Tokenize** — `text.split()`.
7. **Stem each token** — `nltk.stem.SnowballStemmer('english').stem(token)`.
8. **Rejoin** — `" ".join(stemmed_tokens)`.

```python
import unicodedata, re
from nltk.stem import SnowballStemmer

_stemmer = SnowballStemmer('english')

def normalize_bin_name(name: str) -> str:
    text = unicodedata.normalize('NFKC', name)
    text = text.casefold()
    text = text.strip()
    text = ''.join(
        ch for ch in text
        if not (unicodedata.category(ch).startswith('P')
                or unicodedata.category(ch).startswith('S'))
    )
    text = re.sub(r'\s+', ' ', text).strip()
    tokens = text.split()
    stemmed = [_stemmer.stem(token) for token in tokens]
    return ' '.join(stemmed)
```

### Examples

| Raw `name` | `normalized_name` |
|---|---|
| `"Hiking!"` | `"hike"` |
| `"Hike Crew"` | `"hike crew"` |
| `"HIKERS 🏔"` | `"hiker"` |
| `"  mountain   biking  "` | `"mountain bike"` |
| `"Café Runners"` | `"café runner"` |

### Field specification

| Property | Value |
|---|---|
| Field name | `normalized_name` |
| Field type | `keyword` |
| `doc_values` | `true` (required for `terms` aggregations) |
| `index` | `true` |
| Subfield | `normalized_name.text` — type `text`, analyzer `standard` (optional, cheap to add) |
| Computed at | Write time, synchronously, in the repository layer. |
| Recompute trigger | MUST be recomputed whenever `name` changes. |

**Repository contract:** `normalized_name` is always derived from `name` at write time. Callers MUST NOT set it directly. The repository `upsert` is the single enforcement point.

### V1 boundaries — what lexical normalization does NOT solve

| Query Type | Example | Status |
|---|---|---|
| Conceptual synonymy across distinct stems | `"Hiking"` ↔ `"Walking"` | Deferred to V2 |
| Multi-word concept clustering | `"Outdoor adventures"` ↔ `"Mountain trips"` | Deferred to V2 |
| Cross-language matching | `"Randonnée"` ↔ `"Hiking"` | Deferred to V2 |
| Graph traversal / social proximity | "Most avid hiker within 5 degrees" | Deferred to V2 |

The cross-user aggregation enabled by `normalized_name` is exercised in slice 08.

---

## 3. Domain Models

```python
# repositories/es/models/bin.py
from __future__ import annotations
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


DomainType = Literal[
    "helpers_fixers",
    "activity_partners",
    "life_teachers",
    "social_connectors",
    "home_team",
    "custom",
]


class Bin(BaseModel):
    bin_id: str
    owner_user_id: str
    name: str
    domain: DomainType
    color_hex: str
    emoji: str | None = None
    is_default: bool = False
    is_negative: bool = False
    sort_order: int = 0
    rule_type: Literal["time_based", "threshold"] | None = None
    rule_config: dict | None = None
    assignment_count: int = 0
    created_at: datetime
    updated_at: datetime


class BinCreateInput(BaseModel):
    owner_user_id: str
    name: str
    domain: DomainType
    color_hex: str
    emoji: str | None = None
    is_negative: bool = False
    sort_order: int = 0


class BinUpdateInput(BaseModel):
    name: str | None = None
    color_hex: str | None = None
    emoji: str | None = None
    sort_order: int | None = None
    rule_type: Literal["time_based", "threshold"] | None = None
    rule_config: dict | None = None
```

---

## 4. BinRepository Contract

```python
class IBinRepository(ABC):

    @abstractmethod
    async def create(self, data: BinCreateInput) -> Bin:
        """Create a new bin. Enforces uniqueness of (owner_user_id, name) via Safeguard A + B."""

    @abstractmethod
    async def get_by_id(self, user_id: str, bin_id: str) -> Bin | None:
        """Fetch single bin. Returns None if missing; raises BinOwnershipError on mismatch."""

    @abstractmethod
    async def list_for_user(
        self,
        user_id: str,
        domain: str | None = None,
        include_negative: bool = False,
    ) -> list[Bin]:
        """All bins owned by user, optionally filtered by domain.
        Ordered by sort_order ASC, then created_at ASC. Excludes negative bins by default."""

    @abstractmethod
    async def update(self, user_id: str, bin_id: str, data: BinUpdateInput) -> Bin:
        """Partial update. Raises BinNotFoundError or BinOwnershipError.
        Name change triggers rename mechanics (see §6) and queues a pending job for
        denormalization refresh on assignments — see slice 06."""

    @abstractmethod
    async def delete(self, user_id: str, bin_id: str) -> None:
        """Delete bin and all its assignments (cascade owned by slice 06)."""

    @abstractmethod
    async def seed_defaults(self, user_id: str, domains: list[str]) -> list[Bin]:
        """Idempotent default-label seeding for onboarding."""

    @abstractmethod
    async def increment_assignment_count(
        self, bin_id: str, delta: int
    ) -> None:
        """Atomic Painless update. delta=+1 (assign) or -1 (unassign).
        Drift acceptable per V1 contract — see slice 07."""
```

---

## 5. Bin Name Conflict — Layered Safeguards

A read-then-write uniqueness check cannot prevent two concurrent writers from both passing the check and indexing duplicate bin names. Two safeguards run in production.

### Safeguard A — Deterministic `_id`

```
_id = sha256("{owner_user_id}#{slug(name)}")[:32]
```

`slug(name)`: lowercase, NFC-normalized, whitespace collapsed to single space, trimmed. The slug algorithm MUST be documented and stable — any change is breaking and requires reindex.

Two concurrent writes for the same owner/name produce the same `_id`. ES serializes writes to the same `_id` on the same shard. The second becomes a last-writer-wins upsert. No duplicate document.

Caveat: only protects against name strings that slug-equal. "Friends" vs "Friendss" remain distinct (correct). On rename, the old `_id` MUST be hard-deleted and a new document created — rename is NOT an in-place field update.

### Safeguard B — Post-Write Verification

After `index` returns success:

1. `search` on `tribes_bins` with `refresh="wait_for"` filtered by `term: {owner_user_id}` + `term: {slug_name}`.
2. Assert `hits.total.value == 1`.
3. If `> 1` (transition window or belt-and-suspenders): sort by `_id` lexicographically ascending. Lowest `_id` survives. Others hard-deleted by `_id`. Return `BinNameConflictError` to the caller — do NOT silently succeed.
4. If `== 0`: raise `BinWriteVerificationError`. Log at ERROR level.

`BinNameConflictError` carries the surviving `bin_id` so the caller can re-fetch.

In tests, Safeguard B verifies that A is working correctly (slice 03 tests T-BIN-CONFLICT-A-* and T-BIN-CONFLICT-B-*).

---

## 6. Write Internals

### `create`

```python
# Compute deterministic _id
slug = _slug(data.name)
bin_id = _hash_id(data.owner_user_id, slug)

doc = {
    "bin_id":           bin_id,
    "owner_user_id":    data.owner_user_id,
    "name":             data.name,
    "name_search":      data.name.lower(),
    "normalized_name":  normalize_bin_name(data.name),   # See §2
    "domain":           data.domain,
    "color_hex":        data.color_hex,
    "emoji":            data.emoji,
    "is_default":       False,
    "is_negative":      data.is_negative,
    "sort_order":       data.sort_order,
    "assignment_count": 0,
    "created_at":       utcnow(),
    "updated_at":       utcnow(),
}

await self.client.index(
    index=self.config.bins_index,
    id=bin_id,
    document=doc,
    refresh="wait_for",   # Per refresh contract — Safeguard B issues a search next
)

# Safeguard B post-write verification
await self._verify_unique(owner_user_id=data.owner_user_id, slug=slug)

return Bin(**doc)
```

### `update` (partial)

```python
update_fields = data.model_dump(exclude_none=True)
update_fields["updated_at"] = utcnow()

if "name" in update_fields:
    # Name change is a rename — see §7
    return await self._rename(user_id, bin_id, new_name=update_fields["name"])

if "name" in update_fields:  # unreachable; rename returns above
    update_fields["name_search"]    = update_fields["name"].lower()
    update_fields["normalized_name"] = normalize_bin_name(update_fields["name"])

try:
    await self.client.update(
        index=self.config.bins_index,
        id=bin_id,
        doc=update_fields,
        # refresh=False (default) for non-name updates per slice 07
    )
except NotFoundError:
    raise BinNotFoundError(bin_id)

# color_hex change → enqueue reconcile_bin_color pending job (see slice 06)
if "color_hex" in update_fields:
    await self._enqueue_reconcile(bin_id, "reconcile_bin_color")

return await self.get_by_id(user_id, bin_id)
```

### `delete`

```python
# Ownership check first
await self.get_by_id(user_id, bin_id)

# Hard delete the bin doc (refresh=False)
try:
    await self.client.delete(index=self.config.bins_index, id=bin_id)
except NotFoundError:
    raise BinNotFoundError(bin_id)

# Cascade ownership: caller (or service layer) invokes
# AssignmentRepository.delete_by_bin (slice 04) or queues a pending job (slice 06).
```

### `seed_defaults`

```python
DEFAULT_LABELS: dict[str, list[dict]] = {
    "helpers_fixers": [
        {"name": "Handyman",    "color_hex": "#E67E22", "emoji": "🔧"},
        {"name": "Tech support","color_hex": "#E67E22", "emoji": "💻"},
        # ... all 12 labels — see Appendix A in slice 01 / shared-context
    ],
    # ... other domains
}

operations = []
for domain in domains:
    for label in DEFAULT_LABELS.get(domain, []):
        bin_id = f"{user_id}#{domain}#{slugify(label['name'])}"   # Deterministic upsert _id
        doc = build_bin_doc(user_id, bin_id, domain, label)
        operations.extend([
            {"update": {"_index": self.config.bins_index, "_id": bin_id}},
            {"doc": doc, "doc_as_upsert": True},
        ])

if operations:
    await self.client.bulk(operations=operations)

return await self.list_for_user(user_id)
```

Idempotent — calling twice does not create duplicates because of the deterministic `_id`.

### `increment_assignment_count` (atomic Painless script)

```python
await self.client.update(
    index=self.config.bins_index,
    id=bin_id,
    script={
        "source": "ctx._source.assignment_count = Math.max(0, ctx._source.assignment_count + params.delta)",
        "lang": "painless",
        "params": {"delta": delta},   # +1 or -1
    },
    retry_on_conflict=3,               # Retry on optimistic lock conflict
)
```

The `Math.max(0, ...)` clamp guarantees the counter never goes negative even under concurrent decrement. Drift tolerance is locked in slice 07 (T-DRIFT-*).

---

## 7. Rename Mechanics

Rename is NOT an in-place field update. The deterministic `_id` is a function of the slug; changing the name changes the `_id`. The repository must:

1. Read the existing doc (preserves `assignment_count`, `color_hex`, `domain`, `created_at`).
2. Compute the new `_id` from `(owner_user_id, slug(new_name))`.
3. Write a new doc at the new `_id` (subject to Safeguard A + B; collisions raise `BinNameConflictError` and the loser is reaped per Safeguard B).
4. Hard-delete the old doc. **This delete uses `refresh="wait_for"`** so Safeguard B's post-write verification on the new doc sees the absence of the old (per shared-context exception list).
5. Enqueue a pending job in `tribes_pending_jobs`:
   - `op_type = "reconcile_bin_name"`
   - `primary_id = bin_id`
   - `target_index = "tribes_assignments"`
   - `query_dsl = { "term": { "bin_id": <bin_id> } }` with a `script` payload that updates the denormalized `bin_name` field.

   A separate pending job (`op_type = "reconcile_bin_color"`) is enqueued when `color_hex` changes. Both run via the standard 5-minute sweep cadence. Maximum staleness window for denormalized `bin_name` and `bin_color_hex` on assignments: **5 minutes**.

The pending-jobs write protocol and sweep lifecycle are fully specified in slice 06.

---

## 8. Stories (Reference)

From spec §13:

- **Story 7: Bin Domain Model & BinRepository — CRUD** — `create`, `get_by_id`, `list_for_user`, `update`, `delete`, `increment_assignment_count`, Safeguard A + B.
- **Story 8: BinRepository — Seed Defaults (Onboarding)** — bulk-upsert path with deterministic `_id`s.

The cross-user `terms` aggregation on `normalized_name` is exercised in slice 08; this slice owns the field's existence and write-time derivation.

---

Pairs with `03-bins-tests.md`.
