# AXIOM-MESH Release-Bound Install Input Admission

**Applies to:** `0.12.0-dev.3` development line  
**Status:** non-mutating admission verifier implemented; privileged install authorization and host-mutating installer remain unimplemented  
**Updated:** 2026-08-23

AXIOM-MESH now has three separate non-mutating installation-productization checks:

1. a host preflight/install plan that records the selected profile, observed host facts, blockers, and intended install stages;
2. a signed release/install manifest that proves an externally trusted signer approved one immutable release statement and that its control-plane bindings are current;
3. a release-bound install input admission that proves the exact verified release, exact verified host plan, exact digest-bound host facts, and exact locally verified artifact bytes form one internally consistent review input.

The third check closes a composition gap between release verification and any future privileged installer. It does **not** create an installer or authorize one.

## Architectural rule

> **A complete install input admission is evidence that the intended inputs agree. It is not permission to alter a host.**

The current chain is:

```text
host facts
  -> non-mutating host plan

externally trusted release signer
  -> signed install-release manifest
  -> exact current control-plane binding
  -> local artifact-byte verification

host plan + bound host facts + verified release + verified profile-compatible bytes
  -> axiom-install-input-admission.v1
  -> admission digest
  -> privileged install review may be requested
  -> STOP: no privileged install authorization exists yet
```

A future privileged authorization contract may bind an exact `admission_digest`. It must remain a separate object with its own principal, scope, allowed mutation plan, expiry, anti-replay state, and one-use lifecycle. The admission verifier cannot mint that authority itself.

## Contract identity

Implementation:

- `mesh/src/lib/install-input-admission.mjs`

Adversarial verification:

- `mesh/test/install-input-admission.test.mjs`

Schema:

- `axiom-install-input-admission.v1`

Status:

- `release-host-artifact-binding-non-authorizing`

The implementation exposes:

- `buildInstallInputAdmission(...)`;
- `verifyInstallInputAdmission(...)`.

The verifier is deterministic over its lower-layer inputs. It does not read a privileged installer state, create credentials, modify filesystem state, start services, or perform network enrollment.

## Lower-layer verification is re-run

The admission builder does not trust a caller-provided boolean such as `manifest_verified: true` or `host_plan_valid: true`.

It re-runs:

- `verifyInstallReleaseManifest(...)` on the exact signed release package;
- `validateHostInstallPlan(...)` on the exact host plan;
- `verifyInstallReleaseArtifact(...)` on every selected local artifact byte sequence.

This prevents a higher layer from laundering stale or invented summaries into install readiness.

A release signature therefore remains only one input to the admission. The admission also requires current control-plane compatibility, a valid non-mutating plan, exact host-fact binding, and local artifact identity.

## Host-fact binding

The host planner already binds `host_facts_digest` into its plan. The admission builder requires the caller to supply the host facts used for the current review and recomputes that digest.

If the supplied facts differ from the plan—even if the plan itself remains syntactically valid—the admission fails closed.

The v1 admission intentionally reports:

- `host_facts_authenticated: false`;
- `physical_host_attested: false`.

A digest proves that the same declared facts were used by both layers. It does not prove those facts came from a trustworthy sensor, a physically controlled host, TPM/TEE evidence, firmware measurement, or independent observer.

The current non-mutating planner may collect live local observations, but local observation is not remote attestation.

## Release and profile binding

The verified release and host plan must agree on:

- kernel version;
- selected install profile;
- current install-profile status.

The release must explicitly support the plan profile. A personal/local plan cannot consume an infrastructure-only release, and vice versa.

A host plan with blockers or `host_candidate_compatible: false` cannot be converted into an admission object merely because the release is signed and its bytes are intact.

The admission does not promote either install target beyond its current `specified` status.

## Artifact-set selection

The admission selects the exact locally required artifact set for the chosen profile and observed host platform/architecture.

Installable kinds are:

- `source-archive`;
- `oci-image`;
- `axiom-host-image`.

Required release-evidence kinds are:

- `documentation-bundle`;
- `sbom`;
- `provenance`.

For v1, the supplied local byte map must match the selected artifact IDs exactly:

- missing bytes fail closed;
- extra unbound bytes fail closed;
- wrong byte length fails closed;
- wrong SHA-256 fails closed;
- an artifact for the wrong platform or architecture cannot satisfy the compatible installable-artifact requirement.

If the manifest declares more than one compatible artifact as required for the selected profile, v1 requires all of them to be present and verified. It does not silently choose one by preference or transport order.

Raw artifact bytes are not embedded in the admission object. Only their signed identity metadata and verified digest/length bindings are retained.

## Admission contents

A successful admission binds:

### Release identity

- release ID;
- kernel version;
- channel;
- explicit production-promotion boolean;
- exact source revision;
- signed manifest digest;
- signer key ID;
- manifest-policy digest.

### Host identity for this review

- selected install profile;
- exact host-plan digest;
- exact host-facts digest;
- declared facts source;
- platform;
- architecture.

### Local artifact identity

For every selected artifact:

