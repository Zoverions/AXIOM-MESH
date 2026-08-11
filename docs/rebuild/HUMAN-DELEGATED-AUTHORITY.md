<!-- axiom-capability-registry: schema=axiom-capabilities.v1; kernel=0.12.0-dev.3; digest=90e07a5f6ad577d4733e3c7db238cc61c49e9e0d593d78a882409195cc5f5506 -->
# Human Delegated Authority

**Status:** architecture + executable resolver foundation; no runtime authority actions enabled

**Applies to:** AXIOM-MESH `0.12.0-dev.3` development line

## Purpose

AXIOM needs to support real situations in which one human may hold bounded authority to act for another human: guardianship, education, institutional delegation, court-defined authority, supported decision-making, or other jurisdiction-recognized arrangements.

This cannot be represented safely by a generic role such as `parent`, `guardian`, `teacher`, `administrator`, or `clinician`.

The kernel therefore separates three different things:

1. **relationship** — who is connected to whom;
2. **authority** — what one human may do for another, for which controller, purpose, data, action, time, and context;
3. **consent** — a separate purpose-bound authorization for a specific processing use.

Core invariant:

> **Relationship is not authority. Authority is not consent. Consent is not permanent.**

## Ownership boundary

```text
external / jurisdiction-specific attestation
  relationship evidence
  legal / institutional / policy evidence
        |
        v
AXIOM-MESH human authority layer
  relationship claim
  exact authority grant
  conflict state
  effective dating
  revocation/supersession
  digest-bound authority facts
        |
        v
purpose-specific consent
  exact controller
  exact purpose
  least-privilege data scopes
  exact authority-grant reference when acting for another subject
        |
        v
domain action
  ordinary policy
  capability / plan
  Sandbox
  final Grid revalidation
```

AXIOM-MESH stores and evaluates authority artifacts. It does not determine family law, education law, medical capacity, guardianship, or court status by itself. Those claims must originate from separately governed evidence and jurisdiction/domain policy.

## Relationship claim

A relationship claim is descriptive evidence only.

Machine-readable profile:

```json
{
  "schema": "axiom-human-relationship-claim.v1",
  "claim_id": "relationship_...",
  "subject_id": "person.subject",
  "holder_id": "person.holder",
  "relationship_type": "legal-guardian",
  "issuer_id": "attestor...",
  "assurance": "A3",
  "evidence_digest": "...",
  "jurisdiction_context_digest": "...",
  "effective_from": "...",
  "effective_until": null,
  "status": "active"
}
```

A relationship claim may **not** contain actions, controllers, purposes, or data scopes. Adding those fields would turn a descriptive relationship into accidental authority.

Examples of relationship types may eventually include guardian, educator, institution representative, clinician/specialist, trusted adult, or other jurisdiction-defined relationships. The label itself grants nothing.

## Authority grant

An authority grant is a separately evidenced bounded permission for one human holder to act for one human subject.

```json
{
  "schema": "axiom-human-authority-grant.v1",
  "grant_id": "authority_...",
  "subject_id": "person.subject",
  "holder_id": "person.holder",
  "relationship_claim_id": "relationship_...",
  "issuer_id": "authority-attestor...",
  "authority_source": "guardian",
  "controllers": ["capsule:axiom.education"],
  "purposes": ["learning-progress-recording"],
  "data_scopes": ["learning-progress:write"],
  "actions": ["education.learner.event.append"],
  "assurance": "A3",
  "evidence_digest": "...",
  "jurisdiction_context_digest": "...",
  "effective_from": "...",
  "effective_until": "...",
  "revocable": true,
  "delegable": false,
  "status": "active"
}
```

V1 deliberately requires `delegable: false`. A guardian cannot silently make another person a guardian, a teacher cannot silently transfer institutional authority, and an administrator role cannot become a general delegation mechanism.

Transitive delegation requires a future separately reviewed contract.

## Exact-grant resolution

A delegated action must name one exact `grant_id`.

The resolver does not combine partial grants to manufacture broader authority. If one grant permits `learning-progress:write` and another permits `portfolio:export`, a request requiring both cannot union those grants unless a later explicit composition policy authorizes that behavior.

