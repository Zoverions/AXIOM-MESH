# AXIOM-MESH Host Installation and Node Profiles

**Applies to:** `0.12.0-dev.3` development line  
**Status:** productization specification; non-mutating host planning and signed release-input verification are implemented; host-mutating fresh-machine installers are not yet implemented  
**Updated:** 2026-08-23

AXIOM-MESH needs a supported path from an ordinary machine to a useful, secure node without turning installation convenience into ambient authority. The existing `npm run setup` path verifies a checked-out source tree under the supported Node.js/npm toolchain. It does **not** install an operating-system toolchain, create a host service, harden a machine, provision a complete product, enroll a node, or configure remote backup custody.

Two additional productization layers are now executable without host mutation:

- a deterministic host preflight/install planner for `personal-local` and `infrastructure-node`; and
- a signed release/install-manifest verifier with separate artifact-byte verification.

Neither layer creates users, directories, services, credentials, network rules, or Mesh authority.

## Installation layers

The project distinguishes six layers. They must not be collapsed into one privileged script.

1. **Source setup — implemented.** A developer or verifier already has the required Node.js/npm toolchain and a checkout. `npm run setup` validates and verifies that source environment.
2. **Host preflight and install planning — implemented, non-mutating.** `npm run host-install:plan -- <profile>` observes or accepts host facts and produces a digest-bound plan with explicit blockers.
3. **Signed release-input verification — implemented, non-mutating.** `axiom-install-release-manifest.v1` binds the exact source revision, control-plane digests, install profiles, toolchain/data compatibility, artifacts, evidence bundle, signer, validity window, and non-claims. Artifact bytes are verified separately.
4. **Personal/local node install — priority target.** A non-developer starts from a supported clean Linux host and receives a local AXIOM node, owner-controlled data and secrets, local human interface, lifecycle metadata, and optional application discovery.
5. **Infrastructure/support node install — priority target.** A headless host receives the independently deployable service-unit topology plus explicit node-role configuration, observability, recovery, and separately authorized network participation.
6. **AXIOM Host / managed deployment profiles — later.** A stronger reference appliance image or owner-selected managed/cloud infrastructure may reproduce the same release, authority, custody, update, and evidence contracts without becoming a separate AXIOM authority.

Installation never grants application, agent, network, governance, data-access, or external-effect authority merely because software was installed.

## Executable host-install planning surface

Machine-readable planning inputs and implementation:

- `mesh/config/install-targets.json` — product-level install targets;
- `mesh/config/host-install-policy.json` — planner and future mutating-installer invariants;
- `mesh/src/lib/host-install-plan.mjs` — deterministic planner;
- `mesh/src/host-install.mjs` — CLI surface.

Current commands:

```bash
npm run host-install:policy
npm run host-install:plan -- personal-local
npm run host-install:plan -- infrastructure-node
```

The planner records Linux platform/architecture, distribution identity/version, init system, package-manager presence, current Node runtime, memory, root-filesystem free space, optional container runtime, and effective user identity. Unsupported facts become blockers rather than best-effort mutation.

Every current plan enforces:

- `target_status: specified`;
- `eligible_for_mutating_install: false`;
- `mutation_performed: false`;
- `live_services_started: false`;
- `credentials_created: false`;
- `authority_effect: none`;
- `network_effect: none`;
- public ingress disabled;
- external egress `deny`;
- Mesh enrollment `not-performed`.

The planner composes the existing production provisioning and service-unit projection primitives **by reference**. It does not reimplement private-key or credential handling in bootstrap shell.

A plan reporting `host_candidate_compatible: true` means only that the observed facts satisfy the planner's current narrow candidate conditions. It is not host certification, support approval, release approval, or production promotion.

## Signed release/install-manifest verification

The next prerequisite before privileged host mutation is now an executable verifier. See [Signed Release Install Manifest](SIGNED-RELEASE-INSTALL-MANIFEST.md).

