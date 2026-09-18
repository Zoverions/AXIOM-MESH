# Axiom Defense / ANX v0 — cross-substrate defensive assurance design

**Status:** design-only candidate; no physical authority or production capability is created  
**Programme:** #1699  
**Base:** `76801c9e74daf0c1c57c3a1ae171b70d9be3febd`

## 1. Purpose

Axiom Defense spans two substrates without creating two authority planes.

- **AXIOM-MESH** protects the digital substrate: identity, authority, information, agents, software, networks, provenance, coordination, quarantine, recovery, and evidence.
- **ANX** is the physical defensive substrate: physical sensing and bounded protective capabilities under local safety enforcement.
- **AXIOM-MESH remains the shared assurance plane** for trust, evidence, policy, currentness, bounded authority, revocation, receipts, and recovery.

The Mesh does not become a generic remote physical actuator. ANX does not become an independent authority root.

## 2. Constitutional boundary

> **Knowledge may propagate across the defense fabric. Authority does not.**

> **Observation is not authorization. Classification is not authorization. Recommendation is not authorization. Coordination is not authorization.**

> **Defensive authority ends when the qualifying protective condition ends.**

The system must preserve:

1. capability != authority;
2. presence != authentication;
3. classification != permission;
4. governance outcome != execution authority;
5. receipt != authority;
6. confidence != assurance;
7. availability loss != permission widening.

## 3. Composition with existing AXIOM architecture

This design composes rather than replaces:

- exact-effect admission/currentness/consume-before-effect/effect receipts from #1310;
- distributed embodiment and bounded physical-action capability families from #1466;
- host/device boundary and local safety enforcement from #1463;
- shutdown/quarantine authority lattice from #1477;
- sovereign degraded mode from #1492;
- physical/correlated failure-domain red-team work from #1575;
- machine principals, consent, capability registry, evidence, and the supported `Gateway -> Hypervisor -> Sandbox -> Grid` path.

No second identity system, policy engine, currentness layer, receipt system, executor, or device-discovery authority is introduced.

## 4. Layer model

```text
Digital defensive fabric
  AXIOM-MESH
  -> identity / policy / currentness / evidence
  -> quarantine / recovery / receipts

Physical defensive fabric
  ANX
  -> sensor and device evidence
  -> local interlocks
  -> bounded physical capability
  -> local fail-safe enforcement

Shared assurance plane
  AXIOM-MESH
  -> evaluates evidence
  -> admits or denies an exact requested effect
  -> never delegates its authority role to a model, peer, UI, or device
```

ANX may provide capability and evidence. It may not self-authorize.

## 5. Defensive Envelope v0

The first new object is an **inert policy/evidence description**, tentatively:

`axiom-defense-envelope.v0`

It does not grant authority by itself.

Required fields/semantics:

- protected subject, asset, zone, or operation reference;
- declared defense purpose;
- eligible ANX capability-family references;
- exact permitted effect classes;
- exact prohibited effect classes;
- consequence ceiling;
- spatial/logical scope;
- valid-from and expiry;
- required evidence classes;
- corroboration policy;
- approval / independent-review requirement;
- currentness requirement;
- local-interlock profile reference;
- degraded-mode behavior;
- termination conditions;
- revocation/quarantine references;
- policy/version/digest bindings;
- receipt/evidence requirements.

A real effect admission, if ever implemented, must separately bind:

```text
exact principal
+ exact effect request
+ exact envelope revision/digest
+ exact current policy/currentness
+ exact ANX endpoint/capability
+ exact consequence ceiling
+ exact local safety profile
```

No looser matching is sufficient.

## 6. Cross-substrate state flow

```text
observe
  -> preserve provenance
  -> corroborate / classify
  -> propose bounded defensive response
  -> evaluate envelope eligibility
  -> ordinary AXIOM authority/currentness admission
  -> local ANX safety enforcement
  -> exact bounded effect
  -> effect evidence / receipt
  -> reassess
  -> terminate or continue only under still-current authority
  -> recovery / review
```

Evidence can accumulate at every step. Permission must not.

## 7. Defensive-only invariants

ANX must not:

- mint, widen, inherit, renew, or transfer its own authority;
- convert threat classification directly into actuation;
- autonomously raise a consequence ceiling;
- continue outside the declared protective scope;
- continue after the qualifying protective condition has ended;
- silently continue after expiry, revocation, quarantine, restart, or recovery;
- treat repeated success, consensus, node count, reputation, confidence, or emergency inference as permission;
- use model or peer output to bypass local interlocks;
- use degraded/offline operation to gain authority unavailable while online.

A future physical capability must remain bound to a separately reviewed exact effect and a local safety controller.

## 8. Degraded mode

Loss of Mesh connectivity, cloud inference, external providers, or a preferred model may reduce ANX capability.

It must never widen authority.

Permitted degraded behavior must be predeclared and bounded. At minimum:

- stop, revoke, quarantine, and local safety controls remain available;
- no new higher-consequence physical authority is synthesized;
- unresolved currentness fails closed for new effects;
- queued or interrupted effects do not resume from stale authority;
- recovery requires a fresh evaluation of current state.

## 9. Threat model

The programme must model at least:

- spoofed/poisoned sensor evidence;
- compromised ANX node;
- compromised Mesh node;
- model hallucination or misclassification;
- stale/replayed authority;
- expired envelope;
- scope/zone escape;
- effect-class substitution;
- consequence-ceiling widening;
- revoked principal/capability;
- conflicting sensors or unresolved identity;
- coordinated false corroboration by compromised nodes;
- timing/metadata manipulation;
- UI-generated action represented as permission;
- governance result represented as actuation authority;
- emergency stop/quarantine during an active action;
- restart/recovery trying to resume stale work;
- physical capture of a node followed by credential reuse;
- cyber compromise of ANX software;
- loss/destruction of a node while evidence/recovery continuity must survive.

## 10. Axiom One boundary

A future Axiom One **Defense** surface may display or request:

- protected assets/zones;
- ANX node state;
- alerts and uncertainty;
- evidence;
- proposed/current defensive envelopes;
- expiry/revocation/quarantine state;
- local interlock/safety state;
- incident receipts;
- recovery state.

The UI remains outside the trusted physical safety loop. A button is a request, not authority.

## 11. Initial implementation sequence

### D0 — architecture and contract

Docs/specification, schema vocabulary, deterministic validation and negative fixtures only.

No hardware I/O. No public listener. No capability-registry widening. No new Gateway route. No physical execution.

### D1 — synthetic conformance laboratory

Offline deterministic fixtures proving the authority boundary.

### D2 — ANX simulator

A deterministic simulated physical environment with synthetic sensors and effects. It exercises scope, timing, conflicting evidence, compromise, stop conditions and recovery without real-world actuation.

### D3 — separately approved benign physical laboratory

Not part of v0. Any later physical proof requires a separate explicit promotion decision after D0-D2 converge and must begin with low-consequence, non-harmful endpoints.

## 12. Non-claims

This design does not claim or authorize:

- a deployed Axiom Defense system;
- a deployed ANX controller;
- live physical actuation;
- weapon or harmful-device integration;
- autonomous targeting;
- autonomous escalation;
- generalized remote actuator control;
- public deployment;
- production capability promotion;
- safety certification;
- new device credentials;
- new Gateway routes.

The v0 claim is only that AXIOM can define and falsify a cross-substrate defensive authority boundary before physical capability is introduced.
