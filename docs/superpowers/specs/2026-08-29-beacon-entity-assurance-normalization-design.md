# Beacon Entity Assurance Normalization — Design

**Status:** proposed implementation slice

**Date:** 2026-08-29

**Scope:** local, deterministic normalization of an already verifiable Beacon-style observation candidate into non-authorizing Entity Assurance provenance evidence for a key-derived pseudonymous subject

**Authority:** this bridge cannot grant authority, delegation, principal ownership, identity enrollment, network access, runtime activation, or protocol compatibility.

## 1. Purpose

The provider substrate can now describe and bind external providers, and the Beacon-style observation candidate can verify a signed, fresh, replay-checked external envelope. Entity Assurance remains intentionally separate.

This slice defines the smallest safe bridge between those layers.

> A verified external signature may become evidence about a pseudonymous external key. It must not become evidence that an AXIOM principal owns that key unless a separate subject-binding mechanism proves that relationship.

## 2. Core invariants

1. The bridge re-runs Beacon observation verification; it never trusts a caller-supplied verification receipt.
2. The bridge validates the supplied Agent Provider Profile and requires the `agent-interop` class.
3. The provider profile must declare both `signed-envelope` and `replay-protected-envelope` evidence classes.
4. The provider assurance ceiling must be at least `cryptographic`.
5. The Entity Assurance subject is derived deterministically from the verified sender public-key fingerprint.
6. The caller cannot supply or override `subject_id`.
7. The normalized evidence dimension is fixed to `provenance`.
8. The normalized evidence class is fixed to `measured`.
9. The normalized strength is fixed to `moderate`.
10. The binding scope is fixed to `pseudonymous`.
11. `observed_at` and `expires_at` are inherited from the verified envelope.
12. The evidence basis digest commits to the provider-profile digest, observation digest, sender-key fingerprint, and replay key.
13. The resulting Entity Assurance evidence remains `non_authorizing: true` and therefore cannot grant authority or delegation.
14. No network, filesystem, subprocess, Grid, Gateway, credential, wallet, token, or secret runtime machinery may be imported by the bridge.

## 3. Subject model

The normalized subject identifier is:

```text
external.beacon.key.<64-hex-key-fingerprint>
```

This identifier means only: “the external pseudonymous subject represented by this verified Ed25519 public key.”

It does **not** mean:

- an AXIOM principal owns the key;
- the key is a legal identity;
- the key is unique to one human or machine;
- the key has been enrolled or trusted;
- the sender is authorized;
- the sender is compatible with an upstream Beacon protocol implementation.

A later principal/key binding mechanism must be separate, explicit, and independently verifiable.

## 4. Evidence mapping

A successful normalization produces `axiom-entity-assurance-evidence.v1` with:

```text
dimension = provenance
result = pass
strength = moderate
evidence_class = measured
issuer_id = null
binding_scope = pseudonymous
non_authorizing = true
```

`moderate` is intentionally below `strong`. The observation verifier proves local cryptographic and freshness properties, but replay persistence is not yet durable and no external identity enrollment exists.

The bridge does not emit `continuity`, `credentialing`, `hardware_binding`, `legal`, or `organization` evidence.

## 5. Provider-profile requirements

The supplied profile must validate as `axiom-agent-provider-profile.v0` and satisfy:

```text
provider_class = agent-interop
evidence_classes includes signed-envelope
evidence_classes includes replay-protected-envelope
assurance_ceiling in {cryptographic, hardware-rooted}
authority_effect = none
trust_effect = evidence-only
network_effect = none
runtime_activation = false
settlement_activation = false
```

These requirements constrain the declared role of the profile. They do not make the provider trusted and do not replace cryptographic verification of the envelope.

## 6. API

Create `mesh/src/lib/beacon-entity-assurance-evidence.mjs` exporting:

```js
export function beaconEntityAssuranceSubjectId(senderKeyFingerprint)

export function normalizeBeaconObservationEntityAssuranceEvidence({
  envelope,
  provider_profile,
  now,
  seen_replay_keys
})
```

The input object is closed-world. Unknown keys, including `subject_id`, must fail closed.

The normalizer calls `verifyBeaconObservationEnvelope()` itself, validates the provider profile, constructs the key-derived subject and basis digest, then delegates final evidence normalization/digesting to `normalizeEntityAssuranceEvidence()`.

## 7. Deterministic identifiers and basis

The evidence identifier is deterministic from the verified observation digest:

```text
evidence.beacon.provenance.<observation-digest>
```

The basis digest is:

```js
digestObject({
  provider_profile_digest,
  observation_digest,
  sender_key_fingerprint,
  replay_key
})
```

This binds the Entity Assurance evidence to both the exact external observation and the exact reviewed provider profile used for normalization.

## 8. Fail-closed cases

Normalization rejects:

- invalid or tampered Beacon envelopes;
- expired or excessively future-dated envelopes;
- replay keys already present in the caller-supplied snapshot;
- malformed or non-interop provider profiles;
- provider profiles lacking the required evidence classes;
- provider profiles whose assurance ceiling is below cryptographic;
- attempts to supply `subject_id` or any other unknown normalization input;
- any widening of the existing Beacon/provider non-authority boundary.

## 9. Entity Assurance integration proof

Tests must prove that the returned evidence can be consumed directly by `evaluateEntityAssurance()` for the derived pseudonymous subject under a policy requiring:

```text
dimension = provenance
minimum_strength = moderate
accepted_evidence_classes = [measured]
```

The resulting assurance decision may be `satisfied`, but must still report:

```text
authority_granted = false
delegation_granted = false
```

This is evidence satisfaction, not permission.

## 10. Non-claims

This slice does not provide:

- durable replay persistence;
- Beacon transport/discovery compatibility;
- external identity enrollment or key rotation;
- TOFU;
- local-principal binding;
- legal identity;
- issuer allowlisting;
- authorization or policy invocation;
- Gateway/Hypervisor/Sandbox/Grid effects;
- provider execution;
- capability promotion;
- production promotion.

## 11. Promotion gates after this slice

Later work should separately address:

1. restart-safe replay persistence;
2. external-key enrollment and rotation;
3. explicit principal/key subject binding;
4. accepted-issuer policy where authenticated assertions are used;
5. transport conformance fixtures against an upstream protocol version;
6. policy-controlled conversion of accepted observations into invocation requests;
7. authority re-check and receipts before effects.
