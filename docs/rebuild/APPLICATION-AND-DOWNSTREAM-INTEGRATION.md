# AXIOM-MESH Application and Downstream Integration Model

**Status:** canonical productization specification candidate  
**Updated:** 2026-08-23  
**Applies to:** `0.12.0-dev.3` development line

AXIOM-MESH is the authority, coordination, evidence, portability, and network substrate. It is not intended to absorb every application into one repository. First-class applications may remain independently releasable while still being continuously compatible with the Mesh contracts they actually consume.

Repository independence therefore does not mean synchronization is optional.

## First-class application family

### AXIOM One

**Location:** in `AXIOM-MESH` today  
**Current claim:** experimental loopback-only personal interface

AXIOM One is the human-facing personal node experience: local agent interaction, approvals, private memory/Vault surfaces, receipts, status, selective export, and later application discovery.

### Axiom Education

**Canonical repository:** `https://github.com/Zoverions/Axiom-Education`  
**Repository:** independent  
**Current claim:** active development; not production-ready

Axiom Education is an integral AXIOM application/domain project, not a side example and not merely a high-school product. Its direction is a lifelong local-first education platform across age groups, jurisdictions, institutions, and learning stages while consuming Mesh policy, consent, authority, evidence, portability, memory, and synchronization facilities through explicit contracts.

Independent release cadence is deliberate: Education can evolve its Flutter/mobile/desktop UX, curriculum evidence, jurisdictional source review, pedagogy, and accessibility without putting those concerns inside the trusted Mesh kernel.

### AXIOM Circles

**Current claim:** governance/social collaboration work remains evidence-gated and partly experimental/inert.

Circles is intended to support governed collaboration while preserving independently owned principals, nodes, records, and filtering choices.

### AXIOM Verify

**Current claim:** product target built from existing verification primitives; standalone promoted product remains future work.

Verify should let a person or third party validate signatures, evidence, continuity, packages, receipts, scopes, and non-claims without trusting an AXIOM operator.

### AXIOM Studio

**Current claim:** product target.

Studio should package capsule, adapter, policy, schema, conformance, threat-model, rollback, signing, and developer tooling without granting installed developer artifacts runtime authority.

### AXIOM Managed Node

**Current claim:** optional future product/service profile.

Managed Node should help owners run, update, back up, recover, and decommission infrastructure without transferring ownership of user information or turning the operator into application authority.

### Agent/runtime ecosystem

Hermes, OpenClaw, Agent Zero, MCP, A2A, model providers, local inference engines, and future scaffolds are interoperability targets through the Runtime and Connector Fabric. They may provide planning, tools, coordination, or compute, but they do not replace AXIOM's authority path.

## Downstream compatibility contract

Every first-class external repository that consumes AXIOM-MESH should publish a machine-readable compatibility profile.

At minimum it records:

- downstream repository identity;
- downstream release/version and exact source revision;
- supported AXIOM-MESH version range where meaningful;
- one reviewed Mesh source checkpoint for provenance;
- exact contract/interface identifiers consumed;
- digests or schema versions for authority-bearing contracts;
- Gateway/API semantic seams used by the application;
- required capability statuses;
- required negative/fail-closed behavior;
- optional Mesh features recognized but not adopted;
- minimum documentation/operational requirements;
- compatibility-test identity/evidence digest;
- whether the profile is development, candidate, or production-promoted.

A moving `main` branch is never sufficient compatibility evidence.

## Mesh-side downstream registry

AXIOM-MESH should retain the inverse relationship: a machine-readable registry of first-class downstream consumers.

For each consumer it should identify:

- canonical repository;
- integration owner/community surface;
- compatibility manifest location;
- Mesh contracts relied upon;
- last independently verified downstream revision;
- current compatibility state;
- release/update trigger classes;
- whether a Mesh change requires downstream retest, migration, review, or no action.

This prevents a downstream repository from remaining internally green against an obsolete pin while current Mesh has moved beyond the referenced integration surface.

## Change-impact classes

Every Mesh pull request should eventually classify downstream impact.

### D0 — no downstream semantic impact

Comments, test-only fixtures, or internal refactors with proven behavior equivalence. Classification is still recorded.

### D1 — additive non-authority surface

A new read-only field or unrelated application capability. Consumers should prove parser/compatibility tolerance; adoption is not mandatory.

### D2 — consumed contract or API behavior change

An Education intent schema, Gateway semantic seam, result/error contract, memory profile, provider contract, or required service route changes. Affected consumers require fresh compatibility verification.

### D3 — authority/security semantic change

Capability/grant verification, consent, identity, revocation, data ownership, effect routing, destination rules, credential use, or evidence binding relied on by a downstream app. This requires explicit downstream authority/threat review and fresh compatibility evidence.

### D4 — breaking or migration-required change

A downstream consumer cannot operate safely without source/data/configuration migration. Mesh release notes must state compatibility windows, migration steps, rollback limits, and affected application status rather than silently leaving the downstream application broken.

## Feature-adoption ledger

Compatibility does not require adoption of every new Mesh feature.

Relevant new Mesh capabilities should be classified by each first-class downstream application as:

- `adopted`;
- `adoption-in-progress`;
- `planned`;
- `evaluated-not-applicable`;
- `blocked`;
- `unsafe-or-out-of-scope`.