Machine-readable policy and implementation:

- `mesh/config/install-release-manifest-policy.json`;
- `mesh/src/lib/install-release-manifest.mjs`;
- `mesh/test/install-release-manifest.test.mjs`.

The verifier requires an externally supplied **active Ed25519** signer with role `release-installer-authority`. The package cannot establish trust by embedding its own public key.

A valid manifest binds:

- exact source revision and kernel version;
- release channel and explicit production-promotion state;
- current install-profile statuses;
- Node/npm requirements;
- current Grid migration generation and rollback mode;
- digests of install targets, host-install policy, capability registry, application catalogue, service-network policy, and source-setup policy;
- artifact metadata including SHA-256 and byte length;
- documentation bundle, SBOM, and provenance artifacts;
- explicit non-claims and zero authority/network effect.

Manifest verification returns `artifact_bytes_verified: false`. Actual bytes must pass `verifyInstallReleaseArtifact(...)` before any future bootstrap executes, unpacks, mounts, or boots them.

Even after both signature and bytes verify, the release input still reports:

- `host_mutation_authorized: false`;
- `installation_authority_granted: false`;
- `mesh_authority_granted: false`;
- `network_authority_granted: false`;
- `node_enrolled: false`;
- `services_started: false`.

This is deliberate. Release approval is a prerequisite to installation, not permission to alter a machine.

## Common invariants

Every future host-mutating installer profile must preserve these invariants:

- install an immutable, signed, locally byte-verified release identity rather than a moving branch;
- verify release/control-plane compatibility before privileged mutation;
- keep install-time privilege separate from runtime privilege;
- run AXIOM services under an unprivileged dedicated identity or equivalent isolated workload identity;
- keep data, secrets, runtime sockets, and logs in explicit separately protected locations;
- never place secrets in a repository, image layer, shell history, telemetry event, release manifest, or installation receipt;
- expose no public ingress by default;
- retain deny-by-default external egress unless a separately reviewed adapter/policy authorizes exact destinations;
- never silently enroll the machine in federation, remote execution, storage exchange, consensus, governance, or a Circle;
- keep applications and runtime scaffolds as Gateway clients rather than alternate authority paths;
- stage and verify updates before activation;
- never silently restore stale authority, credential, consent, or revocation state during rollback;
- copy only encrypted/integrity-bound backup artifacts unless a separately reviewed export contract says otherwise;
- produce non-secret receipts for security- or custody-relevant lifecycle actions.

The mandatory privileged-effect authority path remains:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

Host installation is deployment work around that path, not a way around it.

## Profile A — personal/local node

**Priority:** P0 productization target  
**Current status:** target `specified`; host plan implemented; release-input verifier implemented; fresh-host mutating installer not implemented

This is the default experience for a person running AXIOM on a personally controlled machine.

### Intended outcome

A future supported clean-Linux bootstrap should reach a local ready state without requiring the operator to understand the internal four-service architecture.

The resulting system should provide:

- one exact verified AXIOM-MESH release;
- Gateway, Hypervisor, Sandbox, and Grid under the current isolation model;
- owner-local encrypted data and separate owner-controlled secrets;
- AXIOM One only under its exact current release/preview status;
- local status, repair, recovery, and receipt surfaces;
- optional application discovery, including independently released Axiom Education;
- owner-selected update policy;
- safe backup enrollment choices;
- decommission guidance that separates runtime removal from data/key destruction.

## Profile B — infrastructure/support node

**Priority:** P0/P1 network-support target  
**Current status:** target `specified`; host plan implemented; release-input verifier implemented; general public infrastructure-node installer and automatic network enrollment not implemented

This profile is for a headless server, home server, lab machine, community-operated host, or later cloud VM supporting AXIOM infrastructure.

The future installer may deploy independently restartable Gateway/Grid/Hypervisor/Sandbox units, but role selection is configuration intent—not network authority.

