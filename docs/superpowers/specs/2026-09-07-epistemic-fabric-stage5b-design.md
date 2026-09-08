# Epistemic Fabric — Fresh Stage 5B Design Gate

**Status:** approved design direction; documentation-only; implementation authority not granted

**Date:** 2026-09-07

**Scope:** AXIOM-MESH substrate for provenance-preserving epistemic objects and bounded reassessment used by The Stack and future domain applications.

**Fresh-gate rule:** this Stage 5B does not inherit implementation, migration, authorization, or promotion authority from Stage 5A or any earlier migration stage. Earlier artifacts, tests, evidence, reviews, and lessons are inputs/provenance only.

**Builds on:**

- `CONSTITUTION.md`
- `docs/superpowers/specs/2026-09-03-sovereign-information-evidence-authority-design.md`
- `docs/rebuild/PATH-OBSERVATION-EVIDENCE.md`
- `docs/architecture/SCALING-DISTRIBUTED-AUTHORITY-AND-CONSENSUS.md`
- `docs/security/CURRENT-BUILD-THREAT-MODEL.md`
- the existing Gateway -> Hypervisor -> Sandbox -> Grid authority path
- existing deny-dominant policy, exact-effect commitments, one-use authority, append-only evidence, resource ceilings, and selective-disclosure foundations

**Authority boundary:** this design creates no executable capability, no public ingestion route, no autonomous discovery authority, no experiment authority, no global truth service, no reputation oracle, no production promotion, and no authority-bearing change to `mesh/config/capabilities.json`.

---

## 1. Architectural decision

AXIOM-MESH may host a distributed epistemic fabric, but the fabric is a consumer of Mesh trust and authority guarantees, never a replacement authority root.

```text
The Stack / domain intelligence
            |
            v
      Epistemic Fabric
  sources / claims / evidence
 assessments / unknowns / revisions
            |
            v
       AXIOM-MESH core
 identity / policy / authority
 exact effects / execution / receipts
```

The governing separation is:

```text
epistemic support != execution authority
verified claim != permitted effect
trusted source != capability holder
model confidence != authorization
```

Knowledge may inform policy. Knowledge must never silently become authority.

---

## 2. Scope re-established independently

Stage 5B is limited to a bounded epistemic substrate. The initial object vocabulary is:

- `Source`
- `Claim`
- `Evidence`
- `Assessment`
- `Relationship`
- `Unknown`
- `EpistemicEvent`

Later waves may add:

- `Observation`
- `Contradiction`
- `Prediction`
- `IndependenceCluster`
- `ExperimentProposal`
- `Replication`
- `CrossDomainCandidate`
- `ReconsiderationTrigger`

No later object type is authorized by approval of this design alone.

---

## 3. Canonicality is split

The implementation must distinguish three concepts.

### 3.1 Object canonicality

The exact bytes/object are validly represented, hashed, attributable, revisioned, and admitted into a Mesh domain.

Object canonicality does not assert truth.

### 3.2 Epistemic assessment

A named evaluator, node, Circle, institution, or policy domain assesses a claim against a named evidence set.

Assessments may disagree.

### 3.3 Operational acceptance

A policy domain chooses to act using a proposition as an assumption.

Operational acceptance does not rewrite epistemic state.

Example:

```text
claim: component X is vulnerable
epistemic state: mixed
security policy: treat as vulnerable pending resolution
operational outcome: deployment denied
```

The conservative policy decision does not declare the underlying scientific question settled.

---

## 4. No global truth primitive

The Mesh must not introduce a primitive equivalent to:

```text
global_truth = true
```

or:

```text
consensus_score > threshold => truth
```

Federation may converge on object identity, hashes, provenance, signed events, and evidence references while preserving different assessments, models, confidence vectors, or unresolved interpretations.

Consensus is an output that may emerge under a particular methodology. It is not a system invariant.

---

## 5. Proposal plane and canonical object plane

Machine-generated epistemic work starts in an untrusted proposal plane.

```text
external source / model output
          |
          v
     proposal plane
          |
 schema + provenance + authority
 + dependency + policy validation
          |
          v
 canonical object plane
```

Models and agents may propose:

- claims;
- source anchors;
- evidence links;
- relationships;
- contradictions;
- assessments;
- hypotheses;
- unknowns.

