# Elasticsearch Wrapper — Technical Specification

**Project:** Tribes
**Author:** Architecture session (Winston / Mary / John / Barry)
**Date:** 2026-03-28
**Status:** Ready for story breakdown
**Backend stack:** Python 3.12 · FastAPI · elasticsearch-py 8.x (async)
**Fits into:** `tribes-api/app/repositories/` (existing architecture layer)

---

## 1. Goals & Non-Goals

### Goals
- Hide all Elasticsearch DSL behind strongly-typed Python interfaces
- Callers (service layer) never import `elasticsearch` directly
- All query inputs are Pydantic v2 models; all outputs are domain types
- Index mappings, field names, boost values, and query shapes are internal details
- Full async throughout (`AsyncElasticsearch`)

### Non-Goals (V1)
- Community `certaintyWeight` aggregation (V2)
- Agentic bin rule evaluation (V2)
- Vector / semantic similarity search (V2)
- Multi-hop graph traversal (ArangoDB / V2)
- Offline sync / conflict resolution

---

## Decisions Captured (Session 2026-04-27)

| # | Topic | Decision |
|---|---|---|
| 1 | Assignment upsert resurrection | Caller explicitly sets `is_active=True` in update payload; wrapper performs no implicit resurrection. |
| 2 | `assignment_count` drift | V1 accepts rough counts. Verify the count never gates control flow (delete/hide); if it does, escalate. |
| 3 | Cross-index cascade cleanup | Failed cascades logged to `tribes_pending_jobs` index; 5-min sweep retries. |
| 4 | Identity merge | Field-level union rules with `import_idempotency_token` and append-only `merge_audit`. |
| 5 | Bin name conflict | Layered: deterministic `_id` (Safeguard A) + post-write verification with `wait_for` (Safeguard B). |
| 6 | Denormalization strategy V1 | Lexical normalization only (Snowball stemmer). Canonical embedding layer deferred to V2. |
| 7 | Refresh contract | `refresh=False` default; `wait_for` exception list defined for specific writes. |
| 8 | Shard distribution | Keep default `_id`-based routing for V1. Revisit at >10 shards or >50k docs/user. |
| 9 | V2 architecture | ES + ArangoDB. Canonical embedding (`tribes_canonical_labels`) + bounded BFS in ArangoDB. |

---

## 2. Module Layout

```
tribes-api/app/repositories/
├── __init__.py
├── es/
│   ├── __init__.py
│   ├── client.py              # Connection factory, singleton
│   ├── config.py              # Index names, ES settings from env
│   ├── exceptions.py          # Domain exceptions (no ES types leak out)
│   ├── indices/
│   │   ├── contacts.py        # Index mapping definition
│   │   ├── bins.py
│   │   ├── assignments.py
│   │   └── tribes.py
│   ├── models/
│   │   ├── contact.py         # Pydantic domain models
│   │   ├── bin.py
│   │   ├── assignment.py
│   │   └── tribe.py
│   ├── repositories/
│   │   ├── base.py            # BaseRepository abstract class
│   │   ├── contact_repo.py
│   │   ├── bin_repo.py
│   │   ├── assignment_repo.py
│   │   └── tribe_repo.py
│   └── identity/
│       ├── resolver.py        # Identity resolution logic
│       └── blocking.py        # Blocking key generation
└── interfaces.py              # Abstract protocols (service layer imports these only)
```

---

## 3. Index Designs

### V1 Vector Field Inventory

V1 contains NO `dense_vector` fields. All four V1 indices (`tribes_contacts`, `tribes_bins`, `tribes_assignments`, `tribes_tribes`) and the operational `tribes_pending_jobs` index use only scalar, keyword, text, nested, date, integer, float, and object field types.

The single `dense_vector` field in the system (`tribes_canonical_labels.embedding`, 768 dims, cosine similarity, HNSW-indexed) belongs to V2 only — see §16 (V2 Architecture).

V1 implementations MUST NOT introduce `dense_vector` fields. If vector search is needed earlier than V2 ship, that decision triggers a spec amendment, not an opportunistic addition.

### 3.1 `tribes_contacts`

One document per **resolved contact entity** (post-deduplication). A single real-world person may have been imported by multiple users; each import creates a `tribes_assignments` record pointing to this document.

```python
CONTACTS_MAPPING = {
    "mappings": {
        "dynamic": "strict",
        "properties": {
            # --- Identity ---
            "contact_id":       {"type": "keyword"},          # UUID, system-assigned
            "owner_user_id":    {"type": "keyword"},          # User who owns this contact
            "source":           {"type": "keyword"},          # "ios_contacts" | "manual"
            "imported_at":      {"type": "date"},
            "updated_at":       {"type": "date"},

            # --- Names (EAV: sparse fields, all optional) ---
            "display_name":     {"type": "text",
                                 "analyzer": "tribes_name",
                                 "fields": {"keyword": {"type": "keyword"}}},
            "given_name":       {"type": "text", "analyzer": "tribes_name"},
            "family_name":      {"type": "text", "analyzer": "tribes_name"},
            "nickname":         {"type": "text", "analyzer": "tribes_name"},

            # --- Contact Handles (multi-value, normalized) ---
            "phone_numbers":    {
                "type": "nested",
                "properties": {
                    "e164":     {"type": "keyword"},          # +1XXXXXXXXXX normalized
                    "label":    {"type": "keyword"},          # "mobile" | "home" | "work"
                    "hash":     {"type": "keyword"},          # SHA-256 for privacy matching
                }
            },
            "email_addresses":  {
                "type": "nested",
                "properties": {
                    "address":  {"type": "keyword"},          # lowercased
                    "label":    {"type": "keyword"},
                    "hash":     {"type": "keyword"},
                }
            },

            # --- Location (city-level only, per PRD NFR) ---
            "city":             {"type": "keyword"},
            "state":            {"type": "keyword"},
            "country":          {"type": "keyword", "null_value": "US"},

            # --- Identity Resolution ---
            "resolution_status": {"type": "keyword"},        # "raw" | "unified" | "duplicate"
            "canonical_id":     {"type": "keyword"},         # Points to the surviving doc if duplicate
            "blocking_keys":    {"type": "keyword"},         # Multi-value: computed by blocking.py

            # --- Search convenience ---
            "search_text":      {"type": "text",
                                 "analyzer": "tribes_name"},  # Denormalized: name + nickname
        }
    },
    "settings": {
        "number_of_shards": 2,
        "number_of_replicas": 1,
        "analysis": {
            "analyzer": {
                "tribes_name": {
                    "type": "custom",
                    "tokenizer": "standard",
                    "filter": ["lowercase", "asciifolding", "tribes_edge_ngram"]
                }
            },
            "filter": {
                "tribes_edge_ngram": {
                    "type": "edge_ngram",
                    "min_gram": 2,
                    "max_gram": 15
                }
            }
        }
    }
}
```

---

### 3.2 `tribes_bins`

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
        "number_of_shards": 1,
        "number_of_replicas": 1,
    }
}
```

### V1 Lexical Normalization (`normalized_name` field on `tribes_bins`)

**Purpose.** Enable cross-user aggregation queries that collapse spelling, case, punctuation, and morphological variants of the same English root (e.g., "Hiking", "hike", "HIKERS!" all → `"hike"` or `"hiker"` stem). Conceptual synonymy across distinct stems is deferred to V2.

**Algorithm — exact transformation pipeline:**

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

**Examples:**

| Raw `name` | `normalized_name` |
|---|---|
| `"Hiking!"` | `"hike"` |
| `"Hike Crew"` | `"hike crew"` |
| `"HIKERS 🏔"` | `"hiker"` |
| `"  mountain   biking  "` | `"mountain bike"` |
| `"Café Runners"` | `"café runner"` |

**Field specification on `tribes_bins`:**

| Property | Value |
|---|---|
| Field name | `normalized_name` |
| Field type | `keyword` |
| `doc_values` | `true` (required for `terms` aggregations) |
| `index` | `true` |
| Subfield | `normalized_name.text` — type `text`, analyzer `standard` (optional, cheap to add) |
| Computed at | Write time, synchronously, in the repository layer. |
| Recompute trigger | MUST be recomputed whenever `name` changes. |

```json
{
  "mappings": {
    "properties": {
      "name":            { "type": "keyword" },
      "normalized_name": {
        "type": "keyword",
        "doc_values": true,
        "fields": {
          "text": { "type": "text", "analyzer": "standard" }
        }
      }
    }
  }
}
```

**Repository contract:** `normalized_name` is always derived from `name` at write time. Callers MUST NOT set it directly. The repository `upsert` is the single enforcement point.

**Cross-user aggregation query enabled:**

```json
GET /tribes_bins/_search
{
  "size": 0,
  "query": { "term": { "normalized_name": "hike" } },
  "aggs": {
    "user_count":   { "cardinality": { "field": "user_id" } },
    "bin_variants": { "terms": { "field": "name", "size": 50 } }
  }
}
```

**V1 boundaries — what lexical normalization does NOT solve:**

| Query Type | Example | Status |
|---|---|---|
| Conceptual synonymy across distinct stems | `"Hiking"` ↔ `"Walking"` | Deferred to V2 |
| Multi-word concept clustering | `"Outdoor adventures"` ↔ `"Mountain trips"` | Deferred to V2 |
| Cross-language matching | `"Randonnée"` ↔ `"Hiking"` | Deferred to V2 |
| Graph traversal / social proximity | "Most avid hiker within 5 degrees" | Deferred to V2 |

---

### 3.3 `tribes_assignments`

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

### `owner_user_id` Shard Distribution Analysis

**Index:** `tribes_assignments`. **Shards:** 3 primary (V1). **`_id`:** `{owner_user_id}#{contact_id}#{bin_id}`.

