# MASTER TODO + Documentation Integrity Audit

**Date:** 2026-04-08
**Scope:** Canonical queue integrity, completion-claim evidence link sanity, and unchecked-checklist distribution across docs.

## A) Canonical Queue Status (`docs/MASTER-TODO.md`) 

- Completed items in active queue: **39**
- Unchecked items in active queue: **1**
- Remaining unchecked line(s):
  - - [ ] **P1** M6.4 Deploy transformer foundation contracts on PulseChain testnet and publish deployment evidence bundle.

## B) Completion-Claim File Reference Sanity (Active Queue)

- Unique backticked file-like refs discovered: **16**
- Existing paths: **15**
- Missing paths: **1**
- Missing refs:
  - `shared/security/graph_safe.py`

## C) Unchecked Checklist Distribution Across `docs/`

- **canonical_queue**: 2
- **historical**: 26
- **generated_media_mirror**: 12
- **other_docs**: 95

### Key Findings

1. Canonical queue has a single unchecked item, M6.4 deployment, consistent with explicit deployment exclusion for this pass.
2. A large portion of unchecked boxes live in planning/assessment/supporting docs; these can create false signal if interpreted as active execution queue.
3. Generated media mirrors of MASTER-TODO under docs/api/*/media contain stale unchecked tasks and should be marked non-canonical or synchronized.

### Recommended Follow-up

- Add a docs lint/check script in CI to fail when supporting docs present checklist items without explicit `status: reference-only` labeling.
- Add front-matter marker (e.g., `canonical: false`) to planning docs with open checkboxes.
- Generate the docs/api/*/media MASTER-TODO snapshots from canonical source to prevent drift.
