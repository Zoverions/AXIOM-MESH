# Proof-Bearing Assertion Boundary

**Status:** experimental interoperability architecture; no production cryptography claim.

AXIOM-MESH should be able to accept narrow, independently verifiable assertions from many proof systems without turning any proof system into the Mesh authority substrate.

The boundary normalizes:

```text
external system
  -> proof / credential / attestation
  -> named verifier
  -> exact checked statement + bindings
  -> bounded verified input
  -> local policy / authority evaluation
  -> optional consequential effect
```

The central invariant is:

> **A proof can establish a bounded statement. It does not establish every interpretation of that statement and it does not authorize an effect.**

## Why this matters

A privacy-preserving payment proof, credential predicate, eligibility proof, institutional attestation, or future proof system may let a user demonstrate exactly what an institution needs without revealing the underlying sensitive record.

This is useful only if semantic widening is prevented.

A proof that payment occurred cannot silently become proof of legal identity. A proof that an age threshold is satisfied cannot silently become permission to access an unrelated resource. A proof generated for one audience cannot be replayed at another.

## Transparency

Trust-critical verification requires inspectable verifier semantics.

The assertion envelope records the verifier identity, implementation digest, trust profile, and whether independent reproduction is available. An opaque verifier can still be useful as advisory evidence, but high-consequence local policy may require an independently reproducible verifier or a stronger trust profile.

## Chain neutrality

PulseChain/ProveX and ZKP2P helped motivate this abstraction, but the core intentionally contains no chain, token, circuit, credential, or vendor dependency.

The same boundary should work for zero-knowledge systems, zkTLS/notary systems, verifiable credentials, threshold attestations, signed external receipts, and future mechanisms.

## Offline behavior

Offline nodes may continue using a still-valid assertion where local policy permits and all required trust material is locally available. They may not silently extend expiry, ignore required revocation/currentness, or reinterpret a stale proof as current.

## Privacy

The preferred pattern is to prove the narrowest predicate needed for the decision.

For example, an institution that needs to know whether a prerequisite is satisfied should not automatically receive the full transcript if a narrower proof is sufficient.

## Non-authority

Even a perfect cryptographic proof has:

```text
authority_effect = none
```

until local policy independently admits the requested effect.