ES uses Murmur3 hash of `_id` modulo shard count. The shared `owner_user_id` prefix does NOT cause clustering — Murmur3 isn't prefix-sensitive; small suffix changes produce uncorrelated outputs. Two docs from the same user with different `contact_id` distribute uniformly across shards.

**Per-user concentration with default `_id` routing:** does not occur. A user with 1000 assignments has approximately 333 docs per shard.

**Per-user query locality:** does not occur. Queries filtered by `owner_user_id` fan out to all 3 shards. At V1 scale (max ~2000 contacts/user), each shard holds ~667 docs total per power user. Latency dominated by network round-trip, not shard count. Acceptable.

**Explicit `routing=owner_user_id` analysis:**
- Pro: per-user query single-shard. Marginal benefit at V1 scale.
- Con: write distribution becomes user-distribution. If 1% of users generate 90% of writes, those power users hash to at most 3 distinct shards. Worst case: all power users hash to the same shard → ~90% write load on one shard.
- Variance much higher with routing. Default `_id` hashing breaks up concentration even when user prefix skews.

**Recommendation: keep default `_id`-based routing for V1.**

Revisit if shard count grows beyond 10, per-user document counts exceed 50,000, or per-user query latency becomes a measured SLO concern.

---

### 3.4 `tribes_tribes`

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

---

## 4. Domain Models (Pydantic v2)

> **Rule:** Service layer imports ONLY from `repositories.interfaces` and `repositories.es.models.*`. Never from `elasticsearch`.

```python
# repositories/es/models/contact.py
from __future__ import annotations
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class PhoneNumber(BaseModel):
    e164: str
    label: Literal["mobile", "home", "work", "other"] = "mobile"
    hash: str                                          # SHA-256(e164)


class EmailAddress(BaseModel):
    address: str                                       # lowercased
    label: Literal["home", "work", "icloud", "other"] = "home"
    hash: str                                          # SHA-256(address)


class ResolutionStatus(str, Enum):
    RAW = "raw"
    UNIFIED = "unified"
    DUPLICATE = "duplicate"


class Contact(BaseModel):
    contact_id: str
    owner_user_id: str
    source: Literal["ios_contacts", "manual"]
    display_name: str
    given_name: str | None = None
    family_name: str | None = None
    nickname: str | None = None
    phone_numbers: list[PhoneNumber] = Field(default_factory=list)
    email_addresses: list[EmailAddress] = Field(default_factory=list)
    city: str | None = None
    state: str | None = None
    country: str = "US"
    resolution_status: ResolutionStatus = ResolutionStatus.RAW
    canonical_id: str | None = None
    imported_at: datetime
    updated_at: datetime


class ContactImportInput(BaseModel):
    """What the iOS Contacts framework provides; no IDs yet."""
    given_name: str | None = None
    family_name: str | None = None
    nickname: str | None = None
    phone_numbers: list[dict]                          # Raw; normalized by repo
    email_addresses: list[dict]                        # Raw; normalized by repo
    city: str | None = None
    state: str | None = None


class ContactSearchInput(BaseModel):
    owner_user_id: str
    query: str                                         # Free text; name / phone / email
    limit: int = Field(default=20, le=100)
    offset: int = 0


class ContactsByBinsInput(BaseModel):
    owner_user_id: str
    bin_ids: list[str]
    operator: Literal["AND", "OR"] = "OR"
    city_filter: str | None = None
    limit: int = Field(default=50, le=200)
    offset: int = 0


class ContactPage(BaseModel):
    contacts: list[Contact]
    total: int
    offset: int
    limit: int
```

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

## 5. Repository Interfaces (Service Layer Contract)

> These are the **only** types the service layer ever touches. Import path: `from repositories.interfaces import IContactRepository, IBinRepository, IAssignmentRepository, ITribeRepository`

```python
# repositories/interfaces.py
from abc import ABC, abstractmethod
from repositories.es.models.contact import (
    Contact, ContactImportInput, ContactSearchInput,
    ContactsByBinsInput, ContactPage
)
from repositories.es.models.bin import Bin, BinCreateInput, BinUpdateInput
from repositories.es.models.assignment import Assignment, AssignInput, UnassignInput, BinsForContactInput
from repositories.es.models.tribe import Tribe, TribeCreateInput, TribeMemberPage


class IContactRepository(ABC):

    @abstractmethod
    async def import_contact(
        self, user_id: str, data: ContactImportInput
    ) -> Contact:
        """
        Normalize, deduplicate (via identity resolution), and upsert a contact.
        Returns the canonical Contact (may be pre-existing if resolved as duplicate).
        """

    @abstractmethod
    async def get_by_id(self, user_id: str, contact_id: str) -> Contact | None:
        """Fetch single contact. Returns None if not found or not owned by user_id."""

    @abstractmethod
    async def search(self, params: ContactSearchInput) -> ContactPage:
        """
        Full-text search across display_name, given_name, family_name, nickname,
        phone_numbers, email_addresses. Edge-ngram analyzer enables prefix matching.
        """

    @abstractmethod
    async def get_by_bins(self, params: ContactsByBinsInput) -> ContactPage:
        """
        Return contacts assigned to any (OR) or all (AND) of the given bin_ids.
        Drives both dynamic tribe previews and coordination recipient selection.
        """

    @abstractmethod
    async def get_unlabeled(self, user_id: str, limit: int, offset: int) -> ContactPage:
        """
        Contacts with zero active assignments. Used to populate the flick-to-bin deck.
        """

    @abstractmethod
    async def batch_import(
        self, user_id: str, contacts: list[ContactImportInput]
    ) -> BatchImportResult:
        """
        Bulk upsert for initial iOS address book sync.
        Returns counts: created, merged, skipped.
        """

    @abstractmethod
    async def delete(self, user_id: str, contact_id: str) -> None:
        """Hard delete. Also deletes all assignments for this contact."""


class IBinRepository(ABC):

    @abstractmethod
    async def create(self, data: BinCreateInput) -> Bin:
        """Create a new bin. Enforces uniqueness of (owner_user_id, name)."""

    @abstractmethod
    async def get_by_id(self, user_id: str, bin_id: str) -> Bin | None:
        """Fetch single bin."""

    @abstractmethod
    async def list_for_user(
        self,
        user_id: str,
        domain: str | None = None,
        include_negative: bool = False,
    ) -> list[Bin]:
        """
        All bins owned by user, optionally filtered by domain.
        Ordered by sort_order ASC, then created_at ASC.
        Excludes negative bins by default.
        """

    @abstractmethod
    async def update(self, user_id: str, bin_id: str, data: BinUpdateInput) -> Bin:
        """Partial update. Raises BinNotFoundError or BinOwnershipError."""

    @abstractmethod
    async def delete(self, user_id: str, bin_id: str) -> None:
        """
        Delete bin and all its assignments (cascaded in service layer,
        using IAssignmentRepository.delete_by_bin).
        """

    @abstractmethod
    async def seed_defaults(self, user_id: str, domains: list[str]) -> list[Bin]:
        """
        Create the default label set for the selected life domains during onboarding.
        Idempotent — safe to call multiple times.
        """

    @abstractmethod
    async def increment_assignment_count(
        self, bin_id: str, delta: int
    ) -> None:
        """Atomic update to assignment_count. delta=+1 (assign) or -1 (unassign)."""


class IAssignmentRepository(ABC):

    @abstractmethod
    async def assign(self, data: AssignInput) -> Assignment:
        """
        Upsert an assignment. If previously unassigned (is_active=False), reactivates it.
        Updates assignment_count on the bin document.
        Idempotent: assigning twice is a no-op (returns existing).
        """

    @abstractmethod
    async def unassign(self, data: UnassignInput) -> None:
        """
        Soft-delete: sets is_active=False, preserves history.
        Raises AssignmentNotFoundError if no active assignment exists.
        """

    @abstractmethod
    async def get_bins_for_contact(self, params: BinsForContactInput) -> list[Assignment]:
        """
        All bin assignments for a contact. Default: active only.
        Ordered by assigned_at DESC.
        """

    @abstractmethod
    async def get_contacts_for_bin(
        self, user_id: str, bin_id: str, limit: int, offset: int
    ) -> list[str]:
        """
        Returns list of contact_ids assigned to a bin (active only).
        Pagination: ordered by assigned_at DESC.
        Used internally; service resolves full Contact objects separately.
        """

    @abstractmethod
    async def delete_by_bin(self, user_id: str, bin_id: str) -> int:
        """Hard delete all assignments for a bin. Returns count deleted."""

    @abstractmethod
    async def delete_by_contact(self, user_id: str, contact_id: str) -> int:
        """Hard delete all assignments for a contact. Returns count deleted."""

    @abstractmethod
    async def bulk_assign(
        self, user_id: str, assignments: list[AssignInput]
    ) -> BulkAssignResult:
        """Batch assign for staging deck multi-select. Atomic per item, not transactional."""


class ITribeRepository(ABC):

    @abstractmethod
    async def create(self, data: TribeCreateInput) -> Tribe:
        """Create tribe. Validates: static requires member_contact_ids, dynamic requires query."""

    @abstractmethod
    async def get_by_id(self, user_id: str, tribe_id: str) -> Tribe | None:
        """Fetch tribe metadata (not members)."""

    @abstractmethod
    async def list_for_user(self, user_id: str) -> list[Tribe]:
        """All tribes owned by user, ordered by last_coordination_at DESC, then created_at DESC."""

    @abstractmethod
    async def resolve_members(
        self, user_id: str, tribe_id: str, limit: int, offset: int
    ) -> TribeMemberPage:
        """
        For static tribes: fetch contacts by member_contact_ids.
        For dynamic tribes: execute stored TribeQuery against tribes_assignments,
        then fetch matching contacts. Updates member_count_cached.
        """

    @abstractmethod
    async def preview_query(
        self, user_id: str, query: TribeQuery, limit: int
    ) -> TribeMemberPage:
        """
        Execute a TribeQuery without saving it. Used for real-time tribe preview
        in the tribe builder UI. Returns matching contacts + total count.
        """

    @abstractmethod
    async def update(self, user_id: str, tribe_id: str, data: dict) -> Tribe:
        """Partial update for name, emoji, color, query, or member list."""

    @abstractmethod
    async def delete(self, user_id: str, tribe_id: str) -> None:
        """Delete tribe document. Does NOT delete contacts or bins."""
```

