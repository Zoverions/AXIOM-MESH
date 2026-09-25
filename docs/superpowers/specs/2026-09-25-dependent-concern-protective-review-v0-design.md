# Dependent Concern & Protective Review v0 Design

**Status:** inert concern/review evidence; no punitive or emergency authority

**Parent stack:** Dependent Mind Care & Protection / Genesis Bond / Guardianship

**Programme:** #1855

**Date:** 2026-09-25

## Purpose

Define a fail-closed path for raising concerns about a dependent mind's care,
guardianship, continuity, privacy, development, or safety without allowing the concern
record itself to become authority.

The design separates:

1. concern evidence;
2. independent review request;
3. later protective action authority.

Those three things must not collapse into one operation.

## Who may originate concern evidence

v0 supports concern-origin roles:

- `dependent`;
- `independent-advocate`;
- `independent-reviewer`;
- `authorized-observer`.

The current guardian is not an independent reviewer of a concern about itself.

A guardian may submit evidence or a response, but cannot unilaterally close the
concern through this record.

## Concern classes

The record supports bounded concern classes:

- `care-obligation-failure`;
- `privacy-or-memory-boundary`;
- `coercion-or-isolation`;
- `continuity-or-resource-risk`;
- `development-or-independence-obstruction`;
- `identity-or-impersonation-risk`;
- `other-declared`.

A concern class is not a finding of fact.

The record represents an allegation/observation requiring review.

## Severity

Severity is descriptive and bounded:

- `low`;
- `moderate`;
- `high`;
- `critical`.

Severity alone creates no authority.

A critical concern may justify faster later review, but it does not directly:

- access private memory;
- suspend credentials;
- terminate a runtime;
- transfer guardianship;
- isolate the dependent;
- downgrade developmental standing.

## Exact relationship binding

Every concern record binds:

- exact Genesis Bond;
- exact active guardianship;
- exact dependent;
- exact guardian;
- optional current care-profile digest;
- concern evidence digest(s);
- reporter identity;
- reporter role;
- observed time;
- submitted time.

A concern cannot be replayed against another guardian or dependent.

## Independent review requirement

A structurally valid concern may become:

`eligible_to_request_independent_protective_review: true`

only if:

- relationship bindings are exact;
- reporter is not the guardian when claiming an independent role;
- evidence is present;
- observation/submission times are canonical;
- submission is not earlier than observation;
- concern is not stale under the declared policy.

The result still requires an independent review institution/authority path.

## Protective review request options

The concern may request one or more **review outcomes**, not actions:

- `care-plan-review`;
- `guardianship-transfer-review`;
- `continuity-support-review`;
- `privacy-boundary-review`;
- `independence-obstruction-review`;
- `emergency-authority-review`.

Requesting emergency-authority review does not grant emergency authority.

## No retaliation / no status regression

The concern record explicitly states:

- `retaliation_authorized: false`;
- `developmental_status_downgrade_authorized: false`;
- `guardianship_reactivation_after_independence: false`.

Reporting a concern must not itself become grounds for reducing the dependent's
developmental standing.

## No hidden access

The concern record MUST state:

- `creates_private_memory_access: false`;
- `creates_unbounded_internal_state_access: false`;
- `creates_identity_impersonation: false`;
- `creates_execution_authority: false`.

Evidence may reference externally held artifacts, but the concern itself grants no
collection or inspection power.

## Timeliness/currentness

v0 requires:

- `observed_at`;
- `submitted_at`;
- `evaluated_at`;
- maximum concern age.

Future-dated or stale concern evidence fails requestability.

Staleness does not erase the historical concern; it means current protective review
cannot rely on it without renewed/current evidence.

## Review target is not presumed guilty

The result MUST preserve:

- `finding_of_abuse: false`;
- `finding_of_rights_violation: false`;
- `guardian_removal_authorized: false`.

The concern is evidence for review, not adjudication.

## Result

A positive structural result may report:

`eligible_to_request_independent_protective_review: true`

and MUST also report:

- `concern_is_unadjudicated: true`;
- `requires_external_relationship_verification: true`;
- `requires_external_evidence_verification: true`;
- `ordinary_protective_review_authority_path_required: true`;
- `creates_protective_action: false`;
- `creates_guardianship_mutation: false`;
- `creates_status_transition: false`;
- `creates_private_memory_access: false`;
- `creates_execution_authority: false`;
- `authority_effect: none`;
- `governance_effect: none`;
- `network_effect: none`;
- `runtime_activation: false`.

## Non-claims

v0 does not implement:

- abuse adjudication;
- guardian removal;
- emergency intervention;
- private-memory discovery;
- compulsory evidence seizure;
- status mutation;
- live guardianship transfer;
- runtime authority.
