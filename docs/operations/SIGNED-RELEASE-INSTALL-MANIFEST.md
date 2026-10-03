# AXIOM-MESH Signed Release Install Manifest

**Applies to:** `0.12.0-dev.3` development line  
**Status:** verifier implemented in this candidate stack; release-signer custody, published install manifests, Node-free bootstrap download, and host-mutating installation remain unimplemented  
**Tracking:** #1901  
**Authority:** none; a valid manifest cannot authorize host mutation, Mesh authority, network authority, node admission, or service start.

## Purpose and boundary

A future fresh-host installer must never turn a moving branch, mutable image tag, unsigned archive, or package name into privileged host mutation.

This contract answers one narrow question:

> **Which exact release statement was signed by an externally trusted release-install authority and still matches the current installation control plane?**

It deliberately does **not** answer:

> **May this host now be changed?**

The intended chain is:

```text
operator selects release/channel
        |
        v
signed install-release manifest
        |
        v
external signer trust + signature + currentness
        |
        v
exact current control-plane binding
        |
        v
local artifact-byte verification
        |
        v
separate compatible host plan
        |
        v
future explicit privileged install session
        |
        v
existing provisioning / service-unit primitives
        |
        v
readiness + lifecycle evidence
```

Every arrow is a separate claim.

## Contract identity

Machine-readable policy:

- `mesh/config/install-release-manifest-policy.json`

Verifier:

- `mesh/src/lib/install-release-manifest.mjs`

Adversarial tests:

- `mesh/test/install-release-manifest.test.mjs`

Contract identifiers:

- `axiom-install-release-manifest-policy.v1`
- `axiom-install-release-manifest.v1`
- `axiom-install-release-manifest-package.v1`

The package contains only a manifest and detached signature record. It cannot carry a public key beside itself and make that key trusted.

## External trust bootstrap

The verifier requires an externally supplied trusted-signer inventory.

Each signer binds:

- exact key ID;
- Ed25519 public key, as a single canonical SPKI `BEGIN PUBLIC KEY` PEM block that re-exports to the identical PEM (line endings normalized; extra key data is rejected) (private-key encodings, DER, JWK, and multi-block input are rejected before key conversion, so release private-key material is never accepted as trusted-signer input);
- explicit roles;
- state: `active | retired | revoked`.

The signing key must be active and carry the exact role:

`release-installer-authority`

No production release private key is committed by this work. Key generation, custody, ceremony, rotation, revocation publication, HSM/threshold policy, or production signing are separate operations gates.

A valid signature proves only that a trusted signer approved the exact statement. It is not install authority.

## Signed manifest contents

The signed statement binds:

- release ID;
- kernel version;
- channel: `development | candidate | stable`;
- explicit `production_promoted` field, pinned to `false` in v1;
- exact source revision;
- issuance and expiry;
- signing-key ID;
- exact current install-profile IDs/status;
- current source/runtime toolchain;
- current migration generation and rollback mode;
- current installation-control-plane digests;
- exact release artifacts and profile relationships;
- required non-claims;
- hard-zero install/host/network authority fields.

A channel name never implies production promotion. In v1, even a trusted release signer cannot assert production promotion through this manifest; `production_promoted` must remain `false` until a separately reviewed promotion contract changes that boundary.

The maximum signed validity interval is 31 days. This is a freshness ceiling for the signed statement, not a safety warranty for its contents or dependencies.

## Exact control-plane binding

The verifier binds the manifest to canonical SHA-256 digests of:

- `mesh/config/install-targets.json`;
- `mesh/config/host-install-policy.json`;
- `mesh/config/capabilities.json`;
- `mesh/config/application-catalog.json`;
- `mesh/config/service-network-policy.json`;
- `mesh/config/setup.json`.

This means a valid old signature cannot silently survive:

- a changed host-install policy;
- a changed install-target status;
- a capability-registry change;
- an application-catalogue change;
- a service-network-policy change; or
- a source/runtime setup-policy change.

A changed control plane requires a newly matching signed statement.

## Install-profile binding

The v1 policy recognizes:

- `personal-local`;
- `infrastructure-node`.

Every named profile status must exactly match the current install-target registry. A release signer cannot promote `specified` to `implemented`.