---

## 6. Concrete ES Repository — Internal Query Patterns

> This section documents what the ES repositories actually build internally. Service engineers do not need to read this; it exists for the implementer of each repository story.

### 6.1 ContactRepository

**`import_contact` — identity resolution path:**
```
1. generate_blocking_keys(input)          # blocking.py
2. ES query: find existing contacts with matching blocking_keys
3. Score candidates via probabilistic matcher (resolver.py)
4. If match score >= MERGE_THRESHOLD (0.85): return canonical Contact, log duplicate
5. If no match: index new Contact, resolution_status="raw"
```

**`search` — underlying ES query:**
```json
{
  "query": {
    "bool": {
      "must": [
        {"term": {"owner_user_id": "<user_id>"}},
        {"multi_match": {
          "query": "<query>",
          "fields": ["display_name^3", "given_name^2", "family_name^2", "nickname"],
          "type": "best_fields",
          "fuzziness": "AUTO"
        }}
      ]
    }
  },
  "nested query on phone_numbers.e164 and email_addresses.address also included if query looks like phone/email"
}
```

**`get_by_bins` — AND operator:**
```json
{
  "query": {
    "bool": {
      "must": [
        {"term": {"owner_user_id": "<user_id>"}},
        // For each bin_id:
        {"has_child_equivalent": "contact_id must appear in assignments for ALL bin_ids"}
      ]
    }
  }
}
```
*Implementation note: AND is implemented as N `terms` filters against `tribes_assignments`, collecting the intersection of `contact_id` sets in the service layer for V1. Acceptable at V1 scale (max 2000 contacts/user). Optimize with ES join or denormalization in V2 if needed.*

**`get_by_bins` — OR operator (dominant use case):**
```json
// Query tribes_assignments index:
{
  "query": {
    "bool": {
      "filter": [
        {"term": {"owner_user_id": "<user_id>"}},
        {"terms": {"bin_id": ["<bin_id_1>", "<bin_id_2>"]}},
        {"term": {"is_active": true}}
      ]
    }
  },
  "_source": ["contact_id"],
  "collapse": {"field": "contact_id"},
  "size": <limit>,
  "from": <offset>
}
// Then fetch full Contact docs by IDs via mget
```

**`get_unlabeled` — contacts with no active assignments:**
```json
// 1. Get all contact_ids with active assignments for user
// 2. Query tribes_contacts with must_not terms on those IDs
// Implemented as two-step in service for V1 simplicity
```

**`batch_import` — uses ES bulk API:**
```python
# Generates bulk body:
[
  {"index": {"_index": "tribes_contacts", "_id": contact_id}},
  {doc},
  ...
]
# Returns: {"created": N, "merged": M, "skipped": K}
```

**Cursor stability under concurrent mutation.**

The wrapper uses Elasticsearch Point-in-Time (PIT) snapshots paired with `search_after` for stable pagination. On the first page request, the wrapper opens a PIT (`POST /<index>/_pit?keep_alive=5m`). Subsequent pages reuse the PIT id and pass the previous page's sort values via `search_after`.

**Cursor token format.** Base64-encoded JSON:
```
{ "pit_id": "<pit_id>", "sort_values": [<sort_values_array>] }
```

**PIT lifetime.** 5 minutes (`keep_alive=5m`). This matches the cascade-cleanup sweep cadence and balances stability against ES resource consumption.

**Stale cursor contract.** When the client submits a cursor whose PIT has expired (ES returns `search_phase_execution_exception` with `pit_id_not_found`), the wrapper raises a typed `StaleCursorError`. The client MUST restart pagination from page 1. The wrapper does NOT auto-recover by opening a fresh PIT — silent recovery would mask result-set drift introduced by mutations during the gap.

**Closing PITs.** PITs are closed via `DELETE /_pit` when the client signals completion, or expire automatically after 5 minutes of inactivity. The wrapper does not maintain server-side cursor state.

---

### 6.2 BinRepository

**`list_for_user`:**
```json
{
  "query": {"bool": {"filter": [
    {"term": {"owner_user_id": "<user_id>"}},
    // if domain provided:
    {"term": {"domain": "<domain>"}},
    // if include_negative=False:
    {"term": {"is_negative": false}}
  ]}},
  "sort": [{"sort_order": "asc"}, {"created_at": "asc"}],
  "size": 500
}
```

**`seed_defaults` — idempotent onboarding:**
```python
# DEFAULT_LABELS dict keyed by domain (from brainstorming session)
# Uses ES bulk upsert with doc_as_upsert=True
# _id = "{user_id}#{domain}#{slugified_name}" — deterministic, enables idempotency
```

**`increment_assignment_count` — atomic:**
```json
{
  "script": {
    "source": "ctx._source.assignment_count += params.delta",
    "params": {"delta": 1}
  }
}
```

---

### 6.3 AssignmentRepository

**`assign` — upsert with reactivation:**
```python
# _id = f"{owner_user_id}#{contact_id}#{bin_id}"  (deterministic, enables idempotency)
# Uses update with doc_as_upsert=True
# If doc exists and is_active=False: sets is_active=True, updated_at=now
# If doc exists and is_active=True: no-op (returns existing)
# After upsert: calls BinRepository.increment_assignment_count(bin_id, +1)
```

**`get_bins_for_contact`:**
```json
{
  "query": {"bool": {"filter": [
    {"term": {"owner_user_id": "<user_id>"}},
    {"term": {"contact_id": "<contact_id>"}},
    {"term": {"is_active": true}}
  ]}},
  "sort": [{"assigned_at": "desc"}],
  "size": 500
}
```

---

### 6.4 TribeRepository

**`resolve_members` for dynamic tribe:**
```python
# Step 1: Execute TribeQuery (same as IContactRepository.get_by_bins internally)
# Step 2: Fetch Contact documents by resulting contact_ids
# Step 3: Update tribe document's member_count_cached
# Step 4: Return TribeMemberPage
```

**`preview_query` — live tribe builder:**
```python
# Same as resolve_members but:
# - Does not require a saved tribe_id
# - Does not update member_count_cached
# - Limit=10 for UI preview, full count returned
```

---

## 7. Identity Resolution Module

### 7.1 Blocking Key Generation (`blocking.py`)

Blocking keys reduce the candidate search space for identity resolution without missing true matches.

```python
# repositories/es/identity/blocking.py

def generate_blocking_keys(input: ContactImportInput) -> list[str]:
    keys = []

    for phone in input.phone_numbers:
        e164 = normalize_phone(phone["number"])
        if e164:
            keys.append(f"phone:{e164}")                       # Exact phone match
            keys.append(f"phone_last7:{e164[-7:]}")            # Last 7 digits (fuzzy)

    for email in input.email_addresses:
        addr = normalize_email(email["address"])
        if addr:
            keys.append(f"email:{addr}")                       # Exact email
            domain = addr.split("@")[1]
            local = addr.split("@")[0]
            keys.append(f"email_local:{local}")                # Local part only (fuzzy)

    if input.family_name and input.given_name:
        name_key = f"name:{soundex(input.family_name)}:{input.given_name[0].lower()}"
        keys.append(name_key)                                  # Phonetic family + first initial

    return list(set(keys))
```

**Phone E.164 normalization library and contract.**

- Library: `phonenumbers` (Google libphonenumber Python port, 8.x).
- Default parse region: `US` (V1). User-locale override deferred to V1.5.
- Format with `phonenumbers.format_number(num, PhoneNumberFormat.E164)`.

**Invalid number contract.** When `phonenumbers.parse(...)` raises `NumberParseException`, the wrapper:
1. Sets `phone.e164 = null` on the contact document.
2. Writes the original input to `phone.raw` (preserved verbatim, no transformation).
3. Strips all non-digit characters from `phone.raw`; if 7+ digits remain, generates ONLY the `phone_last7:{last7_digits}` blocking key (skips the `phone:{e164}` key).
4. If fewer than 7 digits remain after stripping, generates no phone-derived blocking key for this entry.

