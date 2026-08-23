# AXIOM-MESH Signed Release Install Manifest

**Applies to:** `0.12.0-dev.3` development line  
**Status:** verifier implemented; release-signer custody, published release manifests, bootstrap download, and host-mutating installation remain unimplemented deployment work  
**Updated:** 2026-08-23

The fresh-host installer must never resolve a moving branch, an unsigned archive, or an application version string into privileged host mutation. Before a future installer can create users, directories, services, firewall rules, credentials, or runtime state, it needs one immutable release statement whose signer, source revision, artifacts, compatibility rules, and control-plane contracts are independently verifiable.

The current repository now implements that **verification contract**. It does not publish a production release-signing key and does not authorize host mutation.

## Architectural rule

The load-bearing rule is:

> **A valid release signature identifies an approved release input. It does not authorize installation, grant Mesh authority, enroll a node, start a service, or prove that a runtime is safe.**

The intended future chain is:

```text
owner/operator chooses a release/channel
        -> immutable signed install-release manifest
        -> externally trusted release signer verification
        -> exact control-plane compatibility verification
        -> local artifact-byte digest verification
        -> host preflight + deterministic install plan
        -> separately authorized privileged installer
        -> existing production provisioning/service-unit primitives
        -> readiness + reboot/update/restore evidence
```

Every arrow is a separate claim. Passing an earlier stage does not imply that a later stage occurred.

The current implementation reaches the release-manifest and artifact-verification layers only. `host_mutation_authorized: false` remains true of the verification result.

## Contract identity

Machine-readable policy:

- `mesh/config/install-release-manifest-policy.json`

Implementation:

- `mesh/src/lib/install-release-manifest.mjs`

Adversarial verification:

- `mesh/test/install-release-manifest.test.mjs`

Schemas are identified in code as:

- package: `axiom-install-release-manifest-package.v1`;
- signed manifest: `axiom-install-release-manifest.v1`;
- verifier policy: `axiom-install-release-manifest-policy.v1`.

The package contains exactly a `manifest` and a detached signature record. It cannot include a public key and make that key trusted merely by carrying it beside the signature.

## Trust bootstrap

Release trust is deliberately external to the signed package.

The verifier requires an externally supplied trusted-signer inventory. Each trusted signer binds:

- an exact key ID;
- an Ed25519 public key;
- one or more explicit roles;
- current signer state: `active`, `retired`, or `revoked`.

For v1, a signer must be `active` and carry the exact role:

`release-installer-authority`

A retired or revoked key fails closed. A valid Ed25519 signature from a key that lacks the release-installer role also fails closed. The package cannot self-supply its own trust root.

No private release-signing key is committed to this repository. Implementing release-key generation, offline custody, rotation, revocation publication, threshold policy, or hardware-backed signing is separate release-operations work and must not be inferred from the verifier.

## Signed manifest contents

The signed statement binds at least:

- release ID;
- kernel semantic version;
- release channel: `development`, `candidate`, or `stable`;
- explicit `production_promoted` boolean rather than inferring promotion from the channel name;
- exact 40-hex source revision;
- issue and expiry timestamps;
- signing-key ID;
- the install profiles this release supports and their current target statuses;
- current Node/npm toolchain requirements;
- current migration generation and rollback mode;
- digests of the current installation, capability, application, service-network, and source-setup control planes;
- all release artifacts, their kinds, platform/architecture bindings, media types, locators, SHA-256 digests, byte lengths, and install-profile relationships;
- explicit non-claims;
- zero authority/network effect and no install authorization.

The verifier uses an evaluator-controlled time and rejects future-issued, expired, or overlong manifests. The v1 maximum signed validity window is 31 days. This is a freshness ceiling for the release statement, not a promise that every dependency or external fact remains safe for 31 days.

## Control-plane binding

A signed release must agree with the exact control-plane state against which installation is being evaluated.

The manifest currently binds SHA-256 canonical-object digests for:

