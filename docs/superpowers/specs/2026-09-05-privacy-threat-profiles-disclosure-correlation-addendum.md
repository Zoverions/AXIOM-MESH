# Privacy Threat Profiles, Disclosure Firewall, and Correlation/Attribution — Design Addendum

**Status:** approved design addendum; documentation-only; no capability promotion

**Date:** 2026-09-05

**Programme:** #1482

**Extends:** `docs/superpowers/specs/2026-09-03-privacy-preserving-collective-intelligence-design.md`

**Related foundations:** current threat model, sovereign-host programme, sovereign vaults/context, remote-social threat review, telemetry minimization, pseudonymous/persona projection, import/export, and signed evidence.

## 1. Decision

The privacy-preserving collective-intelligence design remains the canonical population-analytics architecture. This addendum closes three adjacent gaps exposed by reviewing operational-anonymity guidance:

1. **Threat profiles** — privacy/anonymity protections must be selected against an explicit threat model instead of treating one maximum-friction posture as universal.
2. **Disclosure firewall** — anything leaving a private boundary should be inspectable for metadata, watermarking, malicious content, accidental identity leakage, and other attribution surfaces before release.
3. **Correlation and attribution threat model** — AXIOM must distinguish confidentiality, privacy, anonymity, correlation, and attribution, including host/device/behavioral leakage that can defeat application-level pseudonymity.

These are cross-cutting controls. They do not create a new privacy authority plane and do not replace contribution authority, release safety, consent, execution authorization, or the statistical privacy ledger.

The governing extension is:

> **A payload can be confidential yet attributable; pseudonymous yet correlated; statistically private yet operationally identifying. AXIOM must evaluate the relevant property explicitly rather than infer one from another.**

## 2. Source-derived rationale and limits

This addendum was prompted by a review of Anonymous Planet's *The Hitchhiker's Guide to Online Anonymity (and Privacy)*. The source is useful as adversarial/operational guidance, not as a normative AXIOM specification.

The source specifically highlights:

- network, hardware, OS/application telemetry, device identifiers, metadata, files, watermarking, local forensic residue, and behavioral/stylometric signals as possible deanonymization surfaces;
- the distinction between correlation and attribution;
- threat-model selection rather than assuming one posture fits every user;
- pre-sharing checks for metadata, malware, watermarking, and writing/forensic leakage;
- LINDDUN as one privacy-oriented threat-model method that can complement security methods such as STRIDE;
- physical-tampering/evil-maid considerations where detection may sometimes be a distinct strategy from prevention;
- independently verifiable downloads using hashes/signatures.

AXIOM does **not** inherit specific Tor/Qubes/Whonix/VPN/browser recommendations by citation. Those are deployment choices for particular threat models. This design extracts the reusable architectural lesson: identity and privacy can leak through layers outside the application protocol, so the system must model those layers explicitly and fail truthfully when it cannot enforce them.

Reference:

- https://anonymousplanet.net/guide/

## 3. Privacy, anonymity, correlation, and attribution are separate claims

AXIOM documentation, capability claims, receipts, and UI must not treat the following as synonyms:

- **confidentiality** — unauthorized parties cannot read protected content;
- **privacy** — collection/use/disclosure is appropriately limited for the declared purpose;
- **pseudonymity** — an interaction uses a context-specific identifier rather than a direct civil/owner identity;
- **unlinkability** — two events/records are difficult to determine as belonging to the same subject under the stated threat model;
- **anonymity** — a subject is not identifiable within the stated anonymity set/threat model;
- **correlation** — observations can be associated with one another, even without yet naming the subject;
- **attribution** — observations can be associated with a particular subject/entity/device/origin with stated confidence.

Required claim discipline:

1. encryption does not imply anonymity;
2. pseudonymity does not imply unlinkability;
3. unlinkability at the application identifier layer does not imply unlinkability at the host/network/behavior layer;
4. differential privacy for an aggregate does not imply that contribution participation is operationally anonymous;
5. a sanitized file does not imply anonymous authorship if stylometry, embedded content, network timing, or account history still supports attribution;
6. a tamper-evident device does not imply a tamper-resistant device;
7. a signed artifact proves the signer-bound statement, not that the signer is benign or that the artifact is anonymous.