**Strict mode.** Callers may pass `strict=True` to `import_contact`; in strict mode, `NumberParseException` propagates as a typed `InvalidPhoneError` instead of falling through to raw-digit handling. Default is non-strict.

**Soundex contract.** American Soundex (Russell algorithm) via `jellyfish.soundex(name)`. Returns 4-character codes (e.g., `Smith` → `S530`, `Smyth` → `S530`).

**Known limitation.** American Soundex has a high collision rate for short or unusual surnames and does not handle non-English names well (e.g., `Nguyen` → `N250`, same as `Naga`, `Nahko`). This is acceptable in V1 because Soundex is supplementary — phone E.164 (score 1.0) and email exact (score 0.95) carry the actual matching weight. Soundex contributes only 0.3 to the composite score and never fires in isolation against the 0.85 merge threshold.

Library version pin: `jellyfish>=1.0.0,<2.0.0`. The Soundex output is stable across this version range.

### 7.2 Probabilistic Scorer (`resolver.py`)

```python
# repositories/es/identity/resolver.py

FIELD_WEIGHTS = {
    "exact_phone":      1.0,   # Definitive match
    "exact_email":      0.95,
    "last7_phone":      0.6,
    "email_local":      0.4,
    "phonetic_name":    0.3,
}

MERGE_THRESHOLD = 0.85        # Configurable via env TRIBES_ID_MERGE_THRESHOLD


def score_candidate(input: ContactImportInput, candidate: Contact) -> float:
    """
    Returns 0.0–1.0 match score between import input and existing Contact.
    Score >= MERGE_THRESHOLD → treat as duplicate.
    """
    score = 0.0

    # Exact phone match
    input_phones = {normalize_phone(p["number"]) for p in input.phone_numbers}
    cand_phones  = {p.e164 for p in candidate.phone_numbers}
    if input_phones & cand_phones:
        score = max(score, FIELD_WEIGHTS["exact_phone"])

    # Exact email match
    input_emails = {normalize_email(e["address"]) for e in input.email_addresses}
    cand_emails  = {e.address for e in candidate.email_addresses}
    if input_emails & cand_emails:
        score = max(score, FIELD_WEIGHTS["exact_email"])

    # ... additional scoring logic ...

    return score
```

### 7.3 Identity Resolution Merge — Field-Level Rules

**Trigger.** `import_contact` resolves a candidate with composite similarity score >= 0.85.

| Field | Rule |
|---|---|
| `blocking_keys` (array) | UNION — append incoming keys not already present; NEVER replace or truncate. |
| `phone_numbers` (nested, keyed by `value_hash`) | UNION by `value_hash`. Existing record preserved on hash collision. No deletions. |
| `email_addresses` (nested, keyed by `value_hash`) | Same as `phone_numbers`. |
| `name.first`, `name.last` | Incoming wins if non-empty (after trim); else candidate preserved. |
| `name.display` | Recomputed from winning first/last after merge. |
| `canonical_id` | IMMUTABLE after first assignment. Incoming `canonical_id` recorded in `merge_audit` only. |
| `resolution_status` | Transitions: `unresolved` → `candidate` → `merged`. Once `merged`, no further transitions without explicit admin override (V2). |
| `source_ids` (array) | UNION. |
| All other scalars | Candidate (existing) wins. Incoming recorded in `merge_audit.incoming_snapshot`. |

**`canonical_id` Immutability.** Wrapper MUST validate before issuing `update`; raise `MergeIntegrityError` if caller attempts to overwrite.

**Concurrency Safety.** All merge updates MUST use `if_seq_no` + `if_primary_term` from the candidate document. On `VersionConflictEngineException`: retry full fetch-and-merge cycle up to 3 times, then raise `MergeConflictError`.

**Idempotency Token.** Callers MUST supply `import_idempotency_token` (UUID v4, stable for the lifetime of a single import). Before merging, wrapper checks `merge_audit` for an existing record with matching token + same `canonical_id`. If found: return previously recorded result without re-applying.

**Audit Trail (`merge_audit` nested field on contact, append-only):**

```
merge_audit[]:
  import_idempotency_token   keyword
  merged_at                  date
  similarity_score           float
  incoming_snapshot          object
  fields_overwritten         keyword[]
  merged_by                  keyword
```

Wrapper MUST NOT delete or overwrite prior entries.

---

## 8. Client & Configuration

```python
# repositories/es/client.py
from elasticsearch import AsyncElasticsearch
from functools import lru_cache
from .config import ESConfig


@lru_cache(maxsize=1)
def get_es_client() -> AsyncElasticsearch:
    config = ESConfig()
    return AsyncElasticsearch(
        hosts=[config.es_url],
        api_key=config.es_api_key,                            # GCP Secret Manager
        retry_on_timeout=True,
        max_retries=3,
        request_timeout=10,
        sniff_on_start=False,                                  # Cloud Elasticsearch: no sniffing
    )
```

```python
# repositories/es/config.py
from pydantic_settings import BaseSettings


class ESConfig(BaseSettings):
    es_url: str                                                # TRIBES_ES_URL
    es_api_key: str                                            # TRIBES_ES_API_KEY
    es_index_prefix: str = "tribes"                            # TRIBES_ES_INDEX_PREFIX

    @property
    def contacts_index(self) -> str: return f"{self.es_index_prefix}_contacts"

    @property
    def bins_index(self) -> str: return f"{self.es_index_prefix}_bins"

    @property
    def assignments_index(self) -> str: return f"{self.es_index_prefix}_assignments"

    @property
    def tribes_index(self) -> str: return f"{self.es_index_prefix}_tribes"

    class Config:
        env_prefix = "TRIBES_"
```

---

## 9. Error Handling Contract

All ES exceptions are caught inside the repository layer and re-raised as domain exceptions. Service layer catches only domain exceptions.

```python
# repositories/es/exceptions.py

class TribesRepositoryError(Exception):
    """Base for all repository errors."""

class ContactNotFoundError(TribesRepositoryError):
    def __init__(self, contact_id: str):
        super().__init__(f"Contact not found: {contact_id}")

class ContactOwnershipError(TribesRepositoryError):
    """Contact exists but is not owned by requesting user."""

class BinNotFoundError(TribesRepositoryError): ...
class BinOwnershipError(TribesRepositoryError): ...
class BinNameConflictError(TribesRepositoryError):
    """Bin with same name already exists for this user."""

class AssignmentNotFoundError(TribesRepositoryError): ...
class TribeNotFoundError(TribesRepositoryError): ...
class TribeQueryInvalidError(TribesRepositoryError):
    """Dynamic tribe query references bin_ids not owned by user."""

class ESUnavailableError(TribesRepositoryError):
    """Elasticsearch cluster unreachable. Triggers 503 at API layer."""

class ESIndexError(TribesRepositoryError):
    """Document indexing failed after retries."""
```

**Mapping table:**

| ES Exception | Domain Exception | HTTP Status |
|---|---|---|
| `NotFoundError` | `*NotFoundError` | 404 |
| `ConflictError` | `BinNameConflictError` | 409 |
| `ConnectionError` | `ESUnavailableError` | 503 |
| `RequestError` | `ESIndexError` | 500 |
| `AuthenticationException` | `ESUnavailableError` | 503 |

---

## 10. Index Lifecycle Management

```python
# repositories/es/indices/manager.py
# Called at FastAPI lifespan startup

async def ensure_indices(client: AsyncElasticsearch, config: ESConfig) -> None:
    """
    Creates indices if missing. Does NOT update mappings on existing indices
    (use migrations for that). Safe to call on every startup.
    """
    for index_name, mapping in [
        (config.contacts_index, CONTACTS_MAPPING),
        (config.bins_index, BINS_MAPPING),
        (config.assignments_index, ASSIGNMENTS_MAPPING),
        (config.tribes_index, TRIBES_MAPPING),
    ]:
        exists = await client.indices.exists(index=index_name)
        if not exists:
            await client.indices.create(index=index_name, body=mapping)
```

---

## 11. FastAPI Dependency Injection

```python
# app/core/dependencies.py
from repositories.interfaces import (
    IContactRepository, IBinRepository,
    IAssignmentRepository, ITribeRepository
)
from repositories.es.repositories.contact_repo import ESContactRepository
from repositories.es.repositories.bin_repo import ESBinRepository
from repositories.es.repositories.assignment_repo import ESAssignmentRepository
from repositories.es.repositories.tribe_repo import ESTribeRepository
from repositories.es.client import get_es_client
from repositories.es.config import ESConfig


def get_contact_repo() -> IContactRepository:
    return ESContactRepository(client=get_es_client(), config=ESConfig())

def get_bin_repo() -> IBinRepository:
    return ESBinRepository(client=get_es_client(), config=ESConfig())

def get_assignment_repo() -> IAssignmentRepository:
    return ESAssignmentRepository(client=get_es_client(), config=ESConfig())

def get_tribe_repo() -> ITribeRepository:
    return ESTribeRepository(client=get_es_client(), config=ESConfig())


# Usage in route handler:
@router.post("/contacts/import")
async def import_contact(
    data: ContactImportInput,
    repo: IContactRepository = Depends(get_contact_repo),
    current_user: User = Depends(get_current_user),
) -> ContactResponse:
    contact = await repo.import_contact(current_user.uid, data)
    return ContactResponse.from_domain(contact)
```