- `mesh/config/install-targets.json`;
- `mesh/config/host-install-policy.json`;
- `mesh/config/capabilities.json`;
- `mesh/config/application-catalog.json`;
- `mesh/config/service-network-policy.json`;
- `mesh/config/setup.json`.

It also requires the kernel version reported by the install targets, host-install policy, capability registry, and source-setup policy to match the manifest kernel version.

This prevents a correctly signed manifest from silently being reused with a different install target, a widened network policy, a changed capability registry, a changed application catalogue, or a different source/toolchain policy.

A release-manifest signature therefore covers more than artifact filenames. It binds the release to the authority and deployment assumptions under which the artifacts are meant to be installed.

## Install-profile binding

The v1 policy recognizes two productization targets:

- `personal-local`;
- `infrastructure-node`.

A manifest may support one or both, but every profile status in the signed statement must exactly match the current install-target registry. A release signer cannot promote `specified` to `implemented` inside a manifest.

Each bound profile must have at least one installable artifact whose signed metadata explicitly names that profile. Merely including documentation or an SBOM is not enough to make a profile installable.

The current profile registry still describes both fresh-host targets as `specified`. A cryptographically valid manifest does not change that status.

## Artifact inventory

Allowed v1 artifact kinds are:

- `source-archive`;
- `oci-image`;
- `axiom-host-image`;
- `documentation-bundle`;
- `sbom`;
- `provenance`.

At least one installable artifact (`source-archive`, `oci-image`, or `axiom-host-image`) must cover every install profile named by the manifest.

Every release must also carry signed metadata for all three evidence artifact classes:

- documentation bundle;
- SBOM;
- provenance.

This makes documentation and release evidence part of the release identity instead of optional material published later.

An artifact locator is signed metadata, not a trusted transport. HTTPS, GitHub Release assets, object storage, mirrors, removable media, package repositories, or later peer-assisted distribution may transport bytes, but transport origin does not replace digest verification.

## Artifact verification

Manifest verification and artifact-byte verification are separate APIs on purpose.

`verifyInstallReleaseManifest(...)` proves that the release statement is structurally valid, current, externally trusted, and bound to the current control-plane inputs. Its result explicitly reports:

`artifact_bytes_verified: false`

`verifyInstallReleaseArtifact(...)` accepts one signed artifact descriptor and the actual local bytes. It recomputes both exact byte length and SHA-256. A mismatch fails closed.

A future bootstrap/installer must locally verify every artifact it will execute, unpack, mount, boot, or use as release evidence. It must not assume that a valid manifest proves downloaded bytes are intact.

Artifact digest verification establishes byte identity. It does **not** establish that the software is bug-free, non-malicious, policy-correct, compatible with undocumented hardware, or safe to execute with privilege.

## Toolchain and data compatibility

The signed manifest binds the current source-setup contract rather than inventing another version policy.

For this development line that includes:

- Node engine `>=24.14.0 <25`;
- protected-CI Node pin `24.18.0`;
- candidate production-image Node pin `24.19.0`;
- npm minimum `11.0.0`;
- npm major version `<12`.

The data-compatibility record binds the exact current migration generation plus one declared rollback mode:

- `in-place-compatible`;
- `backup-restore-required`;
- `migration-specific`.

The verifier does not infer rollback safety from semantic version ordering. The future updater must still prove that the old runtime can interpret current state or explicitly require a verified backup/restore path.

## AXIOM Host boundary

The `axiom-host-image` artifact kind reconnects the current productization path to the retained AXIOM Host operating-environment research without importing that historical branch wholesale.

The earlier H0/H1 laboratory explored an image-built Linux appliance with UEFI-oriented boot, a read-only dm-verity root, separate durable state, artifact inventories, secret scanning, image diagnostics, and disposable-image checks. That work remains valuable design and test provenance, but it was laboratory-only and was built hundreds of commits before current `main`.