## 4. Threat Profile primitive

AXIOM should represent privacy/anonymity posture as an explicit, versioned, effect-inert `PrivacyThreatProfile`.

A profile describes required protections and residual risks. It never grants authority.

### 4.1 Initial profile classes

The first contract should support only three coarse classes:

- `baseline-private` — ordinary local-first privacy, minimum disclosure, encrypted state, bounded telemetry, normal authenticated networking;
- `correlation-resistant` — adds stronger persona/context isolation, metadata minimization, disclosure review, and correlation-aware network/host requirements;
- `high-anonymity` — requires separately reviewed host/network/identity isolation and explicit acknowledgement that some attribution channels may remain outside enforcement.

The classes are configuration/evidence requirements, not guarantees by name.

### 4.2 Required fields

A threat profile should bind at least:

- schema/version;
- profile id;
- profile class;
- purpose/context;
- adversary capabilities being considered;
- required protection categories;
- explicitly accepted residual risks;
- host/device telemetry posture;
- network metadata posture;
- persona/context isolation requirement;
- disclosure-inspection requirement;
- physical-tamper posture;
- artifact-verification posture;
- expiry/currentness;
- policy digest;
- explicit `authority_effect: none`.

### 4.3 Fail-closed semantics

If a workflow claims a particular profile, required evidence for that profile must be present and current.

Missing evidence cannot silently downgrade a claimed `high-anonymity` operation into `baseline-private` while still presenting the original claim.

A product may offer a lower profile only as a visibly different alternative that the authorized user explicitly selects.

## 5. Correlation and Attribution Threat Model

The current collective-intelligence threat model already covers repeated releases, auxiliary information, timing, audit correlation, pseudonym linkage, and model leakage. This addendum extends correlation review across the full stack.

### 5.1 Correlation surfaces

Review at minimum:

- account/principal identifiers;
- persona identifiers and cross-persona reuse;
- stable cryptographic keys or certificates;
- source/destination network metadata;
- IP/DNS/relay exposure where applicable;
- packet timing, size, retry cadence, and online/offline patterns;
- hardware identifiers;
- OS/device identifiers and enumeration history;
- application/OS telemetry identifiers;
- browser/runtime fingerprints where a browser surface exists;
- file metadata and embedded previews/thumbnails;
- watermarks and steganographic/format-specific markers;
- document revision history;
- EXIF/media metadata;
- linguistic/stylometric signals;
- recurring behavioral schedules;
- receipts/audit timestamps and stable event handles;
- backups/sync-provider metadata;
- recovery artifacts;
- physical-device tamper state;
- external public/commercial datasets.

### 5.2 Correlation graph rule

AXIOM must not build a hidden universal correlation graph merely to detect correlation.

Correlation analysis should prefer:

- local/context-scoped evaluation;
- bounded feature summaries;
- ephemeral analysis identifiers;
- purpose-separated evidence;
- explicit retention;
- aggregate risk classifications instead of reusable subject mappings.

A correlation detector that permanently links every persona, device, file, and network event would violate the privacy goal it is meant to protect.

### 5.3 Attribution evidence

Where attribution is relevant, evidence must identify what kind of attribution is being claimed:

- content-origin attribution;
- account/principal attribution;
- device attribution;
- network-origin attribution;
- signer/key attribution;
- behavioral/stylometric attribution;
- civil/legal identity attribution.

One category does not automatically prove another.

## 6. Disclosure Firewall

A `Disclosure Firewall` is the policy/evidence boundary for content leaving a private context.

The first implementation is **not** an automatic sanitizer. It is an effect-inert inspection contract and decision model that can later compose with separately reviewed sanitizers and exporters.

Conceptual flow:

```text
private object / generated artifact / export candidate
  -> identify target audience + purpose
  -> resolve PrivacyThreatProfile
  -> inspect supported attribution/leakage surfaces
  -> produce bounded findings
  -> apply disclosure policy
  -> deny | require review | allow sanitized/verified candidate
  -> existing authority/export path
  -> release receipt
```