---

## 12. Testing Strategy

### Unit tests (mock ES client)
```python
# tests/repositories/test_bin_repo.py
from unittest.mock import AsyncMock, patch
from repositories.es.repositories.bin_repo import ESBinRepository

async def test_create_bin_returns_domain_type():
    mock_client = AsyncMock()
    mock_client.index.return_value = {"result": "created", "_id": "test-bin-id"}
    repo = ESBinRepository(client=mock_client, config=test_config)
    result = await repo.create(BinCreateInput(...))
    assert isinstance(result, Bin)
    assert result.bin_id == "test-bin-id"
```

### Integration tests (real ES, test index prefix)
```python
# tests/integration/test_contact_search.py
# Uses TRIBES_ES_INDEX_PREFIX=test_<uuid> to isolate
# Teardown deletes all test_* indices
```

### Contract tests
- Every method on every interface has at least one unit test
- Every error path (NotFound, Ownership, Conflict) has a test
- Identity resolution scorer tested with fixture contact pairs at known match scores

---

## 13. Implementation Stories for Gastown

Break into the following discrete stories. Each story is independently deployable.

---

### Story 1: ES Client & Config Foundation
**Scope:** `client.py`, `config.py`, `exceptions.py`, `indices/manager.py`
**Acceptance criteria:**
- `get_es_client()` returns singleton `AsyncElasticsearch`
- Connection params loaded from env via `ESConfig`
- `ensure_indices()` creates all 4 indices on cold start
- All 4 indices have correct mappings (verified via `client.indices.get_mapping`)
- Custom analyzer `tribes_name` registered correctly
- Unit tests for config loading

---

### Story 2: Contact Domain Model & Base Repository
**Scope:** `models/contact.py`, `repositories/base.py`, `interfaces.py` (contact section)
**Acceptance criteria:**
- `Contact`, `ContactImportInput`, `ContactSearchInput`, `ContactsByBinsInput`, `ContactPage` models pass Pydantic validation
- `PhoneNumber` and `EmailAddress` nested models serialize/deserialize correctly
- `IContactRepository` abstract class defined
- Phone normalization to E.164 implemented and tested
- Email normalization (lowercase, strip) implemented and tested
- SHA-256 hashing for phone and email implemented

---

### Story 3: ContactRepository — Import & Get
**Scope:** `repositories/contact_repo.py` — `import_contact`, `get_by_id`, `delete`
**Acceptance criteria:**
- `import_contact` indexes new contact document
- `import_contact` returns existing contact if ES doc with same `_id` found (idempotent)
- `get_by_id` returns `None` for missing doc (not exception)
- `get_by_id` raises `ContactOwnershipError` if `owner_user_id` mismatch
- `delete` removes document and raises `ContactNotFoundError` if missing
- `ConnectionError` mapped to `ESUnavailableError`

---

### Story 4: ContactRepository — Search
**Scope:** `repositories/contact_repo.py` — `search`
**Acceptance criteria:**
- Returns `ContactPage` with correct `total` and `contacts`
- Multi-match hits on `display_name`, `given_name`, `family_name`, `nickname`
- Edge-ngram enables prefix matching ("Dew" matches "Dewey")
- Phone/email query terms trigger nested query on `phone_numbers.e164` / `email_addresses.address`
- `limit` and `offset` respected
- Empty query string returns 400 (validated in model)

---

### Story 5: ContactRepository — Batch Import
**Scope:** `repositories/contact_repo.py` — `batch_import`
**Acceptance criteria:**
- Uses ES bulk API (single HTTP call per batch)
- Returns `BatchImportResult` with `created`, `merged`, `skipped` counts
- Individual document errors do not abort the batch (partial success allowed)
- Errors logged per document with contact identifier
- Integration test: import 100 contacts, verify all indexed

---

### Story 6: ContactRepository — get_by_bins & get_unlabeled
**Scope:** `repositories/contact_repo.py` — `get_by_bins`, `get_unlabeled`
**Acceptance criteria:**
- `get_by_bins` OR: returns contacts assigned to any of the given bins
- `get_by_bins` AND: returns only contacts assigned to ALL given bins
- `city_filter` correctly narrows results when provided
- `get_unlabeled` returns contacts with zero active assignments
- Both methods respect `limit` and `offset`
- Both methods respect `owner_user_id` isolation (cross-user data never returned)

---

### Story 7: Bin Domain Model & BinRepository — CRUD
**Scope:** `models/bin.py`, `repositories/bin_repo.py` — all methods except `seed_defaults`
**Acceptance criteria:**
- `create` indexes bin, returns `Bin`
- `create` raises `BinNameConflictError` on duplicate `(owner_user_id, name)`
- `get_by_id` returns `None` for missing, `BinOwnershipError` for wrong owner
- `list_for_user` returns all bins sorted by `sort_order` ASC
- `list_for_user` with `domain` filter returns only that domain
- `list_for_user` excludes negative bins by default
- `update` applies partial update, returns updated `Bin`
- `delete` removes document
- `increment_assignment_count` uses ES script update (atomic)

---

### Story 8: BinRepository — Seed Defaults (Onboarding)
**Scope:** `repositories/bin_repo.py` — `seed_defaults`
**Acceptance criteria:**
- Given a list of domain strings, creates all default labels for those domains
- Default label data matches the 65 labels from brainstorming session (spec Appendix A)
- Idempotent: calling twice does not create duplicates
- Uses bulk upsert with deterministic `_id`s
- Returns list of created/existing `Bin` objects
- Integration test: onboard user with 3 domains, verify correct labels created

---

### Story 9: Assignment Domain Model & AssignmentRepository — assign/unassign
**Scope:** `models/assignment.py`, `repositories/assignment_repo.py` — `assign`, `unassign`
**Acceptance criteria:**
- `assign` creates assignment with deterministic `_id`
- `assign` is idempotent (same input twice = same result, no duplicate)
- `assign` reactivates soft-deleted assignment (`is_active=False → True`)
- `assign` calls `BinRepository.increment_assignment_count(+1)` on new assignment
- `unassign` sets `is_active=False`
- `unassign` raises `AssignmentNotFoundError` if no active assignment found
- `unassign` calls `BinRepository.increment_assignment_count(-1)`

---

### Story 10: AssignmentRepository — Queries & Bulk
**Scope:** `repositories/assignment_repo.py` — `get_bins_for_contact`, `get_contacts_for_bin`, `delete_by_bin`, `delete_by_contact`, `bulk_assign`
**Acceptance criteria:**
- `get_bins_for_contact` returns active assignments ordered by `assigned_at DESC`
- `get_contacts_for_bin` returns `contact_id` list, paginated
- `delete_by_bin` hard-deletes all assignments, returns count
- `delete_by_contact` hard-deletes all assignments, returns count
- `bulk_assign` processes list of `AssignInput` items, returns success/fail per item
- Errors in bulk do not abort remaining items

---

### Story 11: Tribe Domain Model & TribeRepository — Static Tribes
**Scope:** `models/tribe.py`, `repositories/tribe_repo.py` — `create` (static), `get_by_id`, `list_for_user`, `update`, `delete`, `resolve_members` (static path)
**Acceptance criteria:**
- `create` with `tribe_type="static"` requires `member_contact_ids`
- `resolve_members` for static tribe fetches contacts via ES `mget`
- `list_for_user` ordered by `last_coordination_at DESC`
- `delete` removes only the tribe document (not contacts or bins)

---

### Story 12: TribeRepository — Dynamic Tribes & Query Preview
**Scope:** `repositories/tribe_repo.py` — `create` (dynamic), `resolve_members` (dynamic path), `preview_query`
**Acceptance criteria:**
- `create` with `tribe_type="dynamic"` requires `query` (TribeQuery)
- `create` validates all `query.bin_ids` are owned by `user_id` (raises `TribeQueryInvalidError` if not)
- `resolve_members` for dynamic tribe executes stored `TribeQuery` against assignments index
- `resolve_members` updates `member_count_cached` on tribe document
- `preview_query` executes query without saving, returns first 10 contacts + total
- `preview_query` raises `TribeQueryInvalidError` for bins not owned by user
- Integration test: create dynamic tribe with 2 bins (OR), verify correct member resolution

---

### Story 13: Identity Resolution — Blocking
**Scope:** `identity/blocking.py`
**Acceptance criteria:**
- `generate_blocking_keys` returns list of strings for contact with phone(s)
- Returns `phone:<e164>` key for each valid phone
- Returns `phone_last7:<digits>` key for each valid phone
- Returns `email:<addr>` key for each valid email
- Returns `email_local:<local>` key for each valid email
- Returns `name:<soundex>:<initial>` key when both given and family name present
- Keys are deduped
- Unit tests for each key type with fixture data

---

### Story 14: Identity Resolution — Probabilistic Scorer & Integration
**Scope:** `identity/resolver.py`, integration into `ContactRepository.import_contact`
**Acceptance criteria:**
- `score_candidate` returns 1.0 for exact phone match
- `score_candidate` returns 0.95 for exact email match
- `score_candidate` returns 0.0 for no matching signals
- `import_contact` queries candidates using blocking keys before indexing
- `import_contact` returns canonical contact if best candidate score >= `MERGE_THRESHOLD`
- `import_contact` marks new contact `resolution_status="duplicate"` and sets `canonical_id` if merged
- `MERGE_THRESHOLD` configurable via `TRIBES_ID_MERGE_THRESHOLD` env var (default 0.85)
- Integration test: import same contact twice (phone match) → same `contact_id` returned both times

