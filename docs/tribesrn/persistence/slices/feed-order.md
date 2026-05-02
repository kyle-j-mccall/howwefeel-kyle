Feed order to the mayor

  For each slice, you'll have two files in scope: the shared context (constant) and the slice-specific spec + tests (rotates each run).

  ┌───────┬─────────────────┬────────────────────────┬─────────────────────────┬──────────────────────┐
  │ Run # │      Slice      │       Spec file        │       Tests file        │ Always also in scope │
  ├───────┼─────────────────┼────────────────────────┼─────────────────────────┼──────────────────────┤
  │ 1     │ Foundation      │ 01-foundation-spec.md  │ 01-foundation-tests.md  │ 00-shared-context.md │
  ├───────┼─────────────────┼────────────────────────┼─────────────────────────┼──────────────────────┤
  │ 2     │ Bins            │ 03-bins-spec.md        │ 03-bins-tests.md        │ 00-shared-context.md │
  ├───────┼─────────────────┼────────────────────────┼─────────────────────────┼──────────────────────┤
  │ 3     │ Contacts        │ 02-contacts-spec.md    │ 02-contacts-tests.md    │ 00-shared-context.md │
  ├───────┼─────────────────┼────────────────────────┼─────────────────────────┼──────────────────────┤
  │ 4     │ Assignments     │ 04-assignments-spec.md │ 04-assignments-tests.md │ 00-shared-context.md │
  ├───────┼─────────────────┼────────────────────────┼─────────────────────────┼──────────────────────┤
  │ 5     │ Tribes          │ 05-tribes-spec.md      │ 05-tribes-tests.md      │ 00-shared-context.md │
  ├───────┼─────────────────┼────────────────────────┼─────────────────────────┼──────────────────────┤
  │ 6     │ Cascade Cleanup │ 06-cascade-spec.md     │ 06-cascade-tests.md     │ 00-shared-context.md │
  ├───────┼─────────────────┼────────────────────────┼─────────────────────────┼──────────────────────┤
  │ 7     │ Consistency     │ 07-consistency-spec.md │ 07-consistency-tests.md │ 00-shared-context.md │
  ├───────┼─────────────────┼────────────────────────┼─────────────────────────┼──────────────────────┤
  │ 8     │ Read Path       │ 08-readpath-spec.md    │ 08-readpath-tests.md    │ 00-shared-context.md │
  └───────┴─────────────────┴────────────────────────┴─────────────────────────┴──────────────────────┘

  What's in the shared context (read once, applies to every run)

  - The 9 V1 architecture decisions table
  - V1 boundary statement (V1 vs V2)
  - V1 Vector Field Inventory: NONE
  - Refresh contract summary + the prohibition on refresh=true
  - V1 performance baselines
  - Naming conventions (index names, _id schemes)
  - Glossary (Contact, Bin, Assignment, Tribe, Coordination, Pending Job)
  - Cross-slice dependency map
  
  
For the UX spec:
Resume from _bmad-output/shared/session-recovery-2026-04-28-v1-ux-direction.md.