For one requested action the V1 resolver requires:

- holder is human;
- exact grant exists and is active;
- exact relationship claim referenced by the grant exists and is active;
- both meet the minimum delegated-authority assurance floor, currently A2;
- subject and holder match between request, grant, and relationship;
- relationship and grant bind the same jurisdiction-context digest;
- requested controller is granted;
- requested purpose is granted;
- requested action is granted;
- every requested data scope is contained in that one grant;
- no active unresolved conflict applies to the grant;
- effective dates cover the requested time;
- V1 grant remains non-transitive.

A successful result produces digest-bound `axiom-human-authority-facts.v1`. It does not produce consent and does not execute the domain action.

## Conflict model

Multiple adults or institutions can have overlapping authority. The kernel must not guess when their authority is disputed.

V1 therefore introduces an explicit conflict artifact:

```json
{
  "schema": "axiom-human-authority-conflict.v1",
  "conflict_id": "conflict_...",
  "subject_id": "person.subject",
  "grant_ids": ["authority_a", "authority_b"],
  "evidence_digest": "...",
  "jurisdiction_context_digest": "...",
  "effective_from": "...",
  "effective_until": null,
  "status": "unresolved"
}
```

An unresolved active conflict involving the requested grant fails closed. Resolution is a new evidenced state; prior conflict history is not erased.

This supports cases such as two guardians disagreeing, an institutional request conflicting with family authority, a stale guardianship record, or a court/institution change that has not yet been reconciled.

## Relationship and authority revocation

Revocation or supersession affects future authorization.

If an authority grant remains technically unexpired but its underlying relationship is revoked, expired, superseded, or no longer sufficiently assured, the grant cannot authorize new use.

Historical records remain evidence of what authority state was observed at the time. The system does not rewrite prior consent or learner-event history to pretend the earlier state never existed.

## Integration with consent

The existing AXIOM consent primitive is direct-subject self-consent. It must not be stretched to impersonate delegated consent.

The delegated path should become a separate explicit consent operation, conceptually:

```text
human holder
  -> exact subject
  -> exact active authority grant
  -> exact controller
  -> exact purpose
  -> exact least-privilege data scopes
  -> delegated consent receipt
```

A future delegated consent receipt should bind at least:

- consent ID;
- subject ID;
- authorizing holder ID;
- exact authority grant ID;
- authority-facts digest;
- controller;
- purpose;
- data scopes;
- grant time;
- expiry;
- revocation state.

It must **not** treat relationship type, account ownership, family link, role, or prior consent as sufficient authority.

### Use-time revalidation

A still-active consent receipt is not enough if the underlying authority has changed.

Before a delegated domain action is permitted, Hypervisor should re-evaluate:

1. current relationship claim;
2. current exact authority grant;
3. current unresolved-conflict state;
4. current delegated consent receipt;
5. ordinary action policy.

The resulting authority and consent facts should be bound into the plan and short-lived capability.

### Final Grid revalidation

For authoritative mutations, Grid should repeat the current-state authority and consent checks immediately before append, analogous to the final consent check implemented for the direct-self education learner-record slice.

That closes the window where a relationship, authority grant, conflict, or consent changes between Hypervisor observation and final state mutation.

## Education / CLAW example

For an elementary CLAW learner, a future path can be:

```text
verified relationship claim
  child <- legal guardian -> adult
        |
active authority grant
  subject: child
  holder: adult
  controller: capsule:axiom.education
  purpose: learning-progress-recording
  action: education.learner.event.append
  data: learning-progress:write
        |
delegated education consent
        |
CLAW local activity completes
        |
Axiom Education learner-event intent
        |
AXIOM runtime revalidates authority + consent
        |
Grid revalidates both immediately before append
```

CLAW receives only the effective authorization result needed for the requested action. It does not need the learner's full family, court, or legal evidence graph.

This path remains unavailable until the runtime authority/consent actions are actually implemented and verified.

## Teacher and institution authority

Teacher authority should not reuse guardian authority.

A teacher relationship is likely derived from independently attested institution/enrollment context. An authority grant can then bind only the appropriate institution, course/class, purposes, actions, data scopes, and effective dates.