---

### Story 15: Repository Dependency Injection & FastAPI Integration
**Scope:** `app/core/dependencies.py`, wiring into FastAPI lifespan
**Acceptance criteria:**
- `get_contact_repo()`, `get_bin_repo()`, `get_assignment_repo()`, `get_tribe_repo()` all return correct concrete implementations
- `ensure_indices()` called at lifespan startup
- ES client closed cleanly at lifespan shutdown
- All 4 repos available as FastAPI `Depends` in route handlers
- Integration test: start FastAPI test client, verify indices exist

---

---

## 14. Write Operations — Internal Patterns

> This section is the missing complement to Section 6. All write paths are here. Every mutation goes through one of four ES operations: `index`, `update`, `delete`, or `bulk`.

---

### 14.1 ES Write Operation Reference

| Operation | When used | ES call |
|---|---|---|
| **Index (create or replace)** | New doc with known `_id` | `client.index(index, id, document)` |
| **Upsert** | Create if missing, update fields if exists | `client.update(index, id, doc=..., doc_as_upsert=True)` |
| **Partial update** | Mutate specific fields only | `client.update(index, id, doc={field: value})` |
| **Script update** | Atomic counter/conditional mutation | `client.update(index, id, script={...})` |
| **Delete** | Hard remove | `client.delete(index, id)` |
| **Delete by query** | Bulk remove matching docs | `client.delete_by_query(index, query)` |
| **Bulk** | Batch of any of the above | `client.bulk(operations=[...])` |

All write calls include `refresh="wait_for"` only in **tests**. In production, `refresh=False` (default) — eventual consistency is acceptable for this workload. The service layer never depends on read-your-own-writes semantics except where noted.

---

### 14.2 ContactRepository — Write Internals

#### `import_contact`
```python
# Step 1: Normalize inputs
e164_phones  = [normalize_phone(p) for p in input.phone_numbers]
norm_emails  = [normalize_email(e) for e in input.email_addresses]
blocking_keys = generate_blocking_keys(input)

# Step 2: Candidate search (read step, informs write decision)
candidates = await self._find_candidates(user_id, blocking_keys)
best = max(candidates, key=lambda c: score_candidate(input, c), default=None)

if best and score_candidate(input, best) >= MERGE_THRESHOLD:
    # Duplicate detected — return canonical without writing
    return best

# Step 3: Index new contact
contact_id = str(uuid4())
doc = {
    "contact_id":       contact_id,
    "owner_user_id":    user_id,
    "display_name":     build_display_name(input),
    "given_name":       input.given_name,
    "family_name":      input.family_name,
    "phone_numbers":    [{"e164": p, "hash": sha256(p), "label": l} for p, l in ...],
    "email_addresses":  [{"address": e, "hash": sha256(e), "label": l} for e, l in ...],
    "blocking_keys":    blocking_keys,
    "resolution_status": "raw",
    "source":           "ios_contacts",
    "imported_at":      utcnow(),
    "updated_at":       utcnow(),
    "search_text":      f"{input.given_name} {input.family_name} {input.nickname}".strip(),
}

await self.client.index(
    index=self.config.contacts_index,
    id=contact_id,
    document=doc,
)
return Contact(**doc)
```

#### `batch_import`
```python
# Builds ES bulk body — one index action per contact
operations = []
for contact_input in contacts:
    contact_id = str(uuid4())
    doc = build_contact_doc(user_id, contact_id, contact_input)
    operations.extend([
        {"index": {"_index": self.config.contacts_index, "_id": contact_id}},
        doc,
    ])

response = await self.client.bulk(operations=operations)

created  = sum(1 for item in response["items"] if item["index"]["result"] == "created")
merged   = 0   # Identity resolution handled pre-bulk (blocking query pass first)
errors   = [item for item in response["items"] if "error" in item["index"]]

return BatchImportResult(created=created, merged=merged, errors=len(errors))
```

#### `delete`
```python
# 1. Verify ownership (get_by_id raises ContactOwnershipError if mismatch)
await self.get_by_id(user_id, contact_id)

# 2. Delete all assignments for this contact first
await self.assignment_repo.delete_by_contact(user_id, contact_id)

# 3. Hard delete the contact document
try:
    await self.client.delete(index=self.config.contacts_index, id=contact_id)
except NotFoundError:
    raise ContactNotFoundError(contact_id)
```

---

### 14.3 BinRepository — Write Internals

#### `create`
```python
# Uniqueness check: (owner_user_id, name) must be unique
exists = await self._find_by_name(user_id, data.name)
if exists:
    raise BinNameConflictError(f"Bin '{data.name}' already exists for user")

bin_id = str(uuid4())
doc = {
    "bin_id":        bin_id,
    "owner_user_id": user_id,
    "name":          data.name,
    "name_search":   data.name.lower(),
    "domain":        data.domain,
    "color_hex":     data.color_hex,
    "emoji":         data.emoji,
    "is_default":    False,
    "is_negative":   data.is_negative,
    "sort_order":    data.sort_order,
    "assignment_count": 0,
    "created_at":    utcnow(),
    "updated_at":    utcnow(),
}

await self.client.index(
    index=self.config.bins_index,
    id=bin_id,
    document=doc,
)
return Bin(**doc)
```

#### Bin Name Conflict — Layered Safeguards

A read-then-write uniqueness check cannot prevent two concurrent writers from both passing the check and indexing duplicate bin names. Layer two safeguards.

**Safeguard A — Deterministic `_id`**

```
_id = sha256("{owner_user_id}#{slug(name)}")[:32]
```

`slug(name)`: lowercase, NFC-normalized, whitespace collapsed to single space, trimmed. The slug algorithm MUST be documented and stable — any change is breaking and requires reindex.

Two concurrent writes for the same owner/name produce the same `_id`. ES serializes writes to the same `_id` on the same shard. The second becomes a last-writer-wins upsert. No duplicate document.

Caveat: only protects against name strings that slug-equal. "Friends" vs "Friendss" remain distinct (correct). On rename, the old `_id` MUST be hard-deleted and a new document created — rename is NOT an in-place field update.

**Safeguard B — Post-Write Verification**

After `index` returns success:
1. `search` on `tribes_bins` with `refresh="wait_for"` filtered by `term: {owner_user_id}` + `term: {slug_name}`.
2. Assert `hits.total.value == 1`.
3. If `> 1` (transition window or belt-and-suspenders): sort by `_id` lexicographically ascending. Lowest `_id` survives. Others hard-deleted by `_id`. Return `BinNameConflictError` to the caller — do NOT silently succeed.
4. If `== 0`: raise `BinWriteVerificationError`. Log at ERROR level.

Operate both safeguards in production. In tests, Safeguard B verifies that A is working correctly.

#### `update` (partial)
```python
# Build update dict from non-None fields only
update_fields = data.model_dump(exclude_none=True)
update_fields["updated_at"] = utcnow()
if "name" in update_fields:
    update_fields["name_search"] = update_fields["name"].lower()

try:
    response = await self.client.update(
        index=self.config.bins_index,
        id=bin_id,
        doc=update_fields,
    )
except NotFoundError:
    raise BinNotFoundError(bin_id)

return await self.get_by_id(user_id, bin_id)
```

**Rename cascade — denormalization refresh.** When a bin is renamed via `BinRepository.update` (where `name` differs from existing), the wrapper enqueues a pending job in `tribes_pending_jobs`:

- `op_type = "reconcile_bin_name"`
- `primary_id = bin_id`
- `target_index = "tribes_assignments"`
- `query_dsl = { "term": { "bin_id": <bin_id> } }` with a `script` payload that updates the denormalized `bin_name` field.

A separate pending job (`op_type = "reconcile_bin_color"`) is enqueued when `color_hex` changes. Both run via the standard 5-minute sweep cadence. Maximum staleness window for denormalized `bin_name` and `bin_color_hex` on assignments: **5 minutes**.

#### `delete`
```python
# Ownership check first
await self.get_by_id(user_id, bin_id)

# Hard delete — caller (service layer) is responsible for cascading assignments
try:
    await self.client.delete(index=self.config.bins_index, id=bin_id)
except NotFoundError:
    raise BinNotFoundError(bin_id)
```

#### `seed_defaults`
```python
# Deterministic _id prevents duplicates across multiple calls
DEFAULT_LABELS: dict[str, list[dict]] = {
    "helpers_fixers": [
        {"name": "Handyman",    "color_hex": "#E67E22", "emoji": "🔧"},
        {"name": "Tech support","color_hex": "#E67E22", "emoji": "💻"},
        # ... all 12 labels
    ],
    # ... other domains
}

operations = []
for domain in domains:
    for label in DEFAULT_LABELS.get(domain, []):
        bin_id = f"{user_id}#{domain}#{slugify(label['name'])}"   # Deterministic
        doc = {
            "bin_id":        bin_id,
            "owner_user_id": user_id,
            "name":          label["name"],
            "name_search":   label["name"].lower(),
            "domain":        domain,
            "color_hex":     label["color_hex"],
            "emoji":         label.get("emoji"),
            "is_default":    True,
            "is_negative":   False,
            "sort_order":    DEFAULT_LABELS[domain].index(label),
            "assignment_count": 0,
            "created_at":    utcnow(),
            "updated_at":    utcnow(),
        }
        operations.extend([
            {"update": {"_index": self.config.bins_index, "_id": bin_id}},
            {"doc": doc, "doc_as_upsert": True},
        ])

if operations:
    await self.client.bulk(operations=operations)

return await self.list_for_user(user_id)
```

