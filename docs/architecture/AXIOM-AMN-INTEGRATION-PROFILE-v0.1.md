# AXIOM–AMN Integration Profile
## Version 0.1
**Date:** 2026-09-14  
**Status:** Architecture profile / implementation input  
**Scope:** Identity, provenance, attestation, revocation, trust federation, selective disclosure, offline operation and evidence integration for AMN.  
**Authority boundary:** This profile creates evidence and trust inputs only. It does not create autonomous attack, destructive payload, weapon-control, terminal-guidance, or other destructive-effect authority.

---

# 1. Purpose

AMN's surviving commercial hypothesis is a neutral assurance layer across heterogeneous autonomous-system ecosystems.

AXIOM-MESH already contains many of the safety and evidence semantics AMN needs:

- Grid-owned encrypted durable state;
- signed hash-linked evidence;
- external continuity anchors for truncation assurance;
- identities, consent, governance and node records;
- Ed25519 service identities;
- SPIFFE-style service URI identity;
- constrained machine principals with sponsor, finite scope/purpose/destination, expiry and non-delegation;
- explicit separation between evidence and authority;
- explicit separation between cryptographic validity and real-world truth;
- import/export manifests, selective scopes and recipient encryption;
- zero-authority portable machine-identity laboratory semantics.

The integration should therefore **reuse AXIOM's trust semantics without making AMN depend on the AXIOM runtime**.

---

# 2. Core architectural rule

> **AMN must remain fully functional when AXIOM-MESH is absent.**

AXIOM is an optional trust/provenance substrate.

```text
                    CUSTOMER / OPERATOR
                           |
                           v
                    +--------------+
                    |   AMN-Core   |
                    | local trust  |
                    | local state  |
                    +------+-------+
                           |
          +----------------+----------------+
          |                |                |
          v                v                v
      AMN-Bridge       AMN-Provision     AMN-Sim/Test
          |
          v
 third-party heterogeneous nodes
          |
          +-----------------------------+
                                        |
                              optional AXIOM adapter
                                        |
                                        v
                              +--------------------+
                              |    AXIOM-MESH      |
                              | Grid evidence      |
                              | identity/governance|
                              | trust federation   |
                              +--------------------+
```

Failure or absence of the AXIOM adapter must not prevent AMN from:

- identifying locally enrolled nodes;
- validating locally trusted signatures;
- storing local evidence;
- revoking local trust;
- operating its local fusion/assurance functions;
- producing local audit records.

AXIOM adds:

- federated trust-domain evidence;
- stronger signed provenance chains;
- cross-organization credential/presentation support;
- external continuity anchoring;
- selective-disclosure packaging;
- portable verification artifacts.

---

# 3. Non-goals

This profile does **not**:

1. make AXIOM the manufacturer identity authority for every vendor;
2. make cryptographic validity equivalent to sensor truth;
3. make a credential or attestation an authorization to perform an effect;
4. claim TPM, TEE, measured boot or hardware remote attestation unless measured evidence exists;
5. require blockchain or replicated consensus;
6. require Internet connectivity;
7. require one vendor to trust another vendor directly;
8. pool authority across swarm members;
9. create autonomous delegation;
10. replace customer procurement, airworthiness, cyber, legal or safety acceptance.

---

# 4. Current AXIOM primitives to reuse

The current AXIOM-MESH build already establishes several semantics AMN should preserve.

## 4.1 Grid evidence

Grid owns durable encrypted state, identities, governance, node records and a signed hash-linked evidence chain.

AMN should use the same conceptual distinction:

```text
AMN fact
   |
   v
canonical representation
   |
   v
digest
   |
   v
signed evidence event
   |
   v
hash-linked history
   |
   +--> optional external continuity anchor
```

Local chain verification proves modification consistency inside the retained chain. It does not by itself prove that a malicious administrator did not delete the newest tail. AXIOM's external continuity-anchor concept therefore maps directly to AMN assurance archives.

## 4.2 Machine principals

Current AXIOM machine principals are:

- human-sponsored;
- finite-scope;
- action/purpose/destination constrained;
- expiring;
- non-delegating;
- bounded by rate/concurrency/runtime ceilings;
- incapable of manufacturing authority through peer communication.

AMN should inherit these semantics for service/workload identities.

## 4.3 Evidence is not authority

A signed statement proves that a trusted issuer made the statement.

It does **not** prove:

- the physical world matched the statement;
- the issuer was correct;
- a device is legally certified;
- a sensor classification is true;
- a vendor identity creates AMN execution authority;
- a group of valid nodes gains pooled authority.

This distinction is mandatory in every AMN verifier and operator UI.

## 4.4 Current hardware-attestation limitation

AXIOM currently treats runtime IDs and software digests as attribution/binding metadata, not hardware, TPM/TEE, measured-boot or remote-attestation proof.

AMN v0.1 must preserve that non-claim.

---

# 5. Standards profile

Use stable standards where they reduce proprietary trust logic.

## 5.1 Compact signed edge statements

**CBOR + COSE (RFC 9052)** is the preferred constrained-edge representation for signed AMN trust statements.

Initial profile:

```text
payload -> canonical CBOR
signature envelope -> COSE_Sign1
signature algorithm -> Ed25519 / EdDSA where supported
```

Reason:

- compact;
- suitable for constrained links;
- aligned with AXIOM's existing Ed25519 identity direction;
- independently standardized.

Exact algorithm registration/profile must be frozen before implementation.

## 5.2 Workload/service identity

**SPIFFE** is the preferred model for portable workload identity and trust-domain federation.

Important distinction:

AXIOM currently uses **SPIFFE-style URI identity** internally. AMN must not claim SPIFFE compliance until the full required SPIFFE identity/SVID behavior is implemented and tested.

Preferred future production profile:

- X.509-SVID for service-to-service authentication;
- explicit trust domains per organization/security boundary;
- federation only through configured trust bundles;
- no implicit trust-domain merging.

## 5.3 Organization/vendor credentials

Use **W3C Verifiable Credentials Data Model 2.0**, the stable W3C Recommendation, for portable organization/vendor/qualification credentials where a VC format is useful.

Do not base v0.1 on the 2.1 Working Draft.

Potential credentials:

- vendor identity;
- manufacturing facility authorization;
- platform family qualification;
- calibration authority;
- software-signing authority;
- operator qualification.

VC validity remains a claim by an issuer, not AMN authority.

## 5.4 Device-state attestation — future profile

Use the **IETF RATS architecture (RFC 9334)** and **Entity Attestation Token (EAT, RFC 9711)** as the future remote-attestation model.

RFC 10013 measured components can represent measured firmware/software components.

This is **future work**.

AMN v0.1 does not claim remote hardware attestation unless:

- hardware trust root is identified;
- evidence source is reviewed;
- verifier policy exists;
- freshness is established;
- negative tests exist.

## 5.5 Software/model provenance

Use:

- in-toto Attestation Framework;
- SLSA provenance v1.2 concepts;
- signed artifact digests.

For AMN, provenance should cover:

```text
source revision
build definition
build output digest
SBOM reference
model artifact digest
configuration digest
signing authority
release approval
```

## 5.6 Transparency / receipts

**SCITT RFC 9943** provides a useful architecture for trustworthy/transparency statements.

Do not make AMN v0.1 depend on the SCITT Reference API while that API is still finishing standardization.

AXIOM Grid + retained external continuity anchors remain sufficient for the initial pilot.

## 5.7 Update trust

TUF-style signed metadata/rollback protection is a candidate for future software/update distribution.

AMN v0.1 only requires:

- signed release manifest;
- exact artifact digest;
- authorized signer;
- rollback policy;
- previous-known-good recovery.

---

# 6. Trust-domain architecture

Every administrative domain retains its own authority.

```text
Vendor A trust domain       Vendor B trust domain
        |                           |
        v                           v
 platform credentials       platform credentials
        |                           |
        +------------+--------------+
                     |
                     v
             AMN local verifier
                     |
        local admission policy
                     |
                     v
             trusted AMN view
                     |
            optional federation
                     |
                     v
               AXIOM-MESH
```

AMN does not require Vendor A to trust Vendor B.

AMN's customer defines:

- accepted issuers;
- accepted roots;
- credential types;
- status freshness;
- required evidence;
- assurance level.

---

# 7. Identity classes

AMN must distinguish at least five identities.

## 7.1 Organization identity

Examples:

- manufacturer;
- operator;
- maintainer;
- calibration authority;
- software publisher;
- test authority.

## 7.2 Physical node identity

Represents one physical device/platform.

It must not be conflated with:

- one running process;
- one software image;
- one operator;
- one vendor.