Current truth boundaries remain:

- admitted-node registration is a local authority mechanism;
- storage offers do not imply a complete object-transfer network;
- scheduling foundations do not imply general remote execution;
- operator-approved causal exchange is not BFT consensus or automatic federation;
- community-testnet participation contributes evidence rather than production-network authority.

The infrastructure profile therefore starts with **no public service exposure and no automatic network enrollment**. Later network roles require explicit node admission, signed configuration, policy, health/currentness, revocation, and protocol-specific evidence.

A supported infrastructure installer must eventually cover headless restart, per-unit credentials, Grid-only durable state, least-privilege secret projection, resource/disk safeguards, telemetry/readiness, backup/restore, key rotation, external continuity-anchor custody, node quarantine/revocation, update/rollback, decommission, and community reproduction evidence.

## Fresh-host sequence

A supported installer should execute these stages explicitly:

1. **Preflight** — identify host facts and conflicting AXIOM state.
2. **Release selection** — resolve an owner-chosen channel or release ID to one immutable package; a moving branch is never the installed identity.
3. **Manifest verification** — verify external signer trust, validity window, exact current control-plane digests, install-profile status, toolchain/data compatibility, and required documentation/SBOM/provenance artifacts.
4. **Artifact verification** — locally hash every artifact to be executed, unpacked, mounted, booted, or relied on as release evidence.
5. **Toolchain/bootstrap acquisition** — install only reviewed, pinned host/runtime dependencies. No unpinned `curl | sh`, ambient package-script execution, or registry-name substitution.
6. **Host boundary creation** — create runtime identity, protected directories, service definitions, resource limits, log policy, and default-deny network boundary.
7. **AXIOM provisioning** — invoke existing production credential/state provisioning without printing private values.
8. **Service deployment** — deploy the supported single-host or service-unit topology for the selected profile.
9. **Readiness proof** — run release/network/readiness checks against the exact installed release and record an installation receipt.
10. **Human/operator handoff** — show local endpoints, recovery guidance, update channel, backup state, and truthful application availability.
11. **Optional integrations/network admission** — independently verify application compatibility, runtime adapters, backup providers, or node admission before enabling them.

A failure must leave the host unchanged or in an explicit resumable/rollback state. Partial secret sets and partially activated service topologies fail closed.

## Release channels and synchronization

Fresh installation becomes sustainable only when a release is a synchronization anchor for code, documentation, applications, installers, migration rules, and downstream compatibility.

The signed manifest contract now binds the core release identity and current control-plane digests. A future published release bundle should contain:

```text
signed install-release manifest
+ locally verifiable runtime/source/host artifacts
+ install profiles
+ migration/update rules
+ current documentation bundle
+ SBOM
+ provenance
+ application compatibility metadata
```

The same bundle should support fresh installation, update, recovery rebuild, community-testnet reproduction, and independent verification.

A host installer may not infer compatibility from a semantic version string alone.

## AXIOM Host reference environment

Retained H0/H1 research explored a stronger image-built **AXIOM Host** beneath the portable Mesh: UEFI-oriented boot, an immutable/read-only dm-verity root, separate durable state, artifact inventories, secret scans, image diagnostics, and disposable appliance verification.

That work is useful provenance, but the old branch is hundreds of commits behind current `main` and must not be merged wholesale. The nominal H2 update/rollback branch never advanced beyond the H0/H1 head.

The current manifest reserves `axiom-host-image` as an installable artifact kind so the useful appliance work can be reconstructed safely on current code.

An `axiom-host-image` signature and digest establish approved image identity only. They do **not** establish Secure Boot, measured boot, TPM attestation, encrypted mutable state, correct firmware, or workload correctness. Those require independent evidence.

Accordingly AXIOM may support two complementary paths:

- **General Linux install:** transform a supported existing Linux host into a bounded AXIOM node.
- **AXIOM Host:** install/boot the stronger reproducible reference appliance for deployments that need additional host assurance.