They do not receive direct canonical-write authority merely because they emit schema-valid JSON.

---

## 6. Non-negotiable authority invariant

Every epistemic object and verification artifact must be treated as authority-neutral by default.

Normative semantics:

```text
authority_effect: none
network_effect: none
execution_authority: false
```

An epistemic artifact may satisfy an existing policy predicate. It must not mint:

- a capability;
- a grant;
- consent;
- approval;
- deployment authority;
- network authority;
- repository authority;
- experiment authority.

Any later real effect remains on the ordinary AXIOM authority path.

---

## 7. Exact-effect and current-head binding

A canonical mutation must bind the exact intended object transition, including at least:

```text
domain_id
object_id
object_type
current_revision
current_content_digest
proposed_revision
proposed_content_digest
operation
provenance_digest
policy_profile_digest
issued_at
expires_at
nonce
```

Where dependency or graph mutation matters, the commitment must also bind the applicable dependency and affected-set digests.

A mutation authorized against revision N must fail if the canonical head has advanced to N+1 unless a separately authorized merge path exists.

Required sequence:

```text
read head
  -> construct exact mutation
  -> authorize
  -> recheck head
  -> commit
```

If the head changed: deny and recompute.

---

## 8. Replay and revision semantics

Canonical epistemic history is append-only. Corrections occur through supersession, challenge, retraction, or compensating events rather than silent overwrite.

Replay controls must prevent stale signed events from:

- restoring withdrawn evidence;
- reverting an assessment;
- closing a reopened unknown;
- reopening a resolved issue without current authority;
- duplicating prediction registration;
- recreating superseded relationships.

At minimum, effect-bearing events bind unique event identity, nonce, prior revision/head, causation, freshness, and signature context.

---

## 9. Provenance, evidence, and truth remain distinct

The existing sovereign-information doctrine remains binding:

```text
integrity evidence != truth
attestation != fact
consensus != truth
confidence != authority
institutional status != correctness
```

A valid signature establishes attribution/integrity within its trust model. It does not establish external-world truth.

A formal proof establishes derivability from declared premises and verifier/profile bytes. It does not establish empirical truth of the premises.

---

## 10. Evidence independence

The fabric must model evidence lineage so correlated sources cannot be counted as independent confirmation merely because they appear in many documents.

```text
study A -> review B -> article C -> model D -> report E
```

may represent one underlying evidence lineage.

Unknown independence remains `unknown`; it is never silently upgraded to independent.

---

## 11. Unknowns and contradictions

Unknowns are first-class persistent objects. They are not closed because an explanation was proposed.

A contradiction is preserved when credible evidence or claims remain incompatible. The system must distinguish empirical conflict from scope mismatch, definition mismatch, measurement mismatch, or merely apparent contradiction.

Agent disagreement is retained rather than averaged away.

---

## 12. Continuous ingestion is not continuous authority

Future continuous ingestion may continuously observe, normalize, analyze, and generate proposals.

It must stop before external effects.

```text
continuous observation
    -> continuous analysis
    -> continuous proposals
    -> STOP
```

Experiment execution, repository mutation, deployment, network change, spending, disclosure, or other external effects require the normal Mesh authority path and its own fresh state checks.

---

## 13. Simulation boundary

Epistemic simulations run from an exact canonical snapshot/fork, remain finite in scope, and have no production signing keys or live external-effect authority.

```text
snapshot/fork
  -> simulate
  -> evidence/proposal
  -> separate authorization
  -> current-head check
  -> optional real effect
```

Simulation success is evidence, not permission.

---

## 14. Private evidence and selective disclosure

A node may retain a private dataset while publishing a bounded claim/evidence attestation and exact commitment.

Future mechanisms may include selective disclosure, confidential computation, secure aggregation, enclave attestation, or zero-knowledge proofs, but no privacy property may be claimed before it is implemented and independently tested.

Disclosure never expands effect authority.

---

## 15. Resource boundaries

Continuous ingestion creates a direct denial-of-service risk. No source, model, agent, or graph traversal may create unbounded:

- claims;
- graph edges;
- recursive reassessment;
- dependency walks;
- model calls;
- proof generation;
- external fetches;
- storage commitments.

Unknown resource dimensions fail closed rather than becoming unlimited.

---

## 16. Threat classes added by Stage 5B