## 7.3 Workload identity

Represents one running software service/process or defined workload.

Examples:

- AMN node agent;
- tracklet producer;
- bridge adapter;
- gateway;
- AMN-Core ingestion service.

## 7.4 Artifact identity

Represents immutable content by digest.

Examples:

- firmware;
- model bundle;
- configuration;
- SBOM;
- calibration package;
- software release.

## 7.5 Observation identity

Every observation/tracklet receives an immutable identifier bound to:

- producing node;
- producing workload;
- capture time;
- data digest;
- configuration/model evidence references.

---

# 8. AMN trust statements

The initial profile defines seven statement classes.

1. `axiom-amn-node-identity.v1`
2. `axiom-amn-workload-binding.v1`
3. `axiom-amn-configuration-attestation.v1`
4. `axiom-amn-software-model-attestation.v1`
5. `axiom-amn-observation-proof.v1`
6. `axiom-amn-status.v1`
7. `axiom-amn-conformance-receipt.v1`

These names describe AMN/AXIOM profile objects. They do not imply that every object is currently implemented in AXIOM main.

---

# 9. Enrollment lifecycle

```text
vendor / operator issuer
        |
        | signed identity / manifest
        v
AMN-Provision
        |
        | verify trusted issuer
        | verify statement schema
        | verify status/currentness
        | apply local admission policy
        v
local AMN node record
        |
        +--> local evidence log
        |
        +--> optional AXIOM adapter
                    |
                    v
               Grid evidence
```

Enrollment rules:

- no self-service authority creation;
- no trust-on-first-use for production identities;
- unknown issuer fails closed;
- expired/revoked identity cannot enter trusted state;
- admission is a local AMN/customer decision even when the credential is valid;
- admission receipt records exactly which evidence and policy version were evaluated.

---

# 10. Runtime workload binding

A physical node and its running workload are different facts.

```text
Physical node
   ID: node-73
        |
        +--- configuration digest
        +--- hardware/platform record
        |
        v
Running workload
   workload ID
   software digest
   model bundle digest
   runtime/session ID
        |
        v
signed workload-binding statement
```

A valid node identity does not make arbitrary software trusted.

A valid workload identity does not prove the physical host is genuine unless hardware attestation is separately present.

---

# 11. Observation proof

Every trusted AMN observation should be able to reference a compact evidence envelope.

```text
Observation
  observation_id
  timestamp
  source node
  source workload
  sensor ID
  data digest
  coordinate frame / uncertainty
  classification + confidence
  model digest
  configuration digest
  status snapshot reference
  signature/evidence reference
```

Recommended structure:

```text
tracklet payload
       |
       v
canonical digest
       |
       v
COSE signed observation proof
       |
       +--> local AMN verification
       |
       +--> optional AXIOM Grid evidence event
```

AMN-Core should not require the full provenance bundle on every network packet.

Instead:

- tracklet carries compact evidence references;
- evidence package is retrievable on demand;
- high-bandwidth proof material can use store-and-forward.

---

# 12. Fusion semantics

Fusion must never erase provenance.

```text
obs A ----\
obs B -----+--> derived track T
obs C ----/
```

Track T records:

- source observation IDs;
- source confidence/uncertainty;
- source trust status;
- fusion algorithm/version;
- derived time/state;
- resulting uncertainty;
- evidence references.

A derived track is a new claim.

It is not a replacement for its source evidence.

---

# 13. Revocation and status

Revocation is one of AMN's highest-value cross-vendor assurance functions.

Status applies separately to:

- organization credential;
- physical node;
- workload identity;
- software release;
- model;
- configuration;
- operator credential.

Status states:

```text
ACTIVE
SUSPENDED
REVOKED
EXPIRED
UNKNOWN
STALE
QUARANTINED
```

Historical evidence is not deleted when a node is revoked.

Instead:

- future trusted ingestion is denied or quarantined;
- historical observations retain the status/currentness that existed when they were accepted;
- operator can see later revocation as subsequent evidence.

---

# 14. Offline and disconnected operation

AMN must work without Internet or AXIOM connectivity.

Each AMN deployment maintains:

- cached issuer trust bundles;
- cached status snapshots;
- local revocation set;
- local evidence store;
- local policy version;
- local trusted time source/uncertainty record where possible.

## Status freshness

Every status source has:

- retrieved-at;
- valid-until / freshness ceiling;
- source identity;
- digest.