Each bound profile requires at least one installable artifact explicitly associated with that profile.

A signed manifest does not make either profile a supported installer.

## Artifact inventory

Allowed artifact kinds:

- `source-archive`;
- `oci-image`;
- `axiom-host-image`;
- `documentation-bundle`;
- `sbom`;
- `provenance`.

Every manifest must include documentation, SBOM, and provenance evidence plus an installable artifact for each named profile.

Artifact locators are metadata. They do not make a transport trusted.

## Artifact bytes are a separate proof

Manifest verification returns:

`artifact_bytes_verified: false`

Actual local bytes must separately pass `verifyInstallReleaseArtifact(...)`, which checks exact byte length and SHA-256. It has two forms.

**Bound form (the only form an install gate may use):** `verifyInstallReleaseArtifact(verifiedResult, artifact_id, bytes)`.

- `verifiedResult` must be the exact object returned by `verifyInstallReleaseManifest`. It is checked fail-closed: a Proxy is rejected before anything else touches it; it must be a frozen plain record holding exactly the verified-result keys as own enumerable data properties (no accessors, symbol keys, or extra or missing keys); `valid`, `signature_verified`, `control_plane_bound`, and `artifact_metadata_bound` must all be `true`; and it must be registered in a module-private `WeakMap` that only `verifyInstallReleaseManifest` writes. A spread, `structuredClone`, or other structural copy of a genuine result is therefore rejected, as is any lookalike.
- Artifact metadata comes only from a frozen snapshot of the signed manifest's `artifacts`, taken (with the shared plain-data snapshot helper) right after signature verification and bound to that result in the same `WeakMap`. The caller never supplies metadata, and later changes to the original package or manifest object cannot change the outcome. The verified result's existing fields and their meaning are unchanged; no field is added to it.
- `artifact_id` must name exactly one artifact in that snapshot. An invalid, unknown, or duplicated id is a `ValidationError`. The bound form accepts no options.
- On success it returns the artifact identity (`artifact_id`, `artifact_kind`, `sha256`, `byte_length`), `artifact_bytes_verified: true`, `manifest_bound: true`, the verified `manifest_digest`, `release_id`, and `signer_key_id`, plus `host_mutation_authorized: false` and `authority_effect: 'none'`.

A consumer that gates on artifact bytes must require `manifest_bound: true`; `valid` or `artifact_bytes_verified` alone is not sufficient. A result from a different manifest or release names that other manifest, and an id that manifest did not sign is unknown to it.

**Trust root.** `manifest_bound: true` proves only that the bytes match the manifest that produced `verifiedResult`. That manifest was verified against the `trustedSigners` its caller supplied, and the binding does not record that trust root. A caller can register its own key under the real `key_id` and obtain `manifest_bound: true` with the genuine `release_id` and `signer_key_id`, so those two fields are labels: comparing them does not strengthen a gate. Only one of these binds the trust root:

- compare `manifest_digest` with an independently trusted expected digest (one that does not come from the package or its caller-supplied signer set); or
- call `verifyInstallReleaseManifest` itself with a signer set the gate pins (not from session input or caller code) and pass that exact result object to the bound form.

A gate must never accept a verified result produced by other code. The install-session constructor (`docs/operations/INSTALL-SESSION-V0.md`) uses the first option because main has no repository-pinned release signer set (signer custody is external). Recording the trust root in the binding output is a separate follow-up.

**Unbound form:** `verifyInstallReleaseArtifact(artifact, bytes, options)` checks bytes against a caller-supplied metadata record. It is not manifest-backed provenance: its result always carries `manifest_bound: false` and it must never be used as an install gate. `options` may contain only `policy`, as an own enumerable data property; arrays, Proxies, accessors, and inherited, symbol, or unknown fields are rejected without running caller code.

Both forms accept only a non-Proxy `Uint8Array`/`Buffer`, hash a private copy of its bytes, and require the exact signed byte length and SHA-256. Only the byte content is read; other properties on the byte container are ignored.

The verifier's source boundary test forbids ambient and dynamic code in this module and the modules it imports: `process`, `globalThis`, dynamic `import()`, `require(`, the `Function` constructor, `eval`, and reaching a constructor through a member access (`.constructor`, `['constructor']`).

