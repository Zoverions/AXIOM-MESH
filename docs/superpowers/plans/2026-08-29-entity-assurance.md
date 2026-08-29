# Entity Assurance Implementation Plan

Date: 2026-08-29

## Goal

Add a fail-closed, configurable subject-level assurance primitive behind the existing `assurance_policy_ref`, without granting authority or making legal identity mandatory.

## Tasks

1. Add `mesh/test/entity-assurance.test.mjs` first and establish the primitive with a failing test.
2. Implement `mesh/src/lib/entity-assurance.mjs` with canonical validation, evidence/policy digests, currentness checks, deny-dominant evaluation, and immutable decisions.
3. Add JSON Schema contracts for evidence and policy under `mesh/config/`.
4. Add design and security documentation describing Sybil/coordination threats, privacy boundaries, and non-authority invariants.
5. Verify the focused test, then run the repository test/check command available in CI before merge.

## Acceptance criteria

- Pseudonymous continuity can satisfy policy without legal identity.
- Legal identity can be explicitly required by a relying policy.
- Missing, expired, future, mismatched-subject, duplicate, unsupported, or insufficient evidence fails closed or is excluded from satisfaction.
- Current qualifying negative evidence vetoes the affected required dimension.
- Evidence and policy cannot grant authority or delegation.
- Decisions are deterministic, digest-bound, and immutable.
- Existing machine identity and change-front assurance semantics remain unchanged.
