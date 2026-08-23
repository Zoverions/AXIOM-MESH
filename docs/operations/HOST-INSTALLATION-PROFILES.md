# AXIOM-MESH Host Installation and Node Profiles

**Applies to:** `0.12.0-dev.3` development line  
**Status:** productization specification; non-mutating host planning is implemented; host-mutating fresh-machine installers are not yet implemented  
**Updated:** 2026-08-23

AXIOM-MESH needs a supported path from an ordinary machine to a useful, secure node. The existing `npm run setup` path is intentionally narrower: it verifies a checked-out source tree, installs from the committed dependency-free locks, and runs repository checks. It does **not** install the operating-system toolchain, create a host service, harden a machine, provision a complete local product, enroll a node in a network role, or configure remote backup custody.

The repository now also contains a deterministic **non-mutating host-install planner**. It observes or accepts explicit host facts, validates the `personal-local` or `infrastructure-node` target, and emits a digest-bound plan that describes the intended directories, topology, existing provisioning primitives, network defaults, blockers, and installation stages. The planner does not mutate the host and is not a substitute for the missing clean-machine installer.

This document defines the productization boundary without weakening the source-setup trust model or turning planning evidence into installation authority.

## Installation layers

The project distinguishes four layers. They must not be collapsed into one privileged script.

1. **Source setup — implemented.** A developer or verifier already has the required Node.js/npm toolchain and a checkout. `npm run setup` validates and verifies that source environment.
2. **Host preflight and install planning — implemented, non-mutating.** With the current Node.js runtime available, `npm run host-install:plan -- <profile>` records local host observations and emits a deterministic plan. It does not install the toolchain, create users/directories/services, provision credentials, alter networking, start AXIOM, or verify a release bundle.
3. **Personal/local node install — priority target.** A non-developer starts from a supported clean Linux host and receives a local AXIOM node, owner-controlled data and secrets, a local human interface, update/rollback metadata, and backup enrollment choices.
4. **Infrastructure/support node install — priority target.** An operator starts from a supported clean headless host and receives the independently deployable service-unit topology plus explicit node-role configuration, observability, recovery, and network participation controls.
5. **Managed/cloud deployment profiles — later adapters.** Hosting providers or owner-selected cloud infrastructure reproduce the same signed release, authority, custody, update, and evidence contracts. They do not become a separate AXIOM authority.

Installation never grants application, agent, network, governance, data-access, or external-effect authority merely because software was installed.

## Executable host-install planning surface

The current planning surface is intentionally useful before it is privileged.

Machine-readable inputs and implementation:

- `mesh/config/install-targets.json` remains the product-level target registry;
- `mesh/config/host-install-policy.json` defines planner and future mutating-installer invariants;
- `mesh/src/lib/host-install-plan.mjs` validates the policy and emits digest-bound plans;
- `mesh/src/host-install.mjs` provides the command-line entry point.

Current commands:

```bash
npm run host-install:policy
npm run host-install:plan -- personal-local
npm run host-install:plan -- infrastructure-node
```

The planner observes Linux platform/architecture, distribution identity/version, init system, package-manager presence, current Node runtime, memory, root-filesystem free space, optional container runtime, and effective user identity. Tests may supply explicit facts rather than observing the host.

The output binds the host facts, install target registry, install policy, and selected profile by SHA-256 digests. It records blockers for unsupported platform/architecture/init/toolchain observations rather than silently compensating for them.

Every current plan reports, and validation enforces:

- `target_status: specified`;
- `eligible_for_mutating_install: false`;
- `mutation_performed: false`;
- `live_services_started: false`;
- `credentials_created: false`;
- `authority_effect: none`;
- `network_effect: none`;
- public ingress disabled;
- external egress `deny`;
- Mesh enrollment `not-performed`;
- signed release manifest verification `false`.

The planner composes the existing `provision-production` and service-unit projection primitives **by reference**. It does not reimplement their credential or private-key handling in a host bootstrap script.

This planner currently runs under the supported Node.js toolchain. Therefore it is **not** the bootstrap that turns an untouched Linux installation into AXIOM. A future release bootstrap must work from a separately verified signed release/package entry point, acquire only pinned dependencies, and pass the promotion gates below before the project may call it a supported fresh-host installer.