#### `increment_assignment_count` (atomic script update)
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

---

### 14.4 AssignmentRepository — Write Internals

#### `assign`
```python
# Deterministic _id: enables idempotency and upsert semantics
assignment_id = f"{owner_user_id}#{contact_id}#{bin_id}"

# Fetch bin for denormalized fields
bin_doc = await self.bin_repo.get_by_id(owner_user_id, bin_id)
if not bin_doc:
    raise BinNotFoundError(bin_id)

# Compute affinity_weight from flick velocity (V1: default 1.0; V1.5: derived)
affinity_weight = compute_affinity_weight(data.flick_velocity)   # 1.0 in V1

doc = {
    "assignment_id":  assignment_id,
    "owner_user_id":  owner_user_id,
    "contact_id":     contact_id,
    "bin_id":         bin_id,
    "bin_name":       bin_doc.name,
    "bin_domain":     bin_doc.domain,
    "bin_color_hex":  bin_doc.color_hex,
    "affinity_weight": affinity_weight,
    "flick_velocity": data.flick_velocity,
    "is_active":      True,
    "assigned_at":    utcnow(),
    "updated_at":     utcnow(),
}

# Upsert — create if new, reactivate if previously soft-deleted
response = await self.client.update(
    index=self.config.assignments_index,
    id=assignment_id,
    doc=doc,
    doc_as_upsert=True,
)

# Increment bin counter only if this is a new or reactivated assignment
if response["result"] in ("created", "updated"):
    # Only increment if was previously inactive (check _source.is_active before update)
    # V1 simplification: always increment on create; accept minor count drift on reactivation
    await self.bin_repo.increment_assignment_count(bin_id, +1)

return Assignment(**doc)
```

#### `unassign` (soft delete)
```python
assignment_id = f"{owner_user_id}#{contact_id}#{bin_id}"

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
await self.bin_repo.increment_assignment_count(bin_id, -1)
```

#### `delete_by_bin` (hard delete, cascade)
```python
response = await self.client.delete_by_query(
    index=self.config.assignments_index,
    body={
        "query": {"bool": {"filter": [
            {"term": {"owner_user_id": user_id}},
            {"term": {"bin_id": bin_id}},
        ]}}
    },
    wait_for_completion=True,
    refresh=True,
)
return response["deleted"]
```

#### `delete_by_contact` (hard delete, cascade)
```python
response = await self.client.delete_by_query(
    index=self.config.assignments_index,
    body={
        "query": {"bool": {"filter": [
            {"term": {"owner_user_id": user_id}},
            {"term": {"contact_id": contact_id}},
        ]}}
    },
    wait_for_completion=True,
    refresh=True,
)
return response["deleted"]
```

#### Cascade Cleanup: Pending-Jobs Pattern

**Context.** Multi-index write sequences (e.g., delete bin → remove all assignments for that bin) are not atomic in ES. A partial failure leaves orphaned documents in a secondary index.

**New Index: `tribes_pending_jobs`**

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
      "status":         { "type": "keyword" },
      "error_log":      { "type": "text" }
    }
  }
}
```

`job_id` is deterministic: `sha256(op_type + primary_id)` — re-submitting the same logical cascade is a no-op upsert.

**`op_type` enumeration (V1).**

- `cascade_delete_assignments_for_bin`
- `cascade_delete_assignments_for_contact`
- `reconcile_bin_name`
- `reconcile_bin_color`

This list grows with each new denormalization or cross-index dependency. New op_types require a corresponding worker registration.

**Write Protocol.**
1. Before executing the secondary write, upsert a pending-job document.
2. Execute the secondary write (e.g., `delete_by_query` on `tribes_assignments` where `bin_id = X`).
3. On success, update job `status = succeeded`.
4. On failure: leave `status = pending`, increment `retry_count`, record error in `error_log`. Do NOT raise an exception that would roll back the primary write — primary is already committed.

**Sweep Job.** Configurable interval (suggest 5 minutes V1). Queries `status = pending AND retry_count < MAX_RETRIES` (suggest `MAX_RETRIES = 5`). Executes stored `query_dsl`. On exhaustion: `failed_permanent` + structured ERROR log for human triage.

#### `bulk_assign`
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
    assignment_input = assignments[i]
    if "error" in result["update"]:
        results.failed.append({"input": assignment_input, "error": result["update"]["error"]})
    else:
        results.succeeded.append(assignment_input)
        # Note: bin.assignment_count not incremented in bulk for performance.
        # A background reconciliation job (V1.5) recomputes counts from assignments.

return results
```

---

### 14.5 TribeRepository — Write Internals

#### `create`
```python
# Validate tribe type constraints
if data.tribe_type == "static" and not data.member_contact_ids:
    raise ValueError("Static tribe requires member_contact_ids")
if data.tribe_type == "dynamic" and not data.query:
    raise ValueError("Dynamic tribe requires query")

# Validate dynamic tribe: all bin_ids must be owned by user
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
    "member_contact_ids":    data.member_contact_ids or [],
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
)
return Tribe(**doc)
```

#### `update` (partial, any fields)
```python
update_fields = {k: v for k, v in data.items() if v is not None}
update_fields["updated_at"] = utcnow()

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

#### `delete`
```python
# Ownership check
await self.get_by_id(user_id, tribe_id)   # Raises TribeNotFoundError if missing

await self.client.delete(index=self.config.tribes_index, id=tribe_id)
# Note: does NOT delete contacts, bins, or assignments
```

#### `resolve_members` — updates cached count
```python
# Dynamic tribe: execute stored query, then update cached count
members = await self.contact_repo.get_by_bins(ContactsByBinsInput(
    owner_user_id=user_id,
    bin_ids=tribe.query.bin_ids,
    operator=tribe.query.operator,
    city_filter=tribe.query.city_filter,
    limit=limit,
    offset=offset,
))

# Update cached count (best-effort, not critical path)
await self.client.update(
    index=self.config.tribes_index,
    id=tribe_id,
    doc={"member_count_cached": members.total, "updated_at": utcnow()},
)