- artifact ID;
- kind;
- platform;
- architecture;
- SHA-256;
- byte length.

The sorted artifact descriptors are themselves bound into `artifact_set_digest`.

The complete admission core is then content-addressed as `admission_digest`.

Changing the release, source revision, signer-bound manifest, host facts, host plan, selected profile, or verified artifact identity changes the admission digest.

## What a successful admission means

A successful admission may establish:

- the signed release manifest verifies under an externally supplied active release signer;
- the release is bound to the current control-plane inputs;
- the non-mutating host plan verifies;
- the supplied host facts exactly match the plan's recorded host-facts digest;
- the plan has no compatibility blockers;
- the release explicitly supports the selected profile;
- all selected artifact bytes exactly match signed length and SHA-256 metadata;
- required documentation, SBOM, and provenance bytes are present and verified;
- at least one compatible installable artifact is present;
- the exact combined input set has one deterministic admission digest.

That is enough to set:

`may_request_privileged_install_review: true`

It is **not** enough to set any privileged-effect flag true.

## Mandatory nonclaims

Every successful v1 admission keeps all of these boundaries explicit:

- `privileged_install_authorized: false`;
- `host_mutation_authorized: false`;
- `installation_authority_granted: false`;
- `mesh_authority_granted: false`;
- `network_authority_granted: false`;
- `node_enrolled: false`;
- `services_started: false`;
- `mutation_performed: false`;
- `artifact_transport_trusted: false`;
- `host_facts_authenticated: false`;
- `physical_host_attested: false`;
- `runtime_safety_established: false`;
- `disposable_host_evidence_verified: false`;
- `reboot_update_restore_evidence_verified: false`;
- `authority_effect: none`;
- `network_effect: none`.

These are not placeholders that a caller may flip after construction. `verifyInstallInputAdmission(...)` recomputes the entire expected object from the lower-layer inputs and requires canonical equality. A stored admission with altered authority, host, release, or artifact claims is rejected.

## Transport boundary

`artifact_transport_trusted: false` is deliberate.

The release manifest may name a signed locator, but the admission contract does not claim that HTTPS, GitHub Releases, a mirror, removable media, an object store, a package repository, or a future peer-assisted transport is intrinsically trusted.

The security claim is local byte identity after retrieval. Transport policy, mirror selection, availability, and download authorization remain separate concerns.

## Relationship to AXIOM Host

An `axiom-host-image` can satisfy the installable-artifact side of an admission when its platform/architecture binding matches the host review.

That still proves only approved image identity plus local byte identity. The admission retains:

- `physical_host_attested: false`;
- `runtime_safety_established: false`.

It does not establish Secure Boot, measured boot, TPM-backed identity, encrypted mutable state, firmware correctness, or remote attestation. Those require their own evidence contracts.

## Threats covered in v1

The current builder/verifier is designed to fail closed against:

- trusting a caller's claimed release-verification result instead of re-verifying the signed package;
- trusting a caller's claimed host-plan validity instead of re-validating the plan;
- host-fact substitution after plan construction;
- release/profile mismatch;
- kernel-version mismatch between plan and release;
- blocked host-plan laundering;
- artifact-byte substitution;
- missing required artifact bytes;
- extra unbound artifact bytes;
- platform/architecture mismatch;
- absence of a compatible installable artifact;
- missing documentation/SBOM/provenance bytes;
- stored admission tampering;
- authority or network-effect laundering through a modified admission object;
- rebinding one admission digest to a different release, plan, host observation, or artifact set.

The tests use synthetic host facts, ephemeral Ed25519 keys, and synthetic artifact bytes. They verify the contract behavior; they do not establish a production release-signing ceremony or supported real-world installer.

## Remaining boundary before host mutation

The next safe layer is **privileged install authorization**, not a root installer that accepts this admission directly.

That future authorization should bind at least:

- exact `admission_digest`;
- requesting operator/principal identity;
- exact allowed mutation-plan digest;
- target host/profile identity appropriate to the chosen trust model;
- issue and expiry timestamps;
- nonce/replay protection;
- explicit one-use semantics;
- revocation/cancellation state;
- allowed effect classes and ceilings;
- rollback/resume expectations;
- proof that installation itself still grants no Mesh/network/application authority.

Only after that contract is independently reviewed should an effect-capable disposable-host installer laboratory be allowed to consume it.

## Current nonclaims

This implementation does **not** provide:

- a production release signer or signing ceremony;
- release-channel resolution or artifact downloading;
- transport authenticity beyond local digest verification;
- authenticated or independently attested host facts;
- physical-host identity;
- privileged install authorization;
- a root/sudo installer;
- user, directory, service-unit, firewall, package, secret, credential, or runtime-state creation;
- service startup;
- node admission or enrollment;
- public ingress or new external egress;
- Secure Boot, measured boot, TPM/TEE attestation, or remote attestation;
- disposable-host installation evidence;
- reboot/update/restore evidence;
- capability-registry promotion;
- production promotion.

The admission is a deterministic review boundary between verified inputs and a future separately authorized effect path. It is not that effect path.