The firewall does not itself authorize transmission.

### 6.1 Initial inspection categories

The v1 inert contract should model these categories only:

- `metadata`
- `watermark`
- `malware`
- `embedded-content`
- `identity-marker`
- `stylometry`
- `format-risk`

Each category records one of:

- `not_checked`
- `clear`
- `finding`
- `unsupported`

A claimed threat profile may require particular categories to be `clear`. `not_checked` and `unsupported` fail closed when the policy requires evidence.

### 6.2 Findings minimization

Inspection evidence must not reproduce the sensitive material being protected.

A finding should prefer:

- category;
- severity;
- detector/version;
- bounded reason code;
- object/content digest;
- optional coarse remediation class;
- no raw secret/person identifier unless a separate owner-only diagnostic path is explicitly authorized.

### 6.3 Sanitization separation

Inspection, sanitization, authorization, and transmission are distinct steps.

A sanitizer:

- may remove supported metadata or rewrite a file;
- must produce a new digest;
- must be independently selected/authorized when it performs an effect;
- does not automatically make the artifact anonymous;
- must be followed by reinspection when policy requires it.

The Disclosure Firewall evaluates evidence. It is not itself a universal file-rewriting engine.

## 7. Persona and context isolation

For correlation-resistant or high-anonymity profiles, AXIOM should be capable of requiring stronger isolation than application-level persona names.

Potential requirements include:

- separate profile-scoped credentials/keys;
- no ambient cross-persona cookie/session reuse;
- no stable analytics identifier shared between personas;
- separate context stores;
- minimized shared telemetry;
- explicit network/host isolation requirements where the selected deployment can provide them;
- separate disclosure-review history where a shared history would itself become a correlation surface.

The profile must state what is actually enforced. AXIOM must not claim host or network isolation merely because application records use different persona ids.

## 8. Sovereign-host enforcement boundary

Some privacy/anonymity properties cannot be enforced from the Mesh application alone.

The sovereign-host programme is the appropriate future enforcement layer for:

- verified boot/image provenance;
- host telemetry controls;
- device-identifier exposure policy;
- storage/remnant handling;
- compartment/process/network isolation;
- tamper detection and/or resistance profiles;
- trusted update and recovery media verification;
- policy-bound attachment of removable devices;
- host-side privacy evidence.

Current AXIOM-MESH does not claim these controls are implemented merely because this design names them.

Existing operating systems may satisfy some profiles through reviewed configuration/adapters. The sovereign host is not mandatory when another platform can produce equivalent required evidence.

## 9. Tamper prevention versus detection

Physical tampering must be modeled as a consequence- and context-dependent choice.

The system should distinguish:

- `not_assessed`;
- `detect-only`;
- `resist-and-detect`;
- `continuous-custody-required`.

The profile may choose detection-only where prevention would be unavailable or could create undesirable operational consequences. That policy choice must be explicit; it must not be represented as equivalent to tamper resistance.

Tamper evidence is information. It does not automatically authorize destructive response, credential destruction, remote action, or confrontation.

## 10. Artifact and installer verification

Privacy and sovereignty depend on authentic software/artifacts as well as secrecy.

The deployment/update path should preserve the existing AXIOM direction of binding:

- exact artifact digest;
- signer/trust root;
- source/release identity;
- version/revision;
- verification result;
- currentness/revocation state where applicable.

A hash alone proves integrity relative to that hash, not trusted origin. A signature proves a signer-bound statement, not that the signer or artifact is safe.

Post-quantum migration should remain crypto-agile at protocol boundaries; this addendum does not select or promote a new signature/KEM suite.

## 11. Relationship to Privacy-Preserving Collective Intelligence

The collective-intelligence design remains responsible for:

- bounded contribution contracts;
- unlinkable contribution semantics;
- secure aggregation/joint computation;
- statistical release safety;
- cumulative privacy accounting;
- non-identifying privacy receipts.

This addendum adds two pre/post conditions:

