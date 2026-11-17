# Substrate-Neutral Principals and Cross-Substrate Governance — Design

**Status:** approved architectural direction; design specification for migration beyond mandatory human-sponsored machine principals without weakening current v1 safeguards

**Date:** 2026-08-31

**Issue:** #1397

**Scope:** principal existence, domain-relative admission, authority provenance, attenuated delegation, governance membership, embodiment separation, and compatibility for biological, digital, institutional, collective, hybrid, and future cloud/BMI-extended actors.

**Builds on:**

- `mesh/src/lib/machine-principal.mjs`
- `mesh/src/lib/principal-registry.mjs`
- `mesh/src/lib/invocation-envelope.mjs`
- `mesh/src/lib/agent-trust-machine-identity.mjs`
- existing delegation-authority and attenuation-proof contracts
- `docs/superpowers/specs/2026-08-27-emergent-coordination-collective-authority-design.md`
- Circle Core and plural-authority architecture

**Migration rule:** `axiom-machine-principal.v1` remains valid and unchanged. Its human sponsorship and delegation-disabled posture remain conservative current-build policy until a separately implemented, tested, and promoted successor exists.

## 1. Core decision

AXIOM must not define sovereignty as a property that flows from biological humanity.

The Mesh needs a substrate-neutral distinction between four different questions:

1. **Who or what is this principal?**
2. **What continuity/identity evidence supports that claim?**
3. **Which governance domain has admitted or authorized that principal, under what basis?**
4. **What exact effect may the principal perform now?**

The current machine-principal v1 contract deliberately compresses part of questions 2 and 3 into a required human `sponsor`. That is a defensible early safety posture, but it must not become the permanent ontology.

The governing principles are:

> **Authentication proves which principal is acting. It does not prove that the principal is human.**

> **Substrate is an attribute of embodiment, not the source of sovereignty.**

> **Initial hierarchy may be a safety policy. It must never become an ontological requirement.**

## 2. Principal existence is not authority

A cryptographically coherent principal may exist without any human sponsor.

Creating or recognizing a principal identity does not grant that principal access to another party's resources, services, treasury, data, devices, infrastructure, governance process, or effect surface.

This preserves a crucial separation:

```text
principal existence
      !=
domain admission
      !=
delegated authority
      !=
effect authorization
```

A digital-native principal may therefore possess stable identity and continuity before any external institution agrees to trust it.

Likewise, a biological principal does not receive universal authority merely because it is biological.

## 3. No global human-root hierarchy

AXIOM should not model all authority as one global hierarchy terminating in a human root.

Authority is **domain-relative**.

A governance domain may be:

- a private personal domain;
- a family or household;
- a Circle/community;
- an institution;
- a company;
- a school;
- a league/team;
- a machine-native organization;
- an infrastructure cooperative;
- a temporary operational group;
- another future organizational representation.

Each domain determines which principals it recognizes, which governance process controls admission, and which permissions may be issued.

A digital principal may bootstrap and govern its own private domain without a biological superior. That does not compel any external domain to admit it.

## 4. Substrate must not be a trust class

AXIOM may record descriptive principal/embodiment metadata, but Mesh-core authorization must not silently translate that metadata into authority.

Possible descriptive principal classes include:

- `biological`
- `digital`
- `institutional`
- `collective`
- `hybrid`
- `other`

These labels are not ordered trust levels.

The following implications are invalid in Mesh core:

```text
biological => trusted
machine => subordinate
hybrid => ambiguous authority
institutional => privileged
collective => stronger than members
```

A domain policy may legitimately constrain membership by a descriptive class where its purpose requires that distinction. Such a rule must be explicit, attributable domain policy rather than hard-coded substrate discrimination in the authority kernel.

## 5. Identity and embodiment are separate

The long-horizon architecture must support one principal interacting through multiple embodiments or interfaces, including combinations not yet common today.

Examples may include:

- biological body;
- local digital runtime;
- provider-hosted cognitive runtime;
- robotic embodiment;
- neural interface;
- cloud cognitive extension;
- persistent delegated representative;
- future substrate not currently modeled.

An embodiment may hold a key, present an identity credential, or receive delegated authority. It is not automatically identical to the principal merely because it is physically or computationally attached to that principal.

Likewise, losing or changing an embodiment must not automatically destroy principal continuity.