A plan reporting `host_candidate_compatible: true` means only that the observed facts satisfy the current planner's narrow candidate conditions. It is not a support, security, production, hardware, distro, or release certification.

## Common invariants

Every installer profile must preserve these invariants:

- the installed release is identified by immutable source and artifact digests;
- a release manifest is verified before privileged host changes begin;
- install-time privilege is separate from runtime privilege;
- AXIOM services run as an unprivileged dedicated identity or equivalent isolated workload identity;
- data and secret custody are explicit and kept in separate protected locations;
- no secret is placed in a repository, image layer, shell history, telemetry event, or installer receipt;
- no public ingress is enabled by default;
- external egress remains deny-by-default unless a separately reviewed adapter and policy require a specific destination;
- installation never silently enrolls a machine in federation, remote execution, storage exchange, consensus, governance, or a Circle;
- applications and runtime scaffolds remain clients of Gateway authority rather than alternate authority paths;
- updates are staged, verified, reversible where the data format permits it, and bound to the exact release being installed;
- rollback never silently restores stale authority, credentials, consent, or revocation state;
- backup enrollment copies only encrypted, integrity-bound artifacts unless an explicit separately reviewed export path says otherwise;
- all installer actions that materially affect security or custody produce a non-secret receipt suitable for troubleshooting and independent review.

The mandatory privileged-effect authority path remains:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

Host installation is deployment work around that path, not a way around it.

## Profile A — personal/local node

**Priority:** P0 productization target  
**Current status:** target specified; non-mutating plan implemented; not yet a supported fresh-host installer

This is the default experience for an individual who wants AXIOM on a personally controlled machine.

### Intended outcome

From a supported clean Linux installation, the operator should be able to select one reviewed install command or signed package and reach a local ready state without knowing the internal four-service architecture.

The resulting system should provide:

- the current verified AXIOM-MESH release;
- Gateway, Hypervisor, Sandbox, and Grid with current service isolation;
- owner-local encrypted data and separate owner-controlled secrets;
- AXIOM One when its exact release status permits it, otherwise an explicit preview/development label;
- a local status/repair surface;
- explicit optional application discovery, including Axiom Education as its own independently released repository/application;
- an update channel chosen by the owner;
- safe backup enrollment choices;
- a complete uninstall/decommission guide that distinguishes application removal from data/key destruction.

### Fresh-host sequence

A supported implementation should perform these stages explicitly. The current planner can model and record the sequence but performs only non-mutating preflight/planning work.

1. **Preflight** — identify OS family/version, CPU architecture, filesystem, available memory/storage, virtualization/container support, clock status, and whether the host is already carrying conflicting AXIOM state.
2. **Release selection** — resolve a named stable/candidate/development channel to one immutable signed release manifest. A moving branch is never the installed identity.
3. **Artifact verification** — verify release signature, source/artifact digests, expected platform/architecture, and installer-policy version before privileged mutation.
4. **Toolchain acquisition** — install only the reviewed, pinned runtime/container/host dependencies required by that release. No unpinned `curl | sh`, ambient package-script execution, or registry-name substitution.
5. **Host boundary creation** — create the runtime identity, protected data/secret/run directories, service definitions, resource limits, log policy, and default-deny network boundary.
6. **AXIOM provisioning** — invoke the existing production credential/state provisioning through an installer-controlled path that does not print secret values.
7. **Service deployment** — deploy the current supported single-host topology or independently deployable units according to the profile manifest.
8. **Readiness proof** — run doctor/setup/release/network/readiness checks applicable to the installed artifact and record an installation receipt.
9. **Human handoff** — present only local URLs/socket paths, status, recovery location guidance, update channel, backup status, and truthful application availability.
10. **Optional integrations** — enable Axiom Education, model/runtime adapters, cloud backup adapters, or other services only after their own compatibility and authority checks pass.

A failure at any stage leaves the machine either unchanged or in a clearly identified resumable/rollback state. Partial secret sets and partially activated service topologies fail closed.