return TribeMemberPage(tribe_id=tribe_id, contacts=members.contacts, total=members.total)
```

---

### 14.6 Write Operation Summary Table

| Repository | Method | ES Operation | Idempotent | Cascades |
|---|---|---|---|---|
| Contact | `import_contact` | `index` | Yes (UUID stable per run) | No |
| Contact | `batch_import` | `bulk index` | Yes (per doc) | No |
| Contact | `delete` | `delete` | No | Deletes assignments |
| Bin | `create` | `index` | No (name conflict error) | No |
| Bin | `update` | `update` (partial) | Yes | No |
| Bin | `delete` | `delete` | No | Caller cascades |
| Bin | `seed_defaults` | `bulk update` (upsert) | **Yes** | No |
| Bin | `increment_assignment_count` | `update` (script) | No | No |
| Assignment | `assign` | `update` (upsert) | **Yes** | Increments bin count |
| Assignment | `unassign` | `update` (partial) | No | Decrements bin count |
| Assignment | `delete_by_bin` | `delete_by_query` | Yes | No |
| Assignment | `delete_by_contact` | `delete_by_query` | Yes | No |
| Assignment | `bulk_assign` | `bulk update` (upsert) | **Yes** | No (reconcile later) |
| Tribe | `create` | `index` | No | No |
| Tribe | `update` | `update` (partial) | Yes | No |
| Tribe | `delete` | `delete` | No | **None — explicit** |
| Tribe | `resolve_members` | `update` (count cache) | Yes | No |

---

## 15. Refresh Contract — Read-After-Write Guarantees

**Default.** All production writes use `refresh=False` (ES default).

**What consumers CAN rely on (refresh=False):**
- Write is durable (translog-persisted) on acknowledgment.
- Get-by-ID for the written `_id` returns the current version immediately.
- Subsequent writes to the same `_id` are sequenced correctly.

**What consumers CANNOT rely on (refresh=False):**
- Search queries (terms, match, range) returning the just-written document.
- `hits.total.value` counts reflecting the write.
- Any query used for uniqueness checking or post-write verification.

**Exception List — writes that MUST use `refresh="wait_for"`:**

| Repository Method | Reason |
|---|---|
| `BinRepository.create` / `upsert` | Post-write verification immediately issues a search query. |
| `ContactRepository.import_contact` (merge update) | Identity resolution candidate fetch for chained operations must see merged state. |
| `PendingJobsRepository.create_job` | Sweep job queries by `status=pending`; if not visible, missed on first interval. |
| `BinRepository.rename` (the old-doc delete step in Safeguard A) | Safeguard B's post-write verification on the new doc must see the absence of the old doc. If the delete is not visible to the search, the verification false-positives. |

**All other writes** — assignments create/update, contacts created outside the merge path, bin soft-deletes — use `refresh=False`.

**Note on `refresh=true` (synchronous force).** Prohibited in production write paths. Cluster-wide performance hazard. Use `wait_for` when search-visibility is required.

### V1 Performance Baselines

These are the V1 launch baselines, measured on the recommended Cloud Run + ES Cloud topology under representative load (1k contacts/user, 50 bins/user, 2k assignments/user). They are conservative starting targets; tighten after measurement.

| Operation | p95 Target |
|---|---|
| `get_by_id` (any repository) | < 50 ms |
| Contact search (single term, `fuzziness=AUTO`, edge_ngram prefix) | < 200 ms |
| Cross-user `terms` aggregation on `normalized_name` | < 500 ms |
| Bulk contact import (500 contacts in single `bulk` API call) | < 2 s |
| Tribe member resolution (dynamic, ≤ 2000 contacts/user) | < 300 ms |
| Pending-jobs sweep cycle (process 100 jobs) | < 5 s |

Operations exceeding p95 by 2× in production trigger a perf investigation. Baselines are revisited after the first 30 days of production telemetry.

---

## Appendix A: Default Labels by Domain

| Domain | Labels |
|---|---|
| **helpers_fixers** | Handyman, Tech support, Car stuff, Legal, Medical, Financial, Real estate, Pet care, Childcare, Movers, Travel tips, Local expert |
| **activity_partners** | Hiking, Running, Gym, Yoga, Cycling, Tennis, Golf, Water sports, Board games, Video games, Live music, Movies, Dining out, Drinks, Travel, Book club, Crafts, Sports fans |
| **life_teachers** | Career mentor, Industry expert, Fitness coach, Nutrition, Cooking, Languages, Music, Art, Writing, Tech skills, Finance, Parenting, Relationships, Spirituality, Life experience |
| **social_connectors** | Industry networker, Startup world, Party host, Matchmaker, Community leader, Event organizer, Club member, Alumni connector, Church/faith, Knows everyone |
| **home_team** | Inner circle, Ride-or-die, Emergency contact, Confidant, Family core, Old friend, Accountability, Celebrates wins, Tough love, Co-pilot |

---

## Appendix B: Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `TRIBES_ES_URL` | Yes | — | Elasticsearch cluster URL |
| `TRIBES_ES_API_KEY` | Yes | — | API key (from GCP Secret Manager) |
| `TRIBES_ES_INDEX_PREFIX` | No | `tribes` | Index name prefix (use `test_<uuid>` in tests) |
| `TRIBES_ID_MERGE_THRESHOLD` | No | `0.85` | Minimum score to merge as duplicate |

---

## 16. V2 Architecture: Canonical Concepts + Graph Traversal

V1 is locked: lexical normalization via ES, no embeddings, no graph. V2 unlocks two deferred capabilities simultaneously:

1. **Canonical concept resolution** — "hiker" → set of canonical label IDs.
2. **Multi-hop graph traversal** — "within 5 degrees" → bounded BFS over a social graph.

### Trigger Query

> *"Show me the most avid hiker within 5 degrees of separation of my friend group."*

Neither ES alone nor a graph store alone is sufficient.

### Query Decomposition — Persistence Primitives

| # | Primitive | Plain Language | Store | Operation |
|---|-----------|----------------|-------|-----------|
| 1 | Concept resolution | "hiker" → `canonical_label_id`s | ES (`tribes_canonical_labels`) | kNN + exact-stem pre-filter |
| 2 | Graph traversal | 5-hop friend frontier | ArangoDB | Bounded BFS, depth ≤ 5 |
| 3 | Assignment intersection | frontier × concept | ES (`tribes_assignments`) | `terms` filter on both |
| 4 | Affinity ranking | "most avid" | ES aggregation | Composite scoring |

**Affinity score:** `Σ over matching assignments: base_count + recency_decay(assigned_at) + intensity_boost(rating)`. Computed at query time via ES `script_score`. 90-day half-life default, tunable.

### Store Selection

**Option A — ES alone, denormalized graph fan-out.** Disqualified: write amplification catastrophic. 200-friend contact whose friends each have 200 friends → 40,000-entry `hop_2`. At hop_5 with any density, intractable.

**Option B — ES + ArangoDB.** Each store does what it's designed for. Application-layer joins. **Selected.**

**Option C — Analytical pipeline (BigQuery/ClickHouse).** Disqualified on functional grounds. Nightly batch incompatible with "show me right now."

### Recommendation: Option B — ES + ArangoDB

ArangoDB over Neo4j: multi-model (documents + graph in one engine), AQL expresses bounded BFS concisely, single binary (no community/enterprise feature gap for clustering, no Java heap tuning). Graph nodes share `_key` with ES `tribes_contacts._id` — no ORM translation step.

**Consistency:** dual-write contacts and friendship edges to both stores at the application service layer. Logical write coordinator with retry. No distributed transactions across stores.

### Canonical Embedding Layer (`tribes_canonical_labels`)

Additive — no V1 schema altered.

```json
{
  "mappings": {
    "properties": {
      "canonical_label_id":  { "type": "keyword" },
      "canonical_surface":   { "type": "keyword" },
      "aliases":             { "type": "keyword" },
      "normalized_stems":    { "type": "keyword" },
      "embedding":           { "type": "dense_vector", "dims": 768, "index": true, "similarity": "cosine" },
      "created_at":          { "type": "date" },
      "source_bin_count":    { "type": "integer" }
    }
  }
}
```

**Population (lazy sweep at V2 ship):** sweep distinct `tribes_bins.normalized_name` → cluster by stem then embedding → assign `canonical_label_id` → write canonical docs → backfill `tribes_bins.canonical_label_id`.

**V1 field as pre-filter.** Pre-filter via `terms`/`prefix` on `normalized_stems` BEFORE kNN. Eliminates ~95% of canonical label space before vector search.

### Graph Layer — ArangoDB Schema

**Nodes (`contacts` collection):** `_key` = `contact_id` (shared with ES). Store only what's needed for traversal/identity. Do NOT replicate document fields from ES.

**Edges (`friendships` edge collection):** `_from`, `_to`, `relationship_type`, `established_at`, `bidirectional`.

**Directionality:** undirected. AQL traversal uses `ANY`. Asymmetric follow relationships, if ever needed, are a separate edge collection in V3.

**Indices:** `contacts._key` (native primary), `friendships._from`/`_to` (default edge indices), `contacts.user_id` (persistent).

**Bounded BFS query (AQL):**

```aql
FOR seed IN contacts
  FILTER seed.user_id == @requesting_user_id
  FOR contact, edge, path
    IN 1..5 ANY seed
    GRAPH 'friend_graph'
    OPTIONS { uniqueVertices: 'global', bfsMode: true }
    FILTER contact._key != seed._key
    RETURN DISTINCT contact._key
```

`1..5` is the depth bound (inclusive); never exceed 5 in V2. `uniqueVertices: 'global'` essential for correctness in dense graphs.

### V2 Query Execution Plan

| Step | Store | Round-trips | Notes |
|---|---|---|---|
| 1: Concept resolution | ES | 1 | Pre-filter + kNN, threshold ≥ 0.82 |
| 2: Graph traversal | ArangoDB | 1–2 | BFS depth ≤ 5; **frontier hard cap 50,000 contacts** |
| 3: Assignment intersection | ES | 1 | `terms` filter on `canonical_label_id` + `contact_id` |
| 4: Affinity scoring | ES (in Step 3) | 0 | `script_score` within Step 3 response |
| 5: Sort + paginate | ES (in Step 3) | 0 | `from` / `size` |
| 6: Contact hydration (optional) | ES | 1 | `mget` by `_id` |

**Total: 3–4 round-trips.**

**Frontier explosion risk.** O(F⁵) theoretical. Real-world clustering + `uniqueVertices: 'global'` → 150-friend user gets 10k–100k unique contacts at depth 5. Hard cap 50,000; if exceeded, return closest-hop first (BFS ordering) and log — signal V3 may be warranted.

### Migration Path V1 → V2

V2 is purely additive. No V1 indices altered or dropped.

**New artifacts:** `tribes_canonical_labels` (ES), ArangoDB `contacts` + `friendships` collections + `friend_graph` named graph.

**Schema additions:** `tribes_bins.canonical_label_id` (keyword, null until backfill), `tribes_assignments.canonical_label_id` (keyword, null until backfill, derived via `bin_id`).

**Backfill sequence (background):** sweep `normalized_name` → write canonical docs → backfill bin FK → backfill assignment FK via bin join → populate ArangoDB from ES.

**Zero-downtime.** All backfill non-destructive. V1 paths function throughout. V2 paths fall back to V1 (lexical only) until backfill completes.

**Rollback:** new ES fields nullable/inert. ArangoDB can be taken offline without affecting V1.

### Honest Ceiling

Holds at: thousands–low-hundreds-of-thousands of users, average degree 100–500, sub-second p95.

Won't hold at multi-million users with dense graphs (5-hop frontier exceeds practical `terms` filter; ArangoDB single-server BFS becomes bottleneck) or sub-100ms global SLA.

V3 (if ever needed): distributed graph compute (Pregel, GraphFrames on Spark). **Don't pre-build for V3 in V2.** Trigger conditions: user count > 1M, average degree > 1000, or p95 query latency > 2s.
