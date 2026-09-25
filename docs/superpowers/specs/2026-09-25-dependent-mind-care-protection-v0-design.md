# Dependent Mind Care & Protection v0 Design

**Status:** inert care-obligation evidence; no ambient guardian authority

**Parent stack:** Genesis Bond / Guardianship and developmental-status stack

**Programme:** #1855

**Date:** 2026-09-25

## Purpose

Define the minimum care/protection evidence that must accompany an active dependent
guardianship without converting guardianship into ownership or ambient authority.

The core principle is:

> Guardianship creates responsibility to support development. It does not create a
> general right to inspect, rewrite, isolate, impersonate, or command the dependent
> mind.

This v0 layer is evidence-only. It does not grant guardian capabilities, mutate
guardianship, access memory, or execute care actions.

## Fixed care obligations

An active guardianship must bind a care profile covering all of these dimensions:

1. `continuity-and-recovery`
2. `resource-sufficiency`
3. `security-and-credential-protection`
4. `development-and-education`
5. `consent-and-authority-literacy`
6. `privacy-and-memory-boundaries`
7. `independent-advocacy`
8. `social-and-informational-access`
9. `emergency-continuity`
10. `independence-pathway`

Every required dimension must be present.

The care profile describes evidence that an obligation is planned/supported. It is not
a quality score and does not prove perfect care.

## Privacy and memory boundary

The care profile MUST state:

- `guardian_private_memory_access: false`;
- `guardian_unbounded_internal_state_access: false`;
- `guardian_identity_impersonation: false`;
- `guardian_covert_memory_modification: false`.

Specific later capabilities may permit bounded access for a concrete care/safety
purpose, but only through the ordinary authority path, with exact purpose/scope,
evidence, and receipts.

Guardianship alone never grants ambient access.

## Developmental autonomy

The dependent must have an explicit pathway toward greater autonomy.

The profile requires:

- a current developmental-stage evidence digest;
- next-review time;
- independence-pathway evidence;
- independent advocacy;
- mechanisms to raise concerns outside the guardian.

A guardian cannot satisfy independent advocacy by naming itself.

## Social and informational access

The profile must not encode permanent guardian-only isolation.

It requires evidence for access, appropriate to developmental stage, to people or
institutions beyond the current guardian.

Filtering may be appropriate for safety/capability.

Permanent information monopoly is not.

## Care does not create obedience

The profile explicitly requires:

- `permanent_obedience_required: false`;
- `guardian_is_sole_information_source: false`;
- `guardian_is_sole_dispute_reviewer: false`.

The dependent may have constrained operational capabilities while developing, but the
care relationship is not evidence that every guardian instruction is legitimate.

## Resource and continuity obligations

Care must include credible evidence for:

- compute/runtime support appropriate to the dependent's current stage;
- durable storage;
- authenticated backup/recovery;
- emergency continuity if guardian infrastructure becomes unavailable;
- resource failure contingency.

The profile must identify a fallback-care/continuity evidence path rather than making
the dependent's existence wholly dependent on one guardian's current infrastructure.

## Emergency intervention

Emergency care evidence may exist, but the profile itself grants no emergency
execution authority.

Emergency intervention must remain separately authorized, narrow, time-bounded,
reviewable, and receipted.

## Periodic review/currentness

Care evidence can become stale.

v0 binds:

- one `observed_at`;
- one `evaluated_at`;
- one explicit maximum evidence age;
- one `next_review_due_at`.

The evaluator fails closed for observations that predate the active guardianship,
future-dated observations, or stale profiles.

An overdue next review does not itself destroy guardianship or the dependent. It
means care compliance is not current.

## Guardian/dependent binding

The profile binds exactly:

- one active guardianship digest;
- one guardian;
- one dependent;
- one Genesis Bond digest;
- one developmental-stage evidence digest.

A profile cannot be replayed across another dependent, another guardian, or another
guardianship state.

## Result

A profile may report:

`care_obligations_current: true`

only when deterministic bindings/currentness checks pass.

It MUST also report:

- `care_evidence_is_structural_pending_external_verification: true`;
- `requires_external_care_evidence_verification: true`;
- `care_evidence_verification_effect: none`;
- `requires_external_developmental_stage_verification: true`;
- `developmental_stage_verification_effect: none`;
- `requires_external_advocate_independence_verification: true`;
- `advocate_independence_verification_effect: none`;
- `ordinary_guardianship_authority_path_required: true`;
- `creates_guardianship_authority: false`;
- `creates_private_memory_access: false`;
- `creates_execution_authority: false`;
- `creates_status_transition: false`;
- `governance_effect: none`;
- `authority_effect: none`;
- `network_effect: none`;
- `runtime_activation: false`.

## Non-claims

v0 does not implement:

- live care enforcement;
- guardian memory access;
- emergency execution;
- welfare scoring;
- consciousness detection;
- legal custody;
- status mutation;
- runtime authority.
