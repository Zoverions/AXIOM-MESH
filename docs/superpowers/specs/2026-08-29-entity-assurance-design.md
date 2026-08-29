# Entity Assurance Design

Date: 2026-08-29
Status: implementation contract

## Purpose

Entity Assurance answers a narrow question: what evidence exists that an actor is sufficiently continuous, unique, independent, attributable, attested, credentialed, sponsored, or bound for a particular relying context?

It does **not** define what an agent is, require government identity, grant authority, delegate capability, or make truth claims.

## Core invariants

1. Assurance evidence is always non-authorizing.
2. Assurance policy has `authority_effect: none` and `delegation_effect: none`.
3. Missing required evidence fails closed.
4. Current negative evidence is deny-dominant within a required dimension.
5. Expired and future-dated evidence cannot satisfy a policy.
6. Legal identity is optional and selected by the relying policy, not AXIOM globally.
7. Persistent pseudonymous identity is a first-class acceptable mode.
8. Evidence is subject-bound, digest-bound, classed, strength-qualified, and time-scoped.
9. Existing machine-identity continuity credentials and repository assurance evidence may feed this layer, but neither is redefined by it.
10. A satisfied assurance decision is evidence for a relying decision; it is not permission to act.

## Dimensions

- continuity
- uniqueness
- provenance
- authority
- independence
- reputation
- attestation
- credentialing
- human_sponsorship
- hardware_binding
- organization_binding

`authority` here means evidence about an already-existing authority relationship. It does not create authority.

## Evidence classes

- measured
- authenticated_assertion
- independently_verified
- inference
- declaration

Policies choose which classes and minimum strengths they accept for each required dimension.

## Identity modes

`none` — no identity-binding requirement.

`persistent-pseudonymous` — continuity evidence must bind the subject to a persistent pseudonymous-or-stronger scope. No legal identity is required.

`legal` — a relying application explicitly requires current passing evidence with legal binding. AXIOM does not make this the default.

## Evaluation

For each required dimension, the evaluator filters to current evidence for the target subject, accepted evidence classes, and at least the required strength.

- qualifying `fail` => dimension denied
- otherwise qualifying `pass` => dimension satisfied
- otherwise => dimension missing

The overall result is `satisfied` only when every required dimension is satisfied, no required dimension is denied, and the selected identity requirement is satisfied.

The returned decision always reports `authority_granted: false` and `delegation_granted: false`.

## Relationship to existing AXIOM layers

Machine identity credentials prove issuer/key continuity only and remain bounded from legal identity, personhood, reputation, truth, and authority claims.

The existing assurance graph describes repository/change-front evidence and remains separate. Entity Assurance consumes subject-level evidence and policy; it does not overload software/change assurance semantics.

Agent composition already carries an `assurance_policy_ref`; this module supplies the first concrete policy/evaluation primitive behind that reference without activating a runtime or broadening authority.

## Initial non-goals

- global identity registry
- mandatory KYC
- biometric identification
- global reputation score
- probabilistic personhood classification
- automatic capability grants
- automatic governance eligibility
- cross-domain correlation of pseudonyms

Those require separate threat models and explicit authority/privacy decisions.