1. participation/release workflows may require a declared `PrivacyThreatProfile`; and
2. any human-readable/file artifact leaving a private context may additionally require `DisclosureFirewall` evidence.

Contribution authority and statistical release safety remain independent. A clean disclosure review cannot override a privacy-budget denial. A valid DP release cannot by itself prove that contributor network participation was anonymous.

## 12. Relationship to normal Mesh authority

These primitives are effect-inert.

- a threat profile is a requirements statement;
- a correlation assessment is risk/evidence;
- a disclosure review is risk/evidence;
- a sanitizer result is evidence about a new object;
- none grants Gateway/Hypervisor/Sandbox/Grid authority;
- none grants network egress;
- none grants file publication;
- none grants persona linkage;
- none grants remote execution;
- none grants deletion/destruction authority.

Any consequential action still requires the existing exact authority path.

## 13. Initial implementation slice

The first executable slice should remain narrow:

1. define `axiom-privacy-threat-profile.v1` as a deterministic effect-inert validator/contract;
2. define `axiom-disclosure-review.v1` as a deterministic effect-inert validator/contract;
3. bind both to canonical semantic digests;
4. reject unknown fields and implicit profile downgrades;
5. require explicit `authority_effect: none`;
6. add adversarial fixtures showing that encryption/pseudonymity cannot be represented as anonymity evidence;
7. add disclosure fixtures where required `not_checked`, `unsupported`, or `finding` states deny a claimed release profile;
8. add source-level tests proving the validators import no filesystem, process, network, crypto-randomness, service, or executor modules;
9. expose no Gateway route, Grid mutation, sanitizer, network call, or production anonymity claim.

This slice can land before any real sanitizer or host enforcement because it only makes the semantics precise and testable.

## 14. Adversarial acceptance cases

At minimum:

1. `baseline-private` cannot be relabeled `high-anonymity` without satisfying additional required evidence;
2. a profile cannot omit accepted residual risks while claiming an unenforceable protection;
3. application persona separation alone cannot satisfy a host-isolation requirement;
4. pseudonymous identifiers cannot be supplied as proof of unlinkability;
5. encrypted transport cannot be supplied as proof of anonymity;
6. a disclosure review cannot say `allow` when a profile-required category is `not_checked`;
7. a disclosure review cannot say `allow` when a profile-required category is `unsupported`;
8. a disclosure review cannot say `allow` with an unresolved `finding`;
9. sanitizer output must have a new object digest before reinspection;
10. disclosure evidence contains no raw secret or enumerated participant identity;
11. correlation review cannot create a reusable universal subject handle;
12. tamper detection cannot be represented as tamper resistance;
13. artifact hash verification cannot be represented as signer/authenticity verification;
14. threat/disclosure evidence cannot mint effect authority.

## 15. Promotion boundaries and non-claims

This addendum does not claim:

- implemented anonymous networking;
- Tor/Qubes/Whonix integration;
- device-level anonymity;
- browser fingerprint resistance;
- implemented metadata sanitization;
- implemented malware scanning;
- implemented stylometric protection;
- measured/trusted boot;
- TPM/TEE-backed attestation;
- evil-maid resistance;
- hardware-identifier suppression;
- production post-quantum cryptography;
- immunity to attribution or correlation;
- that one threat profile is appropriate for every person/context;
- that a disclosure review authorizes release.

Production claims require exact implementation evidence for the selected profile and environment.

## 16. Decision summary

AXIOM should not turn privacy into one global hardening switch.

It should make the requested protection explicit, evidence what layers actually satisfy it, and refuse to overclaim when identity can still leak through another layer.

The resulting composition is:

```text
purpose/context
  -> PrivacyThreatProfile
  -> normal authority/consent
  -> private computation/object handling
  -> correlation-aware evidence
  -> Disclosure Firewall when information leaves the context
  -> statistical release safety where applicable
  -> existing exact effect authority
  -> minimized receipts/non-claims
```

The success criterion is not "maximum anonymity everywhere." It is **consequence-proportional, explicit, verifiable privacy/anonymity semantics without hidden downgrade or false attribution claims**.