The first migration slice does **not** require a complete embodiment ontology. It requires only that principal and authority contracts avoid assuming that `human` or `machine` is the identity root.

## 6. Existing machine identity work is reusable

Current Agent Trust machine identity already separates persistent identity evidence from authority effects. Portable machine identity credentials bind a principal definition and issuer/root to operational keys, support key rotation/recovery/revocation, and do not themselves grant authority.

That separation should be retained.

The migration should generalize authority admission around persistent principal identity rather than replacing identity continuity with a new sponsorship mechanism.

## 7. Generalized authority provenance

The successor architecture should replace mandatory human sponsorship with an explicit **authority provenance/admission basis**.

A principal seeking authority inside a domain must present evidence that traces to a valid authority root recognized by that domain.

Candidate basis classes include:

- `legacy-human-sponsor` — compatibility representation for machine-principal v1;
- `domain-charter-admission` — admitted under an exact governance charter/process;
- `institutional-issuance` — authority issued by an authorized institutional principal;
- `delegated-authority` — attenuated authority derived from an authorized parent principal;
- `collective-decision` — authority issued through a valid plural/quorum decision;
- `owner-private-domain` — root control within a principal's own private domain;
- `other-reviewed-basis` — future extensibility through an explicitly reviewed basis definition.

The basis class is descriptive evidence. It does not itself authorize an effect.

Every authority-bearing result still requires the normal capability/authority path.

## 8. Governance Domain Admission Record v0

The recommended first new evidence contract is **Governance Domain Admission Record v0**.

Proposed schema:

`axiom-governance-domain-admission.v0`

Status:

`inert-authority-evidence`

Its purpose is to answer:

> **What exact governance domain recognizes this exact principal, through what reviewed admission basis, with what validity/revocation evidence?**

It does not grant runtime authority by itself.

A future executable specification should bind at minimum:

```text
admission_id
domain_id
domain_policy_ref
domain_policy_digest
principal_id
principal_identity_ref
principal_identity_digest
basis
basis_ref
basis_digest
issued_at
valid_until
revocation_ref
revocation_digest
recorded_at
contains_secret_material
authority_effect
network_effect
runtime_activation
```

The admission record is content-addressed and fail-closed.

## 9. Domain admission is not effect authority

Admission means the governance domain recognizes a principal under a defined basis.

It does not mean every admitted principal can perform every domain effect.

The intended chain is:

```text
principal identity
    -> domain admission
    -> scoped role/membership/delegation
    -> authority envelope
    -> Gateway / policy evaluation
    -> Hypervisor / Sandbox / Grid boundary
    -> effect
```

This preserves the current principle that identity, capability, membership, and authority are distinct.

## 10. Independent digital principals

A digital principal may exist and maintain continuity without biological sponsorship.

It may obtain services in at least three legitimate ways:

1. operate inside its own private domain under its own domain root;
2. be admitted by another domain through that domain's governance process;
3. receive attenuated delegated authority from an already authorized principal.

No human is inherently required in any of those paths.

However, a digital principal cannot simply assert:

```text
I exist, therefore I am authorized here.
```

Principal existence never substitutes for domain recognition or effect authority.

## 11. Digital-native governance

A machine-native organization may establish a governance domain whose valid members are digital principals.

Its charter may define:

- purpose;
- membership/admission rules;
- role assignment;
- quorum thresholds;
- delegation limits;
- resource budgets;
- service policies;
- treasury controls;
- succession/fork rules;
- audit requirements;
- revocation/removal;
- emergency powers;
- amendment procedures.

AXIOM supplies reusable governance/authority mechanisms. It does not prescribe one constitution or require Circles as the representation.

Circles may be one interface over this domain but are not the only valid interface.

## 12. Collective authority remains non-amplifying

The existing **Collective Authority Non-Amplification** rule remains unchanged.

A collection of principals cannot manufacture an authority none of the relevant roots possess merely by voting together.

A valid quorum decision must operate inside authority already delegated to the governance body/charter.

The correction is only that those authority roots need not be biological humans.

Therefore:

```text
plural approval != authority creation
```

and:

```text
mixed/digital quorum != weaker or stronger by substrate alone
```

## 13. Delegation becomes policy-bounded rather than machine-forbidden

Current machine-principal v1 requires delegation disabled. Preserve that behavior for v1.

