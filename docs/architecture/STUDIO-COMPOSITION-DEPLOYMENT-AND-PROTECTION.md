# Studio, Composition, Deployment, and Adaptive Protection

**Status:** experimental architecture; no production-promotion claim.

## Decision

Studio should be the **universal authoring and composition workbench**, not the universal runtime.

That means Studio is the natural place to build and inspect:

- organizational and institutional contracts;
- governance patterns;
- agent/runtime capsules;
- skill/tool capsules;
- adapters and connectors;
- deployment manifests;
- protection, encryption, verification, retention, and offline-sync profiles;
- simulations, fixtures, recovery plans, and scaffolds.

But Studio should not become the authority root, production secret vault, independent verifier, deployment approver, or consequential executor.

This separation gives users one coherent place to build while preserving blast-radius boundaries.

## Why not split authoring into many separate products?

Splitting contract authoring, capsule construction, deployment topology, institutional pattern design, and adapter scaffolding into unrelated authoring tools would duplicate:

- schema editors;
- provenance;
- diff/review;
- simulation;
- dependency graphs;
- policy previews;
- test harnesses;
- signing/publishing workflows.

Those are the reusable "molecular machinery" of building. Studio should provide them once.

The specialized responsibilities should split **after authoring**, where trust boundaries differ.

```text
                         Studio
        author / compose / inspect / simulate
             /        |        |        \
        contracts   capsules  topology   profiles
             \        |        |        /
                 inert candidate artifacts
                          |
                independent verification
                          |
                   local approval/adoption
                          |
                 deployment controller
                          |
                runtime / node / enclave
                          |
                  receipts + evidence
                          |
                        Verify
```

## Product / trust-plane boundary

### Studio
Human-and-agent composition environment. It can generate artifacts and explain consequences. Imported artifacts remain inert.

### Verify
Independent verification surface for proofs, receipts, provenance, signatures, conformance, transparency, and artifact identity. Verify should be usable without trusting Studio.

### Deployment controller
A narrow installation/activation mechanism. It resolves target topology and stages approved artifacts. It cannot broaden permissions.

This may initially be a command-line/native node function rather than a separate branded product. The architecture should not force a product split prematurely.

### Runtime / Node
Executes locally admitted capabilities and owns operational state according to policy.

### Custody
Keys, secrets, and recovery material remain logically separate. Studio receives handles/requirements, not ambient plaintext secret access.

## Adaptive protection

A single "security level" is too crude. Different workloads need independently selectable dimensions:

- encryption;
- verification;
- contracting;
- retention;
- connectivity;
- availability;
- assurance.

For example, a school credential could use high verification, selective disclosure, durable retention, and ordinary availability. A temporary local research simulation could use strong at-rest encryption, ephemeral retention, no external connectivity, and low institutional assurance because it produces no authoritative result.

The profile is therefore a **vector**, not a ladder.

## Encryption

Studio may select or author a cryptographic profile, but it should not invent cryptography.

Versioned profiles should eventually name exact suites, key lifecycles, custody modes, rotation, compromise behavior, forward secrecy where applicable, and migration rules.

Useful deployment choices include:

- local at-rest encryption;
- scoped end-to-end encryption;
- selective disclosure;
- hardware-backed custody;
- threshold/split custody;
- air-gapped custody.

Encryption never substitutes for authority, provenance, consent, or verification.

## Contracting

"Contract" is also a reusable artifact class rather than one legal ontology.

Studio should support machine-readable structures for:

- informational terms;
- bilateral signed agreements;
- multi-party agreements;
- institutional charters;
- delegated mandates;
- conditional/escrow-like obligations;
- jurisdiction-bound procedures;
- threshold/quorum-governed agreements.

The artifact must state its assumptions and local legal/governance context. A digital signature proves the signed bytes/key relationship; it does not by itself establish legal enforceability, comprehension, absence of coercion, or runtime authority.

## Offline and local Mesh

Offline operation should be a first-class deployment mode rather than a degraded afterthought.

A local Mesh can operate on:

- one device;
- a LAN;
- an intermittently connected field network;
- a private institutional network;
- an air-gapped enclave.

The critical rule is to distinguish **local facts that can remain current** from **external facts whose freshness cannot be checked while disconnected**.

For example:

- a locally issued still-valid grant may continue if policy permits;
- a workflow requiring a fresh external revocation check must remain pending/denied;
- a cached credential may remain advisory while its authoritative currentness is unknown;
- local receipts continue to accumulate and reconcile later.

Reconnection is a reconciliation event, not an automatic overwrite.

## Installation instances

A Studio artifact should be deployable many times without becoming the instance itself.

```text
artifact template
   -> local adaptation
   -> deployment manifest
   -> approved installation
   -> instance identity
   -> local state / keys / receipts
```

Each instance therefore has separate:

- instance identity;
- installed artifact digests;
- local configuration;
- authority roots;
- secrets/custody handles;
- topology;
- policy overlays;
- migration state;
- backup/recovery state.

This lets one capsule or institutional framework be reused across a home node, school, research lab, municipal service, or air-gapped enclave while preserving local sovereignty.

## Agent use of Studio

Agents should be able to help construct artifacts, generate tests, compare profiles, propose topology, and simulate consequences.

They should not self-approve their own capsule, deployment, policy expansion, verification result, or secret access.

Studio is therefore a powerful creative environment with an intentionally weak authority posture.

## Governing maxim

**Build everything in one compositional language. Verify independently. Activate locally. Execute elsewhere.**
