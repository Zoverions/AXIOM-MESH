# Portable Trust Packages and Safe Offline Transfer

**Status:** experimental architecture; no production packaging claim.

Portable verification solves how a local environment can check claims.

A separate problem remains: how do trusted artifacts move safely between environments?

AXIOM should use **portable trust packages** as inert, content-addressed transfer envelopes for:

- verification bundles;
- contracts;
- policy bundles;
- capsules;
- institutional patterns;
- adapters;
- recovery material that is safe to transfer;
- evidence and receipts;
- test and simulation fixtures.

The package itself is not executable authority.

## Transfer lifecycle

```text
source environment
  -> build inert package
  -> digest artifacts
  -> sign manifest
  -> optional independent witness
  -> transfer
  -> untrusted ingress
  -> verify framing/digests/signatures
  -> quarantine
  -> inspect/scan
  -> local diff + policy review
  -> explicit admission
  -> install admitted subset
  -> activate only through normal authority path
```

The most important distinctions are:

**signed does not mean safe**  
**witnessed does not mean authorized**  
**imported does not mean installed**  
**installed does not mean activated**

## Why quarantine is mandatory

A correctly signed artifact can still be malicious, compromised, obsolete, inappropriate for the receiving jurisdiction, or dangerously privileged.

Signature verification answers who signed which bytes under a named key/profile. It does not answer whether the receiving institution should execute them.

Every imported package therefore lands in an inert quarantine namespace.

## Air-gapped environments

Air gaps change transport, not trust semantics.

Removable media, couriered drives, one-way transfer appliances, QR/optical channels, and staged transfer workstations should all be treated as untrusted ingress.

Where practical:

1. transfer validation occurs on a lower-trust staging system;
2. no autorun or executable interpretation occurs during framing/digest checks;
3. only explicitly admitted artifacts cross into the protected enclave;
4. evidence leaving the enclave uses a separately governed export path;
5. any return-channel package undergoes the full quarantine process again.

## Witnesses and transparency

A package may include evidence from:

- transparency logs;
- reproducible-build witnesses;
- independent reviewers;
- institutions;
- supply-chain attestors;
- timestamp/archive services.

These improve the evidence available to the receiver. They never replace local trust policy.

## Studio relationship

Studio is a natural place to assemble a package because it knows the artifact graph, provenance, intended topology, protection profiles, and dependency set.

But Studio publication does not authorize transfer or activation.

The receiving node or institution remains sovereign over admission.

## Threats addressed

This boundary is intended to reduce:

- path traversal and archive confusion;
- dependency substitution;
- stale trusted packages;
- signer-key confusion;
- compromised upstream releases;
- air-gap removable-media infection;
- silent privilege growth between versions;
- supply-chain provenance loss;
- treating vendor signatures as authorization;
- hidden replacement of verifier or policy material.

## Governing rule

> **Move evidence and artifacts freely enough to preserve autonomy. Move authority only through explicit local admission.**