A successor may allow digital-to-digital or cross-substrate delegation only when all of these are explicit:

- parent authority is current and valid;
- delegation policy permits delegation;
- child scope is a subset of parent scope;
- child purpose is no broader;
- child destination set is no broader;
- child budget is no larger;
- child lifetime does not exceed parent lifetime;
- delegation depth is decremented;
- delegation chain remains attributable;
- revocation propagates appropriately;
- no child can self-upgrade its delegation ceiling.

The older machine-delegation policy research already anticipated an explicit bounded depth (candidate ceiling <= 8), attenuation, lifetime limits, and separate approval/currentness evidence. Those principles are reusable; the stale branch is not normative.

## 14. No circular authority bootstrapping

The substrate-neutral model must explicitly reject cycles such as:

```text
A authorizes B
B authorizes A
therefore both are root-authorized
```

An authority provenance chain must terminate in a domain-recognized root or charter state that exists independently of the delegated chain being validated.

Self-issued identity may establish principal existence. It cannot establish external-domain authority unless that domain's policy recognizes the relevant root/admission process.

## 15. Service and infrastructure access

Mesh-compatible services should ultimately make admission decisions from:

```text
authenticated principal
+ current domain admission / relationship
+ scoped authority envelope
+ service/resource policy
+ current revocation/constraint state
```

They should not require:

```text
principal_type == human
```

unless the service's explicit domain policy legitimately requires a biological participant.

This enables independent digital principals to acquire compute, storage, model access, bandwidth, messaging, economic resources, and other services under governance without weakening the provider's ability to set policy.

## 16. Hybrid and cloud-extended cognition

Brain-machine interfaces and persistent cloud cognition make a binary human/machine ontology increasingly unreliable.

AXIOM should therefore preserve a distinction between:

- principal continuity;
- embodiment continuity;
- cognitive-component continuity;
- credential continuity;
- authority continuity.

A biological principal using a cloud cognitive extension does not automatically create a new principal.

A persistent digital component also does not automatically inherit the biological principal's authority.

If a component becomes an independent principal, that transition must be explicit and evidence-bearing rather than inferred from capability or persistence.

## 17. Cross-substrate consent, refusal, and revocation

Consent mechanisms should operate between principals regardless of substrate.

The same primitives should support:

- biological -> digital consent;
- digital -> biological consent;
- digital -> digital consent;
- collective/institutional -> digital delegation;
- hybrid -> service/provider consent.

Refusal and revocation must remain first-class and propagate to active leases/delegations as policy requires.

A digital principal is not presumed to consent merely because it is programmable, and a biological principal is not presumed authoritative over an independent digital principal merely because that principal originated from human-created infrastructure.

## 18. Compatibility with machine-principal v1

No existing v1 document should be silently reinterpreted.

Migration should use an explicit adapter or successor contract.

A valid v1 machine principal can be represented in a future generalized admission model through a basis such as:

```text
basis = legacy-human-sponsor
basis_ref = exact v1 principal / sponsor evidence
```

This preserves existing behavior and provenance.

V1 runtime admission remains v1 runtime admission until the new model passes its own promotion gates.

## 19. Invocation-envelope migration seam

The current invocation envelope already separates caller identity binding from authority/policy fields, although machine identity binding includes `sponsor`.

A successor should replace the sponsor-specific field with an exact authority/admission provenance reference rather than removing provenance entirely.

Conceptually:

```text
caller.identity
caller.authority_binding
caller.admission_provenance
```

The invocation envelope should continue to carry only enough evidence to bind the caller and authority decision. It should not become the governance database.

## 20. Principal registry migration

The current registry discovers human principals first so they can satisfy machine sponsor validation.

A future registry should instead resolve:

- principal identity documents;
- applicable domain admissions;
- applicable authority/delegation records;
- currentness/revocation evidence.

Resolution order should follow dependency/evidence relationships rather than `human first, machine second` as an ontology.

Compatibility mode may continue to perform the existing v1 human-first sequence for v1 documents.

## 21. Threat model

### Self-grant laundering

A principal creates its own identity and presents that as authority inside an unrelated domain.

**Mitigation:** principal existence is separate from domain admission and effect authority.

### Fake governance admission

An attacker fabricates a charter or admission record.

**Mitigation:** exact policy/basis digests, domain-recognized issuer/root, currentness and revocation evidence.

### Circular authorization

