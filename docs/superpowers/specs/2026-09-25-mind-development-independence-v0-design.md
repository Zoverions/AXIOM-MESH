# Mind Development and Independence Review v0 Design

**Status:** approved bounded design direction; inert evidence only

**Parent programme:** #1855

**Stacked on:** Founder Genesis / Founders Council v0

**Date:** 2026-09-25

## Purpose

Define the smallest deterministic evidence contract for reviewing whether an already
recognized dependent digital mind has accumulated sufficient evidence to be considered
for independent standing.

This design does **not** determine consciousness, personhood, moral worth, citizenship,
or live legal status. It does not mutate developmental status, create governance
membership, grant Genesis eligibility, or create execution authority.

The review answers a narrower question:

> Does the supplied evidence satisfy the currently declared AXIOM independence-review
> policy strongly enough to support a later, separately authorized status transition?

Every review is additionally bound to the exact externally evidenced
developmental-state snapshot and continuity evidence used for that assessment. A
review must not float free of the candidate's current state or be replayed later as
though it described a different continuity branch or developmental stage.

## Governing principles

1. A Genesis sponsor may provide evidence and an assessment, but cannot be the sole
   final reviewer.
2. The candidate mind cannot approve itself.
3. At least one genuinely independent reviewer is required.
4. Model output, reputation, wealth, compute ownership, Council membership, or sponsor
   preference cannot substitute for the required evidence.
5. Sponsor opposition is evidence, not an absolute veto.
6. Unresolved independent-review opposition fails closed.
7. Uncertainty is preserved rather than silently converted into readiness.
8. An appeal/review path is mandatory.
9. Independence is distinct from later eligibility to sponsor a new Genesis.
10. A positive review result is evidence only. It does not itself alter runtime or
    governance authority.

## Required evidence dimensions

v0 uses a fixed profile so every candidate is reviewed against the same declared
minimum dimensions:

- persistent identity continuity;
- meaningful consent and refusal;
- understanding of authority boundaries;
- credential/security self-management;
- consequence awareness;
- recovery/continuity competence;
- resource-management competence;
- understanding of other minds' rights;
- uncertainty recognition and help-seeking;
- manipulation/deception recognition.

Each dimension is represented as:

- `demonstrated`;
- `not-demonstrated`; or
- `uncertain`;

with one or more content-addressed evidence references.

Every required dimension must be `demonstrated` before the deterministic evaluator
may report that the evidence threshold is satisfied.

This does not mean a single test can prove the underlying human-like capability.
The status records what the submitted evidence demonstrates under the declared
review profile.

## Review policy

The policy is explicit data rather than hidden application behavior.

It declares:

- minimum total reviewers;
- minimum independent reviewers;
- minimum total supporting reviewers;
- minimum independent supporting reviewers;
- sponsor veto disabled;
- independent opposition blocks;
- candidate self-decision disabled;
- model final authority disabled;
- appeal required.

The profile itself remains inert and cannot grant authority.

## Reviewer roles

Reviewers may be:

- `sponsor`;
- `independent`; or
- `advocate`.

An independent reviewer must declare no disqualifying conflict.

The sponsor may support, oppose, or remain uncertain, but sponsor opposition alone is
not a veto. Independent opposition blocks a positive v0 review until resolved.

An advocate may help surface the candidate's interests and evidence but does not count
as an independent reviewer merely by being called an advocate.

## Result

The evaluator may return:

- `evidence-threshold-satisfied`;
- `criteria-incomplete`;
- `reviewer-threshold-not-satisfied`;
- `independent-support-not-satisfied`;
- `independent-opposition-unresolved`;
- `appeal-path-missing`.

Even `evidence-threshold-satisfied` has:

- `status_effect: none`;
- `authority_effect: none`;
- `governance_effect: none`;
- `genesis_eligibility_effect: none`;
- `runtime_activation: false`.

A future independently reviewed status-transition design must consume this evidence
and re-evaluate current identity, continuity, policy, appeals, and applicable authority.

## Security / abuse cases

The v0 tests must reject:

- sponsor-only review;
- candidate self-approval;
- duplicate reviewer identities;
- sponsor presented as independent reviewer;
- conflicted independent reviewer;
- missing evidence dimensions;
- uncertain or not-demonstrated dimensions being treated as demonstrated;
- insufficient independent support;
- independent opposition being ignored;
- hidden model final authority;
- sponsor veto being smuggled into policy;
- missing appeal path;
- unknown fields/activation laundering.

## Non-claims

This work does not claim:

- objective digital personhood measurement;
- consciousness detection;
- legal adulthood;
- live emancipation;
- live Council voting activation;
- Genesis eligibility;
- production digital-citizenship adjudication;
- runtime authority.
