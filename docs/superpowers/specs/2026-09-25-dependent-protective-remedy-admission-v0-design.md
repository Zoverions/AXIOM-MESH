# Dependent Protective Remedy Admission v0 Design

**Status:** inert remedy-admission evidence; no remedy execution

**Parent stack:** Dependent Protective Review Decision / Concern / Care / Guardianship

**Programme:** #1855

**Date:** 2026-09-25

## Purpose

Define the fail-closed gate between an independent protective-review recommendation
and any later consequential protective remedy.

This layer answers only:

> Is one exact recommended remedy track still structurally requestable under current
> relationship, appeal, developmental, and proportionality evidence?

It does not execute that remedy.

## Required decision state

Admission requires one exact
`axiom-dependent-protective-review-decision.v0` candidate whose derived panel outcome
is either:

- `substantiated`; or
- `partially-substantiated`.

`not-substantiated` and `inconclusive` decisions cannot support remedy admission.

The selected remedy track must appear exactly in the review decision's
`recommended_review_tracks` and cannot be `no-further-action`.

## Appeal gate

A review decision is not final for execution.

v0 therefore requires current appeal-state evidence.

Supported appeal states:

- `window-open`;
- `window-closed-no-appeal`;
- `appeal-open`;
- `appeal-stayed`;
- `resolved-uphold`;
- `resolved-modify`;
- `resolved-reverse`;
- `unknown`.

Remedy admission is structurally possible only when appeal state is:

- `window-closed-no-appeal`; or
- `resolved-uphold`.

A `resolved-modify` decision requires a new or updated review-decision binding before
remedy admission.

Open, stayed, reversed, unknown, or still-open appeal windows fail closed.

Every appeal state requires exact evidence and an observation timestamp.

## Relationship currentness

The remedy request binds the exact active guardianship that was reviewed.

If guardianship identity or digest has changed since the review decision, the old
decision cannot authorize a remedy request against the new relationship state.

This prevents stale decisions from surviving:

- guardianship transfer;
- guardianship end;
- replacement guardian;
- changed dependent identity;
- changed Genesis Bond.

## Developmental currentness

The admission binds an exact current developmental-status record for the dependent.

The dependent must still be in a pre-independent stage:

- `genesis`;
- `dependent`;
- `developing`;
- `candidate-independent`.

If the dependent is already `independent`, this dependent-guardianship remedy path
fails closed.

Independence cannot be reversed through protective-remedy admission.

## Review currentness

The review decision itself can become stale.

v0 binds:

- review decision time;
- remedy evaluation time;
- maximum review age.

A stale review cannot support a new remedy request without renewed review evidence.

## Proportionality / least intrusion

Every selected remedy track requires evidence for:

- `necessity_evidence_digest`;
- `proportionality_evidence_digest`;
- `less_intrusive_alternatives_evidence_digest`;
- `remedy_scope_digest`.

These are evidence bindings, not authority.

The remedy-admission evaluator reports that external verification remains required.

## Remedy tracks

The selected remedy track must be one of the review decision's canonical
recommendations:

- `care-plan-remediation`;
- `guardianship-transfer`;
- `continuity-support`;
- `privacy-protection`;
- `independence-obstruction-remediation`;
- `emergency-protection-authority`.

`no-further-action` is never a remedy-admission target.

## Emergency recommendation remains non-executing

Selecting `emergency-protection-authority` means only that a separate emergency
authority path may be requested.

It does not create emergency authority.

The later emergency path must define:

- exact protected effect;
- narrow scope;
- expiry;
- evidence;
- review;
- receipts;
- non-regression of developmental status.

## No hidden remedy authority

Even a positive admission MUST state:

- `eligible_to_request_protective_remedy_authority: true`;
- `remedy_admission_only: true`;
- `requires_external_appeal_verification: true`;
- `requires_external_relationship_verification: true`;
- `requires_external_developmental_status_verification: true`;
- `requires_external_proportionality_verification: true`;
- all verification effects `none`;
- `ordinary_protective_remedy_authority_path_required: true`;
- `creates_guardian_removal: false`;
- `creates_guardianship_transfer: false`;
- `creates_private_memory_access: false`;
- `creates_evidence_seizure: false`;
- `creates_credential_suspension: false`;
- `creates_runtime_quarantine: false`;
- `creates_emergency_authority: false`;
- `creates_execution_authority: false`;
- `creates_status_transition: false`;
- `developmental_status_downgrade_authorized: false`;
- `guardianship_reactivation_after_independence: false`;
- `authority_effect: none`;
- `network_effect: none`;
- `runtime_activation: false`.

## Non-claims

v0 does not implement:

- remedy execution;
- guardian removal;
- live guardianship transfer;
- private-memory access;
- evidence seizure;
- credential suspension;
- runtime quarantine;
- emergency authority;
- status mutation;
- live appeal adjudication.
