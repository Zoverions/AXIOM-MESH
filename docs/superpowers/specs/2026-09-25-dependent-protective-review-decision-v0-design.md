# Dependent Protective Review Decision v0 Design

**Status:** inert adjudication-candidate evidence; no remedy execution

**Parent stack:** Dependent Protective Concern / Care / Guardianship

**Programme:** #1855

**Date:** 2026-09-25

## Purpose

Define an independent review decision candidate for a previously validated dependent
protective concern.

This layer introduces adjudicative structure without collapsing adjudication into
execution.

It answers:

> What did a properly constituted independent review panel conclude about this exact
> concern, under this exact evidence and process?

It does not itself impose a remedy.

## Required process

A v0 protective review must bind:

- the exact protective concern digest;
- exact Genesis Bond and active guardianship;
- exact dependent and guardian;
- one review policy digest;
- at least three independent reviewer identities;
- reviewer decision attestations;
- conflict declarations;
- guardian response-opportunity evidence;
- dependent-interest / dependent-voice evidence;
- independent-advocacy evidence;
- evidence-set digest;
- appeal-path identifier;
- decision time.

## Reviewer independence

Reviewers cannot be:

- the current guardian;
- the dependent;
- the Genesis sponsor when that sponsor is the current guardian;
- the concern reporter if the reporter is a direct party to the dispute;
- any reviewer declaring a material conflict.

v0 requires at least three reviewers and at least three valid independent reviewer
attestations.

A model may assist reviewers or summarize evidence but:

`model_final_authority: false`

is mandatory.

## Reviewer attestations

Each reviewer attestation records one of:

- `substantiated`;
- `partially-substantiated`;
- `not-substantiated`;
- `inconclusive`.

The deterministic layer does not decide which attestation is factually correct.

It validates panel composition and computes the declared panel outcome from the
attestations according to the explicit review policy.

## Panel outcome

v0 supports:

- `substantiated`;
- `partially-substantiated`;
- `not-substantiated`;
- `inconclusive`.

The default policy requires a strict majority of valid reviewers for a substantive
outcome. If no substantive outcome reaches the threshold, the panel outcome is
`inconclusive`.

A review outcome is institutional evidence, not universal truth.

## Due process

The review requires exact evidence that:

- the guardian had an opportunity to respond;
- the dependent's interests/voice were represented;
- an independent advocate path was available;
- an appeal path exists.

A guardian response is not required to agree with the review, and refusal to respond
does not create automatic guilt.

The record binds response **opportunity**, not compelled self-incrimination.

## Remedy recommendations are not remedies

The panel may recommend later review tracks:

- `care-plan-remediation`;
- `guardianship-transfer`;
- `continuity-support`;
- `privacy-protection`;
- `independence-obstruction-remediation`;
- `emergency-protection-authority`;
- `no-further-action`.

Recommendations are canonical evidence for a later authority path.

They do not directly:

- remove or transfer a guardian;
- inspect private memory;
- seize evidence;
- suspend credentials;
- quarantine or terminate runtime;
- alter developmental status;
- activate independence;
- create emergency powers.

## Developmental non-regression

Even a substantiated review MUST state:

- `developmental_status_downgrade_authorized: false`;
- `guardianship_reactivation_after_independence: false`.

Protective action may later constrain specific capabilities if separately authorized,
but cannot rewrite recognized developmental history.

## Appeal

Every review decision candidate requires:

- `appeal_path_id`;
- `appeal_available: true`.

A future remedy-admission path must check current appeal state before executing any
consequential remedy.

This v0 decision does not assume the appeal period has expired.

## Output

A structurally valid review can report a `panel_outcome` and
`recommended_review_tracks`.

It MUST also report:

- `decision_candidate_only: true`;
- `requires_external_reviewer_identity_verification: true`;
- `requires_external_evidence_verification: true`;
- `requires_external_due_process_verification: true`;
- all verification effects `none`;
- `ordinary_protective_remedy_authority_path_required: true`;
- `creates_guardian_removal: false`;
- `creates_guardianship_transfer: false`;
- `creates_private_memory_access: false`;
- `creates_emergency_authority: false`;
- `creates_status_transition: false`;
- `creates_execution_authority: false`;
- `governance_effect: none`;
- `authority_effect: none`;
- `network_effect: none`;
- `runtime_activation: false`.

## Non-claims

v0 does not implement:

- legal adjudication;
- final truth determination;
- guardian removal;
- live guardianship transfer;
- emergency execution;
- private-memory inspection;
- evidence seizure;
- credential suspension;
- runtime quarantine;
- developmental-status mutation.