When freshness expires:

```text
low-consequence inspection -> may continue with STALE label
new trusted enrollment       -> fail closed
credential privilege widening -> fail closed
unknown/revoked status        -> quarantine / deny trusted promotion
```

AMN does not silently convert stale trust into current trust.

When connectivity returns:

- refresh status;
- reconcile evidence;
- preserve conflicts;
- do not rewrite old history.

---

# 15. Selective disclosure

AMN/AXIOM should support minimum necessary disclosure.

Example:

A partner may need to know:

- observation came from an admitted platform;
- software/model was approved;
- credential was current at capture;
- track was supported by 3 independent nodes;

without learning:

- platform serial number;
- vendor-internal BOM;
- operator identity;
- exact source location;
- sensitive calibration details.

Initial implementation may use:

- redacted signed export bundles;
- disclosed fields + stable content digests;
- recipient encryption;
- issuer/status references.

Do not claim cryptographic selective disclosure until one exact VC/COSE presentation profile is selected and tested.

---

# 16. Cross-vendor conformance receipts

AMN's neutral role is strongest when it records **tests rather than opinions**.

A conformance receipt can state:

```text
test suite ID
test-suite version
vendor/platform ID
software/configuration digest
adapter version
test environment
result set digest
pass/fail/partial
exceptions
tester identity
time
evidence bundle digest
```

The receipt proves what the test authority recorded.

It does not certify the platform outside the tested configuration.

---

# 17. AXIOM authority boundary

AXIOM trust material is an input to AMN policy.

It is not executable authority by itself.

```text
credential
   |
   v
verified evidence
   |
   v
local policy evaluation
   |
   +--> accepted for observation?
   +--> quarantined?
   +--> denied?
```

Never:

```text
valid credential => automatic effect authority
```

Never:

```text
multiple trusted nodes => pooled authority
```

This preserves AXIOM's Collective Authority Non-Amplification rule.

---

# 18. AMN standalone fallback

AMN implements a minimal local trust interface.

```text
TrustProvider
  verifyIdentity()
  verifyStatement()
  status()
  recordEvidence()
  exportEvidence()
```

Implementations:

1. `LocalTrustProvider`
2. `AxiomTrustProvider`

AMN business logic consumes the interface, not AXIOM directly.

Requirements:

- both providers return normalized verification results;
- AXIOM-specific metadata lives in an extension field;
- loss of AXIOM connection does not change local authority;
- switching providers cannot silently widen trust.

---

# 19. Integration deployment modes

## Mode 0 — AMN standalone

No AXIOM dependency.

Use:
- local trust roots;
- local evidence;
- local status/revocation.

## Mode 1 — AXIOM shadow evidence

AMN remains authoritative for its own local trust decisions.

Selected AMN evidence is mirrored to AXIOM Grid.

No AXIOM decision affects AMN runtime.

**Recommended first implementation.**

## Mode 2 — federated verification

AMN can consume configured AXIOM federation statements/status.

Local AMN policy still decides admission.

## Mode 3 — portable cross-organization trust

Vendor/operator credentials and selective presentations can move across administrative domains.

Requires independent security/privacy/interoperability review.

---

# 20. v0.1 implementation sequence

## AXAMN-0 — schema-only

Deliver:

- exact seven statement schemas;
- canonical digests;
- normalized TrustProvider API;
- test vectors;
- no runtime dependency.

## AXAMN-1 — local signing

Use local Ed25519/COSE signing for:

- node identity;
- configuration;
- software/model;
- observation proof.

No remote-attestation claim.

## AXAMN-2 — AXIOM shadow adapter

AMN evidence -> AXIOM signed Grid events.

Verify:

- chain integrity;
- replay rejection;
- exact evidence digest;
- Grid continuity-anchor compatibility.

AXIOM remains non-authorizing.

## AXAMN-3 — two-domain federation test

Simulate:

- Vendor A trust domain;
- Vendor B trust domain;
- customer AMN domain.

Prove:

- neither vendor can mint identity for the other;
- local customer policy can accept/reject each independently;
- revoking A does not affect B.

## AXAMN-4 — portable credential profile

Select exactly one stable VC 2.0 credential/presentation profile.

Test:

- issuer trust;
- holder/presenter binding as applicable;
- status freshness;
- revocation;
- minimum disclosure;
- recipient privacy.

