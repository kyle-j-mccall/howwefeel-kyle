---
layer: persistence
parentDocument: '_bmad-output/shared/architecture/overview.md'
project_name: 'Tribes'
date: '2026-01-15'
---

# Persistence Layer Architecture (Elasticsearch)

> Cross-layer overview lives at `_bmad-output/shared/architecture/overview.md` — read it first.
> Full ES wrapper specification: `elasticsearch-wrapper-spec.md` (this directory).
> Slice-based spec/test breakdown: `slices/`.

---

## Data Architecture

**Store: Elasticsearch (V1)**

> Future path: ArangoDB (or Neo4j) for V2 multi-hop social graph queries.

| ES Index | Entities |
|---|---|
| `tribes_contacts` | Contacts (EAV, normalized, identity-resolved) |
| `tribes_bins` | Labels/Bins per user |
| `tribes_assignments` | Contact↔Bin assignments (flick events, affinityWeight) |
| `tribes_tribes` | Tribe definitions (static member lists + dynamic stored queries) |

**Repository Layer:** Strongly-typed Python wrapper hides all ES DSL. Service layer imports only from `repositories.interfaces`. See `elasticsearch-wrapper-spec.md` for all index mappings, query patterns, and write internals.

**Identity Resolution:** Probabilistic blocking + scoring in `repositories/es/identity/`. Configurable merge threshold (default 0.85). Graph-based resolution deferred to V2.

**Caching:** Deferred to post-V1. ES query cache handles repeated reads.

---

## Data Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                      ELASTICSEARCH (V1)                          │
│                                                                  │
│  tribes_contacts      — Contacts (EAV, identity-resolved)        │
│  tribes_bins          — Labels/Bins per user                     │
│  tribes_assignments   — Contact↔Bin assignments + affinityWeight │
│  tribes_tribes        — Static lists + dynamic stored queries    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  V2 (Deferred): Graph DB                         │
│  Identity Unification + multi-hop social graph                   │
│  (Separate spec — Identity Unification Service)                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Naming Conventions (Persistence)

**ES Document Field Names:** `snake_case` at the storage layer. The repository layer translates to `camelCase` at the API contract boundary (see `_bmad-output/shared/architecture/overview.md`).

| Element | Convention | Example |
|---------|------------|---------|
| Index name | `snake_case`, prefixed `tribes_` | `tribes_contacts`, `tribes_bins` |
| Document field | `snake_case` | `created_at`, `user_id`, `domain_id` |
| Document `_id` | string, prefixed by entity type | `contact_abc123`, `bin_xyz789` |

---

## Related Specifications

- `elasticsearch-wrapper-spec.md` — full V1 wrapper specification (~2300 lines)
- `elasticsearch-wrapper-test-plan.md` — test plan for the wrapper
- `slices/00-shared-context.md` — shared context for all 8 slices
- `slices/01-foundation-spec.md` … `slices/08-readpath-spec.md` — per-slice specs and tests
- `slices/feed-order.md` — process note on feeding slices to the BMAD epic-creation workflow
