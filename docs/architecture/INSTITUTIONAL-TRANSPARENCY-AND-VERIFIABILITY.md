# Institutional Transparency and Verifiability Manifests

**Status:** experimental trust architecture; not a certification or compliance claim.

AXIOM needs a way to answer a simple but difficult institutional question:

> **What exactly do I still have to trust?**

Open source alone is not enough. A public repository does not prove which bytes are deployed, who can upgrade them, which trust anchors are active, whether revocation is current, or whether an operator can silently change policy.

Likewise, secrecy is not automatically incompatible with trust. A sensitive system may legitimately keep protected implementation details or records confidential while exposing narrow proofs, digests, audit evidence, or controlled reviewer access.

The manifest therefore classifies trust-critical surfaces by how they can be inspected:

- **public inspectable**;
- **independently verifiable**;
- **selectively disclosed**;
- **confidential auditable**;
- **opaque dependency**.

## What should be disclosed

For any high-consequence service, the relying party should be able to identify, as appropriate:

- identity and trust anchors;
- authorization semantics;
- policy version/change process;
- verifier/cryptographic implementation;
- source provenance;
- build/deployment reproducibility;
- upgrade authority;
- revocation/currentness mechanism;
- data handling and retention;
- audit/evidence continuity;
- incident-response authority;
- recovery/key-rotation authority;
- external operators/providers;
- known limitations.

The purpose is not radical publicity. It is **bounded inspectability of the claims on which trust depends**.

## Opaque dependencies

Opacity must be visible.

If a payment gateway, identity provider, cloud operator, notification service, proprietary verifier, or managed model is a trust-critical dependency and cannot be independently inspected, the manifest records:

- what role it plays;
- whether it is replaceable;
- what assumptions are being made;
- what evidence is still available.

This lets local policy decide whether that residual trust is acceptable for the consequence level.

## Selective disclosure

Some trust claims can be verified without exposing the underlying sensitive material.

Examples include:

- proving a build matches a source digest;
- proving a credential predicate without revealing the full record;
- proving that a reviewer inspected a confidential artifact;
- exposing a transparency-log inclusion proof;
- publishing a policy digest while protecting classified operational details.

This composes with proof-bearing assertions and portable verification bundles.

## Change control

A trustworthy snapshot is insufficient if nobody knows who can change it.

The manifest therefore binds the declared change-control policy, upgrade authorities, emergency-change process, and change evidence.

A system can be highly transparent yet still unsafe if one undisclosed operator can rewrite trust-critical state.

## Institutional use

A school, municipality, research lab, cooperative, company, public agency, or machine organization can publish the same neutral manifest while choosing different disclosure classes for different surfaces.

Local policy can then say, for example:

```text
high-consequence credential verifier
  -> independently verifiable required

internal HR records
  -> confidential auditable acceptable

optional notification relay
  -> opaque but replaceable accepted
```

## Non-authority

Transparency improves the evidence available to a relying party.

It never creates permission.

```text
transparency / audit / witness
    -> evidence about trust assumptions
    -> local reliance decision
    != runtime authority
```

## Governing rule

**Expose the trust boundary. Prove what can be proved. Declare what cannot. Let reliance remain local.**