The Stage 5B threat model must include:

- provenance poisoning;
- source substitution;
- citation laundering;
- Sybil consensus;
- correlated model error;
- evidence-to-authority laundering;
- semantic scope widening;
- retraction suppression;
- malicious retraction;
- assessment capture;
- contrarian capture;
- historical rewriting;
- prediction editing;
- cross-domain analogy attacks;
- private-data correlation attacks;
- stale-head and replay attacks;
- resource-exhaustion through reassessment cascades.

Controls are specified in `docs/security/EPISTEMIC-FABRIC-THREAT-MODEL.md`.

---

## 17. Migration contract

The migration is incremental and independently gated.

### E0 — inert schemas and documentation

No runtime activation, federation, network effect, or authority effect.

### E1 — local proposal graph

Bounded local `Source -> Claim -> Evidence` proposal objects only. All outputs remain authority-neutral and non-canonical unless separately admitted by an existing authority mechanism.

### E2 — deterministic validation

Exact digests, canonical serialization, source-anchor verification, revision checks, and negative-path tests.

### E3 — canonical object admission

Exact validated object promotion through existing Mesh authority. No epistemic conclusion creates effect authority.

### E4 — bounded reassessment

Add `Assessment`, `Unknown`, and `Relationship` with explicitly bounded propagation.

### E5 — federation

Share signed epistemic objects/provenance without requiring assessment consensus.

### E6 — continuous feeds

Controlled continuous ingestion; still no continuous effect permission.

### E7 — discovery agents

Contradiction detection, cross-domain candidates, hypothesis generation, and reconsideration remain proposal-only until separately admitted.

### E8 — experiment proposals

Unknown-to-experiment reasoning may produce plans. Physical/external execution requires the normal intent -> policy -> plan -> grant -> execution -> evidence path.

Approval of one phase does not automatically authorize the next.

---

## 18. Failure semantics

Required fail-closed behavior:

| Condition | Result |
|---|---|
| invalid schema | reject |
| missing required provenance | staging / deny canonicalization |
| unknown authority | deny |
| unsupported signed restriction | deny |
| stale canonical head | deny and recompute |
| signature failure | deny |
| required source bytes unavailable | explicit missing; never empty-byte substitution |
| evidence independence ambiguous | `independence_unknown` |
| agent disagreement | preserve disagreement |
| conflicting credible evidence | preserve/create contradiction |
| uncertain external effect | existing burn-on-uncertainty semantics apply |

---

## 19. Rollback and recovery

Infrastructure may roll back software versions. Canonical epistemic history is not rewritten backward.

A faulty current interpretation is corrected by a new append-only event or revision:

```text
revision 17
  -> fault discovered
  -> revision 18 supersedes/challenges/retracts 17
```

Historical state remains reconstructable.

---

## 20. Mandatory acceptance tests before implementation promotion

At minimum:

1. high-confidence evidence cannot mint a capability;
2. model direct canonical-write attempt is denied;
3. stale-head mutation is denied;
4. signed mutation cannot widen its affected set after approval;
5. derivative citations are not counted as independent evidence;
6. missing required source bytes do not normalize to empty content;
7. malformed optional evidence fails validation rather than becoming absent;
8. correlated agent consensus does not become truth;
9. rejection alone does not increase support;
10. valid retraction triggers bounded reassessment while preserving history;
11. replayed mutation is denied;
12. preregistered prediction cannot be edited after outcome availability;
13. private attestation does not expose raw evidence without authority;
14. adapters unable to represent signed restrictions deny rather than drop them;
15. self-reported offline state cannot bypass required external status;
16. simulation cannot sign or publish a production mutation;
17. narrow-scope evidence cannot silently support a universal claim;
18. historical graph reconstruction is digest-consistent.

---

## 21. Stage 5B approval state

The architecture is approved as design direction.

Implementation authority remains **not granted** until a fresh implementation proposal identifies:

- exact E0/E1 files and schemas;
- authority/effect boundary tests;
- resource ceilings;
- current-head/replay semantics;
- rollback/recovery behavior;
- documentation registration;
- Clean Kernel and supported-platform verification;
- independent security review of the immutable candidate head.

The first permitted implementation proposal must be E0/E1 only.

> **Knowledge may inform authority. Knowledge must never silently become authority.**