Axiom Education should use this ledger for Sovereign Vault/context surfaces, Personal Agent continuity, bounded runtimes, State/Path Fabric work, Circles/sharing, identity/delegation, portability, backup, and future node/network services. Existence alone never implies adoption.

## Documentation synchronization

Implementation is not complete when code/tests pass if the change materially alters what users, operators, applications, agents, release tooling, or downstream repositories need to know.

The machine-readable `mesh/config/documentation-impact-policy.json` now provides the first enforceable base→head synchronization rules. On protected pull requests `npm run check` evaluates the exact PR base/head diff and fails when a governed surface changes without its required documentation family.

Initial governed families include:

- host-install targets/policy/planner;
- signed release/install-manifest policy and verifier;
- Education-consumed Mesh contracts/runtime surfaces;
- service-network policy implementation;
- capability status/evidence binding;
- first-class application catalogue;
- the documentation-impact policy itself.

The release/install-manifest rule is intentionally cross-layer: changing release trust requires the signed-release contract, host-install operations guide, a public/current-state surface, and release/status documentation to move together.

The gate is additive rather than universal. It should expand as semantic ownership becomes machine-readable, without degenerating into a rule that every source change must touch every manual.

A documentation touch is not automatically semantic correctness. Longer-term gates should compare generated anchors from capability, route, version, compatibility, release, install, application, and product registries so unrelated prose cannot satisfy a required change.

## Signed release synchronization

Fresh installation and updates need one release identity that synchronizes code, documentation, applications, migration rules, and install contracts.

The `axiom-install-release-manifest.v1` verifier now establishes the release-input side of that boundary. A signed release statement binds:

- exact Mesh source revision/version/channel;
- install-profile statuses;
- source/toolchain/data compatibility;
- digests of the current install, capability, application, service-network, and setup control planes;
- installable artifact digests/sizes;
- documentation bundle, SBOM, and provenance artifacts;
- externally trusted Ed25519 release signer identity/role/currentness;
- explicit non-claims and zero install/Mesh/network authority.

A downstream application release should eventually reference the exact Mesh release manifest or compatible Mesh release identity it was tested against. Conversely, a Mesh release should record compatible first-class downstream revisions or explicitly mark them pending/incompatible.

This is release synchronization, not ambient trust. A valid release manifest does not auto-install Axiom Education, grant app permissions, create provider authority, or prove that a downstream app has adopted every new feature.

## Installer/application catalogue

Fresh host installation should expose a clear application catalogue only after the core node/release inputs are verified.

Each application entry should show:

- name/purpose;
- canonical repository or in-tree path;
- release status;
- supported platforms;
- required Mesh compatibility contract;
- permissions/authority requested;
- storage/data ownership behavior;
- network/provider requirements;
- update/uninstall boundary;
- installed/available/incompatible/disabled/experimental state.

Catalogue presence is informational. Selecting an application triggers its own verified installation/compatibility/authority flow.

For Axiom Education, the catalogue should link directly to `Zoverions/Axiom-Education` and refuse governed runtime binding when the Education release/profile does not match the installed Mesh contracts.

## Community and outside-agent participation

Outside people and agents should be able to improve applications and infrastructure while authority remains bounded.

Useful contribution lanes include:

- compatibility reproduction across Mesh/application release pairs;
- fresh-host installer testing across Linux distributions/architectures;
- Windows/macOS repository compatibility;
- AXIOM Host appliance/image reproduction;
- infrastructure-node hardware/resource observations;
- adapter/provider review;
- documentation drift reports;
- backup/restore interoperability testing;
- red-team and authority-boundary testing;
- accessibility/usability review;
- application-specific work in the appropriate repository.

GitHub remains the canonical collaboration surface today. Identity/reputation may route review effort but does not create merge, release, release-signing, infrastructure, credential, governance, or user-data authority.

## Storage and backup interoperability

Applications should not each invent a different cloud backup trust model.

Mesh should provide a provider-neutral encrypted backup/export substrate. Provider adapters then move already protected artifacts into owner-selected services such as Google Drive, OneDrive, S3-compatible stores, or later decentralized storage.

Applications retain their own domain export semantics, but recoverable state should identify which material is:

- canonical Mesh state;
- application-owned local state;
- derived/rebuildable cache;
- signed/encrypted backup artifact;
- external domain artifact needing its own backup contract.

Remote storage never becomes authority merely because it retains bytes.

## Full-stack principle

AXIOM should support modular adoption and a coherent full stack.

A user may choose only the Mesh authority substrate, an application connected to a compatible Mesh node, an external runtime using AXIOM authority, a general Linux install, the stronger future AXIOM Host reference appliance, or a complete owner-local stack.

The full-stack path should provide the best integrated security, release verification, recovery, evidence, application discovery, network support, and update experience without intentionally making modular deployments worse.

The design goal remains:

> **Easy to enter, easy to understand, easy to connect, hard to misuse, possible to leave.**

Interoperability is not ambient trust. Compatibility is not adoption. Installation is not authority. A release signature is not permission to mutate a host. Integration succeeds when independent components cooperate while consequential boundaries remain explicit, revocable, observable, and recoverable.
