# AXIOM-MESH Path Observation Evidence

**Status:** inert stacked architecture candidate; not a current capability claim  
**Depends on:** `axiom-resilient-path-fabric.v0`  
**Authority effect:** none  
**Network effect:** none

## Purpose

The Resilient Path Fabric v0 contract deliberately accepts caller-supplied path facts only as structurally consistent claims. It does not authenticate latency, node attestation state, energy state, maintenance state, spectrum/regulatory status, or failure-domain labels.

Path Observation Evidence v0 adds the next boundary: **who asserted each path fact, under which externally trusted role, from which source artifact, and whether that assertion is still fresh enough for the evaluator's policy**.

It still does not perform routing, mutate radios, establish legal truth, reproduce source measurements, or grant network authority.

## Architectural rule

```text
path-fabric claim
  -> source artifact digest
  -> signed evidence statement
  -> externally supplied trusted signer + role
  -> externally supplied freshness policy
  -> exact portfolio claim comparison
  -> attribution/freshness verification result
  -> still no route authority
```

The signer public key is **not** accepted from the evidence package. The evaluator supplies the trust set independently. This prevents a node or planner from inventing a key, signing its own claim, and relabelling that claim as trusted evidence.

## Evidence kinds and trust roles

Every declared path-fabric node and link claim must be covered exactly once by the appropriate evidence kind:

| Evidence kind | Bound claim | Required externally trusted role |
|---|---|---|
| `node-profile` | role, transit eligibility, compute class, maintenance class | `node-profile-authority` |
| `node-attestation` | attestation state | `attestation-verifier` |
| `node-energy` | energy state | `energy-observer` |
| `link-profile` | endpoints, medium, maintenance class | `link-profile-authority` |
| `link-latency` | observed latency | `telemetry-observer` |
| `link-regulatory` | regulatory availability state | `regulatory-authority` |
| `link-failure-domains` | spectrum, power, backhaul, vendor, administration, and site labels | `failure-domain-auditor` |

A signer may hold more than one role only when the evaluator's independent trust configuration says so. Merely naming a role in the evidence record grants nothing.

## Statement binding

Each signed `axiom-path-observation-statement.v0` binds:

- one evidence identifier;
- one evidence kind;
- one exact node or link subject;
- observation time and validity horizon;
- one source-artifact reference and SHA-256 digest;
- one externally resolvable signer identifier;
- one anti-replay nonce;
- the exact claim values copied from the bound path portfolio.

The Ed25519 signature covers the canonical statement. Any change to the source digest, signer identifier, timing, subject, or claim invalidates the signature.

## Freshness is evaluator policy

The evidence package cannot select its own acceptable age. The evaluator must supply a complete maximum-age policy for every evidence kind together with the evaluation timestamp.

An evidence statement fails when:

- its observation is future-dated;
- its validity horizon has expired;
- its validity horizon does not follow the observation;
- its age exceeds the evaluator's externally supplied freshness ceiling.

The verification result binds both the trust set and freshness policy into a `verification_policy_digest`. The same evidence evaluated under a different trust root or freshness limit therefore produces a different verification result.

## Coverage rule

The v0 verifier requires complete evidence coverage for **every declared node and link claim in the bound path-fabric package**, not only the currently selected primary path.

This prevents a planner from placing unauthenticated alternatives or hidden topology facts in the same portfolio and later switching to them without a new evidence evaluation.

Duplicate evidence for the same claim is rejected rather than silently choosing a winner. Conflicting evidence is therefore visible as a validation failure until a later contract defines explicit reassessment or supersession semantics.

## What successful verification means

A successful v0 result may truthfully state:

- the exact path portfolio was structurally valid under `axiom-resilient-path-fabric.v0`;
- every declared node/link claim had one matching signed evidence statement;
- every signature verified under an externally supplied Ed25519 trust root;
- every signer held the externally configured role required for that evidence kind;
- every statement satisfied the evaluator's externally supplied freshness policy;
- the source-artifact digest and provenance metadata were cryptographically bound to the statement.

It **does not** establish:

- that the source measurement itself was accurate;
- that a regulatory assertion is legally authoritative outside the configured trust policy;
- that an attestation verifier's conclusion was correct;
- that a failure-domain label captures every real correlated failure;
- that a battery or power observation remains true after evaluation;
- that the referenced source artifact was independently reproduced;
- that any path is authorized for live forwarding;
- that any routing table, radio, interface, gateway, DTN queue, or remote node was changed.

The machine-readable result therefore keeps:

- `source_artifacts_reproduced: false`;
- `truth_established: false`;
- `authority_effect: none`;
- `network_effect: none`;
- `runtime_activation: false`.

## Relationship to existing AXIOM controls

This evidence layer does not replace admitted-node discovery/scheduling. Scheduler declarations and reservations remain their own authenticated control and still do not imply link reachability or routing permission.

It also does not replace online causal exchange. Causal exchange remains an operator-approved data-transfer mechanism with its own partition, conflict, and destination-authority semantics.

A future live path-selection programme may consume Path Observation Evidence only after it also has:

1. real measurement adapters and source-artifact retention;
2. reviewed trust-root provisioning and rotation;
3. jurisdiction-specific regulatory evidence semantics;
4. attestation verifier policy and failure behavior;
5. bounded telemetry collection and privacy rules;
6. safe staleness/degradation behavior;
7. deterministic hard-constraint evaluation independent of AI;
8. explicit network-effect actions through the normal AXIOM authority path;
9. rollback and safe fallback;
10. multi-host, radio, partition, and chaos evidence.

## Threats covered by the v0 contract

The current executable contract is intended to reject:

- self-trusted signer substitution;
- signer-role confusion;
- portfolio substitution;
- source-artifact digest tampering;
- future-dated evidence;
- expired evidence;
- stale evidence accepted under an implicit/default freshness policy;
- incomplete claim coverage;
- duplicate claim evidence;
- claim/evidence mismatch;
- evidence-package authority laundering;
- evidence-package network-effect laundering.

## Remaining research

Later versions should consider:

- signed raw telemetry envelopes and measurement-method identity;
- confidence/error bounds rather than single latency values;
- attestation evidence lineage compatible with RATS/EAT semantics;
- regulatory database query receipts and geography/time binding;
- independently auditable failure-domain registries;
- maintenance/access evidence with privacy-preserving disclosure;
- evidence supersession, contradiction, challenge, and appeal;
- minimum-sufficient telemetry to avoid control-plane congestion;
- bitemporal observation semantics;
- cross-node clock uncertainty;
- evidence aggregation without losing per-source attribution;
- source replication/reproduction status separate from signature validity.

No item above promotes a live networking capability by documentation alone.