The current release-manifest contract therefore carries the explicit non-claim:

`axiom-host-image-does-not-prove-secure-or-measured-boot`

Signing an `axiom-host-image` artifact establishes release approval and, after local byte verification, exact image identity. It does not establish Secure Boot, measured boot, TPM attestation, encrypted mutable state, correct firmware configuration, or remote attestation. Those properties require their own evidence and verifier contracts.

This keeps two installation paths possible:

1. **General Linux install:** transform a supported existing Linux host into an AXIOM personal or infrastructure node using a verified release bundle.
2. **AXIOM Host:** boot/install a stronger reference appliance image with additional reproducible host guarantees when those guarantees are independently implemented and evidenced.

Neither host path becomes a new Mesh authority system.

## Relationship to the non-mutating host planner

The host planner introduced before this verifier remains a separate stage.

The planner can answer questions such as:

- is this Linux architecture inside the current candidate planning boundary?;
- what profile is requested?;
- what data/secret/run directories are intended?;
- which existing provisioning and service-unit primitives would later be composed?;
- which blockers prevent proceeding?

The signed release manifest answers a different question:

- **which exact release inputs and compatibility contracts are approved by an externally trusted release signer?**

A future installer needs both. A compatible host is not an approved release, and an approved release is not proof that a host is compatible.

## Threats covered

The v1 verifier is designed to fail closed against:

- package self-trust by embedding a public key;
- signatures from unknown, wrong-role, retired, or revoked release keys;
- signature substitution or signed-body modification;
- stale install-target, host-policy, capability, application-catalogue, service-network, or source-setup bindings;
- release-manifest attempts to promote an install profile beyond the current registry;
- future-issued, expired, or excessively long-lived release statements;
- missing documentation, SBOM, or provenance artifacts;
- install profiles that lack a bound installable artifact;
- stale Node/npm or migration-generation assumptions;
- duplicate artifact identity;
- unsupported artifact platform/architecture declarations;
- artifact byte-length or SHA-256 mismatch;
- signed attempts to grant install/Mesh/network authority or host mutation;
- omission of required AXIOM Host and installer non-claims.

The tests use ephemeral Ed25519 keys and synthetic artifact bytes. They prove verifier behavior, not the existence of a production release-signing ceremony.

## Current non-claims

The current implementation does **not** claim:

- a published signed `0.12.0-dev.3` install release;
- a production release-signing key, key ceremony, HSM, threshold signer, offline signer, or revocation service;
- trusted release-signing custody by GitHub Actions;
- automatic release-channel resolution;
- artifact download, mirror selection, or transport authenticity beyond later local digest checking;
- a Node-free fresh-host bootstrap;
- creation of Linux users, directories, service units, firewall rules, secrets, credentials, or runtime state;
- host mutation authorization merely because a manifest verifies;
- automatic node admission, federation, causal exchange, scheduling participation, or public ingress;
- Secure Boot, measured boot, TPM-backed identity, remote attestation, or encrypted mutable state for AXIOM Host;
- production promotion from `development`, `candidate`, or `stable` naming alone;
- proof that signed release software is correct, safe, vulnerability-free, or suitable for every host.

The verifier closes the **release-input authenticity and compatibility** gap. It intentionally leaves the next privileged boundary closed.

## Next implementation boundary

After this verifier is accepted, the next productization slice should selectively reconstruct the useful H0/H1 AXIOM Host image/artifact checks against current `main`, while keeping them optional to ordinary Linux installation.

The first privileged installer should then consume only:

1. an externally trusted and current manifest;
2. locally verified artifact bytes;
3. a compatible non-mutating host plan;
4. an explicit operator invocation;
5. a documented rollback/resume state machine.

Only after disposable-host install, reboot, update, tamper rejection, second-host restore, uninstall/decommission, and independent reproduction evidence exists should the project promote a fresh-machine installer beyond its current `specified` status.