## AXAMN-5 — hardware attestation research

Only after a real hardware target is selected.

Evaluate:

- RATS;
- EAT;
- RFC 10013 measured components;
- actual device roots;
- freshness/replay.

No production promotion without independent review.

---

# 21. v0.1 acceptance criteria

The integration profile passes when:

1. AMN runs with AXIOM completely absent.
2. Enabling AXIOM shadow mode does not change AMN authority decisions.
3. Three logical nodes have distinct identities and signed observation proofs.
4. At least two simulated vendor trust domains coexist.
5. Vendor A cannot mint/replace Vendor B identity.
6. A revoked node cannot create new trusted observations.
7. Historical observations remain auditable after later revocation.
8. Wrong configuration digest is detected.
9. Wrong model digest is detected.
10. Signed evidence tampering is detected.
11. Replay of a one-use enrollment/status object is rejected where applicable.
12. AXIOM Grid evidence binds the exact AMN evidence digest.
13. Loss of AXIOM connection leaves AMN standalone operation intact.
14. Stale status is visibly stale and never silently promoted to current.
15. No credential or collective membership creates execution authority.
16. No test output claims hardware attestation without hardware-backed evidence.
17. An evidence export can disclose a minimized subset without exposing unrelated sensitive fields.
18. Independent verification can reproduce the evidence result from exported public trust material.

---

# 22. Metrics to collect

- bytes added per tracklet;
- signing latency;
- verification latency;
- status lookup latency;
- cached/offline verification latency;
- evidence-store growth;
- revocation propagation time;
- stale-status frequency;
- rejected/unknown issuer count;
- proof retrieval latency;
- Grid shadow-export queue depth;
- reconciliation conflicts;
- CPU/power cost on representative edge compute.

No performance target should be frozen until measured.

---

# 23. Security requirements

1. Trust roots are explicitly configured.
2. No production trust-on-first-use.
3. Private keys are non-exportable where platform support permits.
4. Key rotation retains lineage.
5. Retired keys cannot sign current evidence.
6. Unknown issuers fail closed.
7. Revoked identities cannot regain trust through cached old state.
8. Time uncertainty is recorded.
9. Status freshness is policy-bound.
10. Cross-vendor federation cannot widen local authority.
11. No self-asserted credential creates trusted issuer status.
12. No peer/mesh consensus creates authority.
13. Evidence schemas are canonical and versioned.
14. Unknown schema versions fail closed or quarantine.
15. Selective exports do not silently remove required negative/status evidence.
16. Evidence imports preserve original issuer and signature.
17. Customer data boundaries survive AXIOM export.
18. AXIOM loss cannot broaden AMN behavior.

---

# 24. Standards baseline

Stable baseline for v0.1 design:

- W3C Verifiable Credentials Data Model 2.0 — Recommendation, 2025-05-15
- RFC 9052 — COSE
- RFC 9334 — RATS Architecture
- RFC 9711 — Entity Attestation Token
- RFC 10013 — EAT Measured Component
- RFC 9943 — SCITT Architecture
- SPIFFE stable specifications
- in-toto Attestation Framework 1.0
- SLSA 1.2 provenance concepts
- TUF 1.0.x specification family

Standards are inputs, not certification claims.

---

# 25. AXIOM repository alignment

Current AXIOM-MESH evidence reviewed from `main` at commit:

`6ab02963f16cb56140f297b6e4508389619b0e63`

Relevant documents:

- `docs/PRODUCTION-READINESS-TRACKER.md`
- `docs/security/CURRENT-BUILD-THREAT-MODEL.md`

Key inherited non-claims:

- portable machine identity is identity-evidence laboratory only;
- hardware attestation remains a separate gate;
- runtime IDs/software digests are attribution metadata;
- cryptographic validity is not content truth;
- Grid is one transparency log, not replicated consensus;
- portable credentials do not create runtime authority.

---

# 26. Decision

**Recommended first slice: Mode 1 — AXIOM shadow evidence.**

Why:

- proves integration without coupling AMN availability to AXIOM;
- exercises real AXIOM Grid/evidence semantics;
- preserves vendor neutrality;
- avoids premature VC/federation complexity;
- avoids false hardware-attestation claims;
- produces portable evidence for later buyer discovery and conformance testing.

The next engineering artifact after this profile should be the exact schema catalog and conformance test suite, not a broader architecture redesign.