A valid signature therefore cannot hide:

- truncated bytes;
- substituted bytes;
- stale/mirror corruption; or
- a different local artifact under the same name.

Digest equality establishes byte identity only. It does not prove the software is correct, vulnerability-free, safe to execute, or suitable for a particular host.

## Toolchain binding

The verifier consumes the current source-setup policy rather than maintaining a second version table.

For the current tree this includes:

- engine: `>=22.23.2 <23 || >=24.14.0 <25`;
- protected CI: Node `24.18.0`;
- separately approved hosted-production/security runtime: Node `22.23.2`;
- candidate container runtime: Node `24.21.0`;
- primary npm: `>=11.0.0 <12`;
- Node 22 compatibility npm: `>=10.9.8 <11`.

These values are checked against the current machine-readable setup policy. Documentation is not the authority for their bytes.

The non-mutating host planner and this verifier remain separate. The planner's target-host fact contract permits Node absence for an OCI path, but the current repository planner/verifier commands themselves run under Node and are **not** the future Node-free bootstrapper.

## Data compatibility

The manifest binds:

- exact current migration generation;
- minimum compatible kernel;
- one rollback mode:
  - `in-place-compatible`;
  - `backup-restore-required`;
  - `migration-specific`.

The verifier does not infer rollback safety from version ordering.

A future updater must still prove the selected rollback/restore path against real state.

## AXIOM Host non-claim

The artifact class `axiom-host-image` is retained so stronger appliance/image work can later compose with this release boundary.

Its presence does **not** prove:

- Secure Boot;
- measured boot;
- TPM/TEE attestation;
- encrypted mutable state;
- firmware correctness; or
- remote attestation.

The required non-claim is:

`axiom-host-image-does-not-prove-secure-or-measured-boot`

## Relationship to the host planner

The host planner answers:

- does supplied host evidence fit the current bounded Linux planning profile?;
- what exact blockers exist?;
- what later prerequisites exist?;
- which existing topology/provisioning primitives would be composed?

The release verifier answers:

- is this exact release statement current, externally trusted, signed, and bound to the current control plane?

Neither substitutes for the other.

A compatible host is not an approved release. An approved release is not a compatible host. Neither authorizes mutation.

## Threats covered

The v1 verifier fails closed against:

1. package self-trust;
2. unknown/wrong-role/retired/revoked signers;
3. non-Ed25519 signer substitution;
4. signed-body mutation;
5. stale control-plane digests;
6. signed profile-status or production-promotion laundering;
7. future/expired/overlong manifests;
8. missing documentation/SBOM/provenance;
9. a profile without an installable artifact;
10. stale Node/npm toolchain assumptions;
11. stale migration generation;
12. duplicate/invalid artifact metadata;
13. local artifact length/digest mismatch;
14. signed attempts to create install/Mesh/network authority;
15. omitted required non-claims;
16. proxy/accessor/hidden/symbol/custom-array input smuggling.

## Current non-claims

Every verifier result pins `host_mutation_authorized: false`.

This work does **not** provide or claim:

- a published signed install release;
- production release-signing custody;
- an HSM, threshold signer, or signing ceremony;
- automatic channel resolution;
- artifact download or mirror selection;
- transport authenticity beyond later local byte verification;
- a Node-free bootstrapper;
- host user/directory/service/firewall mutation;
- credential creation;
- service startup;
- node admission or network enrollment;
- a deployed AXIOM-MESH node;
- Windows installation support;
- production AXIOM One packaging;
- Secure/Measured Boot evidence;
- production promotion.

## Next gate

Before any privileged installer can consume this verifier as a live mutation prerequisite, #1901 requires:

1. exact-head protected verification;
2. merge/reconciliation of the non-mutating planner + verifier;
3. reconciliation against the current isolated first-node installer proof;
4. explicit install-session/resume/rollback state design;
5. disposable clean-host evidence.

The first privileged installer must then consume **all** of:

- externally trusted current signed manifest;
- locally verified artifact bytes;
- compatible exact host plan;
- explicit operator invocation;
- documented resumable/rollback state.

No earlier artifact grants permission to cross that boundary.