## Profile B — infrastructure/support node

**Priority:** P0/P1 network-support target  
**Current status:** target specified; non-mutating plan implemented; current repository contains relevant single-host service-unit, admitted-node, scheduling, storage-offer, causal-exchange, backup, and operations foundations, but no general public infrastructure-node installer or federation claim

This profile is for a headless server, home server, lab machine, community-operated host, or later cloud VM that supports AXIOM infrastructure.

### Intended outcome

The installer uses the independently deployable service-unit topology and requires the operator to declare which supported roles the node is being prepared to test or provide. Role selection is configuration intent, not authority.

Current truth boundaries must remain visible:

- admitted-node registration is a local authority mechanism;
- storage offers do not currently imply a complete object-transfer network;
- node scheduling foundations do not imply general remote execution;
- operator-approved causal exchange is not BFT consensus or automatic federation;
- public/community testnet participation is evidence contribution, not production-network authority.

The infrastructure profile therefore starts with **no public service exposure and no automatic network enrollment**. Later network roles require explicit node admission, signed configuration, policy, compatibility, health, revocation, and protocol-specific evidence.

### Required operational surface

A supported infrastructure-node installer must cover:

- headless unattended restart with explicit operator-controlled update policy;
- independently restartable Gateway/Grid/Hypervisor/Sandbox units where applicable;
- per-unit application and transport credentials;
- Grid-only durable state and least-privilege secret projection;
- resource ceilings and disk-space safeguards;
- readiness/health and bounded telemetry;
- backup/restore and scheduled restore evidence;
- credential and data-key rotation;
- continuity-anchor custody outside the primary data directory;
- node identity export/recovery rules that do not export private authority casually;
- explicit decommission/quarantine/revocation workflow;
- optional community-testnet evidence generation tied to the exact installed release.

## Release channels and synchronization

Fresh installation is only sustainable if releases become a synchronization anchor for code, documentation, applications, installers, and downstream compatibility.

The installer must consume a machine-readable release manifest that binds at least:

- semantic AXIOM-MESH version;
- exact source revision;
- platform and architecture;
- artifact/image digests;
- supported host-install profile versions;
- required Node/npm/container/runtime versions where applicable;
- data/schema compatibility generation;
- minimum compatible application/adapter contract versions;
- documentation-set revision or digest;
- rollback compatibility;
- known migration requirements;
- release signature/trust-root identifier.

A host installer may not infer compatibility from a version string alone.

A future stable release should be publishable as one reproducible bundle of:

```text
release manifest
+ verified runtime artifacts
+ install profiles
+ migration/update rules
+ current documentation set
+ application compatibility metadata
+ checksums/signatures/provenance
```

This same bundle should drive fresh installs, updates, recovery rebuilds, community-testnet reproduction, and downstream compatibility checks.

## Applications are selectable surfaces, not embedded authority

The installer should make important AXIOM applications easy to discover without forcing them into the trusted kernel.

Axiom Education is an integral application/domain project but remains independently releasable at:

`https://github.com/Zoverions/Axiom-Education`

A personal-node installer may eventually offer it as an optional application after verifying the Axiom Education release and its declared AXIOM-MESH compatibility profile. Installing Education must not grant learner-record access, provider activation, curriculum activation, network access, or delegated school/guardian authority.

The same pattern applies to AXIOM One, Circles, Verify, Studio, managed-node tooling, and external agent/runtime scaffolds: discoverable and composable, but independently versioned and authority-bounded.

## Personal cloud and remote backup adapters

Remote backup should be interoperable without making a cloud account part of AXIOM's authority model.

The preferred architecture is:

```text
Grid state
  -> AXIOM signed/encrypted backup envelope
  -> local verification
  -> provider-neutral backup adapter
  -> owner-selected remote object/file store
```

Initial provider families may include owner-selected Google Drive, Microsoft OneDrive, S3-compatible object storage, or other reviewed stores. These names are targets, not current implementation claims.

The remote provider should receive encrypted backup objects, bounded non-secret metadata, and integrity identifiers. It should not need the Grid plaintext, data-protection key, operator token, service private keys, or general Gateway authority.