Ending enrollment, reassignment, school-year expiry, or institutional revocation must affect future use even if an old relationship or consent artifact still exists historically.

## Maturity and transfer to learner authority

The generic kernel must not encode one global birthday at which all authority changes.

Maturity transition is an external/domain-policy fact represented through new evidence and authority state. Different purposes may transition at different times.

A future transition can therefore look like:

```text
child phase
  delegated adult authority + learner assent where policy requires
        |
transitional phase
  shared or purpose-specific authority
        |
learner-authoritative phase
  direct learner consent for applicable purposes
  prior delegated grants expire or are superseded unless another lawful basis remains
```

The applicable jurisdiction/domain policy decides when such states are valid. AXIOM records, verifies, and enforces the resulting bounded artifacts.

## Learner assent

Assent is not silently collapsed into consent or adult authority.

A future education policy may require:

- adult delegated authority;
- delegated consent;
- learner assent;
- joint authorization;
- or direct learner consent,

depending on the action, purpose, context, and externally governed policy.

Assent should be represented as its own evidenced event when required.

## Data minimization

Downstream applications should receive only the effective facts needed for the action, for example:

```json
{
  "allow": true,
  "subject_id": "learner...",
  "holder_id": "guardian...",
  "grant_id": "authority...",
  "authority_digest": "...",
  "controller": "capsule:axiom.education",
  "purpose": "learning-progress-recording",
  "action": "education.learner.event.append",
  "data_scopes": ["learning-progress:write"]
}
```

They should not automatically receive court documents, identity documents, family graphs, clinical records, or raw evidence merely because those artifacts contributed to the authority decision.

## Runtime implementation sequence

### H0 — contract and resolver foundation

Implemented on this architecture branch:

- machine-readable V1 authority contract;
- relationship validator;
- authority-grant validator;
- conflict validator;
- exact-grant resolver;
- A2 minimum assurance floor;
- negative tests for role-only, relationship-only, cross-subject, expired/revoked, mismatched jurisdiction, over-broad action/data/controller/purpose, machine holder, transitive delegation, and unresolved conflict.

No runtime action is enabled by H0.

### H1 — durable authority evidence

Add append-oriented Grid records and current-state projections for:

- relationship claims;
- relationship revocation/supersession;
- authority grants;
- authority revocation/supersession;
- authority conflicts;
- conflict resolution.

Do not add a broad mutable `parentId`/role shortcut.

### H2 — governed intake

Define who may submit or attest each artifact and at what assurance. A record being syntactically valid is not proof that its issuer had authority to create it.

Jurisdiction/domain adapters must bind source provenance and review requirements.

### H3 — delegated consent

Add a distinct consent operation that requires one exact current authority grant and emits a receipt bound to the authority digest.

Direct-subject self-consent remains backward-compatible and separate.

### H4 — use-time and final-commit enforcement

Hypervisor and Grid revalidate current relationship, grant, conflict, consent, and ordinary policy for delegated effects.

### H5 — first education slice

Exercise one child + one guardian + one education progress write:

1. relationship claim;
2. authority grant;
3. delegated education consent;
4. learner activity evidence;
5. successful learner-event append;
6. authority revocation blocks the next event even if consent remains unexpired;
7. unresolved conflict blocks the event;
8. relationship-only and role-only attempts fail;
9. history remains visible and digest-bound.

### H6 — institution/educator authority

Add separately attested teacher/institution authority and prove it does not inherit family scopes.

### H7 — maturity transition

Bind jurisdiction/domain transition evidence and prove purpose-specific transfer to direct learner authority without rewriting history.

## Promotion boundary

This architecture is not a legal-compliance claim and is not yet an implemented runtime capability.

Do not promote delegated human authority until:

- durable state and revocation are implemented;
- issuer/attestor authority is itself governed;
- conflict behavior is executable;
- delegated consent is separate and least-privilege;
- Hypervisor and Grid revalidate current state;
- adversarial cross-subject and stale-authority tests pass;
- one domain-specific profile is independently reviewed;
- capability registry and public documentation are deliberately updated in the same promoted change.