Principals recursively authorize each other to manufacture a root.

**Mitigation:** provenance chains must terminate at an independently recognized domain root/charter.

### Recursive delegation amplification

A digital principal repeatedly delegates until scope, lifetime, budget, or purpose expands.

**Mitigation:** attenuation at every hop, explicit depth, parent-bound lifetime/budget, fail-closed chain validation.

### Quorum Sybil capture

One principal creates many identities to satisfy a quorum.

**Mitigation:** quorum membership comes from domain admission/membership policy; identity count alone does not create voting membership.

### Substrate laundering

A principal claims to be biological, institutional, or hybrid to obtain authority.

**Mitigation:** substrate metadata is not an implicit trust class; domains that depend on it need explicit evidence/policy.

### Embodiment confusion

A cloud model, implant, robot, or delegated runtime is assumed to inherit the principal's complete identity/authority.

**Mitigation:** embodiment binding and authority delegation remain explicit and separately evidenced.

### Legacy bypass

A generalized v2 record is used to bypass current v1 sponsor controls before promotion.

**Mitigation:** versioned contracts; v1 remains unchanged; new runtime acceptance requires separate promotion.

## 22. Automated guardrails worth adding later

Once the successor contracts are approved, CI should automate checks that are currently easy to regress manually:

- source audit for new generic authority paths that hard-code `principal_type == human`;
- source audit preventing generalized principal/admission modules from importing runtime effect surfaces;
- fixture matrix covering biological, digital, institutional, collective, and hybrid metadata with identical authority outcomes when policy is identical;
- v1 compatibility fixtures proving human-sponsored machine principals retain current behavior;
- attenuation-chain property tests across mixed-substrate delegations;
- circular-provenance rejection tests;
- revoked-domain-admission tests;
- quorum tests proving duplicate/Sybil identities do not create membership;
- deterministic content-addressing/currentness tests;
- protected CI evidence for Gateway/Hypervisor/Sandbox/Grid non-regression.

These should be GitHub-enforced wherever practical so substrate neutrality does not depend on documentation discipline alone.

## 23. First executable slice

The first implementation should remain deliberately small.

Recommended initial deliverables:

1. **Governance Domain Admission Record v0** as an inert, content-addressed evidence contract;
2. a pure resolver that binds an admission to an exact principal identity and exact domain-policy/root evidence supplied by the caller;
3. explicit `legacy-human-sponsor` compatibility representation;
4. no runtime acceptance, no machine-principal v1 modification, no automatic delegation;
5. adversarial tests for self-grant, circular provenance, fake basis, revoked/stale admission, substrate-type authority laundering, and unknown fields;
6. JSON Schema parity and canonical-document registration.

This gives AXIOM the missing abstraction without prematurely redesigning every principal/runtime contract.

## 24. Deferred slices

Separate later design/implementation gates should handle:

- principal descriptor v2 / richer substrate metadata;
- embodiment-binding evidence;
- generalized machine/digital delegation authorization;
- invocation-envelope v2 admission binding;
- principal-registry v2 resolution;
- mixed-substrate quorum/governance execution;
- service/resource admission integration;
- Axiom One governance UX;
- legal/personhood-specific domain policies;
- BMI/cloud-cognition continuity evidence.

No deferred feature is implied to be implemented by the first slice.

## 25. Non-claims

This design does not claim:

- digital legal personhood;
- biological/digital equivalence under any jurisdiction;
- that every domain must admit digital principals;
- that principal type is irrelevant to every domain policy;
- that identity grants authority;
- that admission grants unrestricted authority;
- that collectives can manufacture authority;
- that digital principals may self-grant external authority;
- that current human-sponsor gates should be removed immediately;
- that Circles are the only governance interface;
- that a BMI/cloud component is automatically a separate principal;
- that a capable model is an independent principal.

## 26. Architectural invariant

The target architecture is:

```text
principal identity / continuity
        |
        v
governance-domain admission
        |
        v
role / membership / attenuated delegation
        |
        v
scoped authority envelope
        |
        v
Gateway -> Hypervisor -> Sandbox -> Grid
        |
        v
effect
```

Principal substrate may influence explicit domain policy, but it is not the source of sovereignty or a hidden authority rank.

The durable rule is:

> **Replace human-root assumptions with stronger general authority provenance, never with absence of authority provenance.**