Provider authentication belongs in the owner/user credential scaffold or a separately reviewed secret-provider adapter. A backup adapter receives the minimum scoped credential reference needed for copy/list/read/delete operations allowed by policy; it does not receive unrelated account access.

Restore remains local-authority work: retrieve the exact encrypted artifact, verify its manifest/signature/digest, obtain the owner-controlled decryption material through the normal secret boundary, and run the existing restore verification. A successful cloud upload is not a successful restore test.

## Runtime, connector, and external-service interoperability

The full-stack installation should be attractive because it gives external runtimes and services a safer substrate, not because it locks them into AXIOM.

External agent scaffolds, model providers, productivity services, storage systems, identity systems, and application connectors should integrate through versioned adapters/capsules with:

- exact identity and implementation provenance;
- least-privilege scopes;
- explicit destination/purpose/budget ceilings;
- credential references rather than ambient secrets;
- install/update/uninstall state;
- health and compatibility checks;
- cancellation/revocation behavior;
- evidence and uncertainty handling;
- no ability to reinterpret discovery, installation, or authentication as permission to act.

Where a user scaffold already owns provider credentials and preferences, installer integration should reuse that governed credential reference rather than create duplicate secret stores.

## Community-supported infrastructure

Community participation should eventually help operate and test infrastructure without turning popularity or contribution into authority.

The Community Testnet v0 remains the safe starting point: independent operators reproduce exact revisions and submit evidence. The host-install profiles should reduce participation friction by letting a contributor create a known-good node and export a machine-readable environment/install receipt without private project knowledge.

Later community infrastructure can add separately reviewed node admission, storage/compute offers, relay/discovery services, mirrors, and decentralized evidence/storage mechanisms. Each must retain operator sovereignty and explicit protocol authority. Community operation does not grant merge, release, governance, signing-key, credential, or user-data authority.

## Update, rollback, and decommission

A secure easy install must include its entire lifecycle.

### Update

- resolve a channel to an immutable signed release;
- verify compatibility before stopping the current node;
- take and verify a recoverable backup when migration requires it;
- stage the new runtime alongside the current version;
- run migrations only under explicit compatible rules;
- start and verify the new version;
- retain a bounded rollback generation where safe;
- record the exact transition receipt.

### Rollback

Rollback must fail closed if the previous version cannot safely interpret current data/authority state. It may restore a verified pre-migration backup when the operator explicitly chooses that recovery point, but it must never erase a newer revocation/consent/authority event without making that loss explicit.

### Decommission

Decommission must distinguish:

- stop services;
- remove runtime packages;
- revoke/quarantine the node identity;
- export/retain encrypted backups;
- destroy local data;
- destroy secrets/keys;
- remove application data;
- remove remote backup objects.

Destructive steps require separate explicit confirmation and evidence appropriate to the installed profile.

## Promotion gates for the first real Linux installer

The first supported fresh-Linux installer is not complete until all of the following are demonstrated on clean disposable hosts:

1. install from the signed/pinned release input with no pre-existing AXIOM source checkout;
2. reject unsupported OS/architecture/toolchain and altered artifacts before activation;
3. create only the documented users, directories, services, network rules, and secrets;
4. leave secrets non-readable to unrelated local users and absent from logs/receipts;
5. reach authenticated readiness with the exact installed release;
6. reboot and recover automatically without widening network exposure;
7. perform an in-channel update and prove the new exact version;
8. reject a tampered/stale/incompatible update;
9. restore from a verified backup on a second clean host;
10. exercise rollback or explicitly prove rollback is unsafe for the migration and require restore instead;
11. uninstall runtime components without silently deleting owner data or keys;
12. run the same profile in protected CI or a reproducible disposable-host workflow;
13. publish the installation manual, recovery manual, threat model, release compatibility data, and non-claims at the same commit;
14. pass Windows/macOS compatibility checks for repository code even when the first host installer is Linux-only;
15. collect at least one independent community reproduction before treating the installer as broadly supported.

Until those gates are met, AXIOM-MESH has an implemented clean-checkout **source setup** and an implemented **non-mutating install planner**, not a completed fresh-machine Linux installer.