AXIOM-MESH remains the portable authority/evidence substrate in either case.

## Applications are selectable surfaces, not embedded authority

Axiom Education remains independently releasable at `Zoverions/Axiom-Education`. A personal-node installer may eventually offer it after verifying the Education release and exact Mesh compatibility profile.

Installing or listing Education must not grant learner-record access, provider activation, curriculum authority, network access, school/institution authority, or delegated guardian/educator authority.

The same pattern applies to AXIOM One, Circles, Verify, Studio, Managed Node tooling, and external agent/runtime scaffolds: discoverable and composable, independently versioned, and authority-bounded.

## Backup and external services

Applications should use the Mesh encrypted backup/export substrate rather than each inventing a different cloud trust model.

Preferred backup direction:

```text
Grid/application state
  -> signed/encrypted backup envelope
  -> local verification
  -> provider-neutral adapter
  -> owner-selected remote store
```

Remote providers may retain ciphertext and bounded metadata; they do not need Grid plaintext, data-protection keys, service private keys, operator tokens, or general Gateway authority.

A successful remote upload is not a restore test. Restore remains local-authority work and must verify the exact encrypted artifact before applying it.

External agent runtimes, model providers, productivity services, storage systems, and future connectors likewise integrate through versioned bounded adapters/capsules with exact provenance, least-privilege scopes, destination/purpose/budget ceilings, credential references, health/compatibility checks, cancellation/revocation, and evidence semantics. Installation or authentication never becomes permission to act.

## Update, rollback, and decommission

A secure install includes its full lifecycle.

### Update

A future updater must resolve a channel to an immutable signed manifest, verify all control-plane and artifact bindings, determine migration/rollback rules before stopping the current node, take a verified backup where required, stage the new runtime, apply only explicit migrations, prove readiness, retain a bounded rollback generation where safe, and record the exact transition.

### Rollback

Rollback fails closed when a previous runtime cannot safely interpret current data/authority state. A verified pre-migration backup may be restored only as an explicit recovery point. Newer revocation, consent, credential, or authority events must never disappear silently.

### Decommission

Decommission distinguishes stopping services, removing runtime packages, revoking/quarantining node identity, retaining/exporting encrypted backups, destroying local data, destroying secrets/keys, removing application data, and deleting remote backup objects. Destructive steps require separate explicit confirmation.

## Promotion gates for the first real Linux installer

A supported fresh-Linux installer is not complete until clean disposable-host evidence demonstrates all of the following:

1. installation starts without a pre-existing AXIOM checkout or trusted local Node environment;
2. an externally trusted signed release manifest is verified before mutation;
3. every executed/unpacked/mounted/booted artifact is locally byte-verified;
4. unsupported OS/architecture/toolchain and altered artifacts are rejected before activation;
5. only documented users, directories, services, network rules, and secrets are created;
6. unrelated local users cannot read secrets and logs/receipts contain no secret material;
7. authenticated readiness proves the exact installed release;
8. reboot recovery does not widen network exposure;
9. an in-channel update succeeds and proves the new exact release;
10. tampered, stale, revoked-signer, and incompatible updates are rejected;
11. restore succeeds on a second clean host from a verified backup;
12. rollback succeeds where compatible or explicitly requires restore where it is unsafe;
13. uninstall removes runtime components without silently deleting owner data or keys;
14. protected disposable-host CI reproduces the profile;
15. installation, recovery, threat-model, release-compatibility, and non-claim documentation ships at the same revision;
16. repository code continues to pass Windows and both macOS compatibility lanes even while the first host installer is Linux-only;
17. at least one independent community reproduction is collected before broad support is claimed.

Until those gates are met, AXIOM-MESH has an implemented clean-checkout **source setup**, implemented **non-mutating install planning**, and implemented **signed release-input/artifact verification**—not a completed fresh-machine Linux installer.
