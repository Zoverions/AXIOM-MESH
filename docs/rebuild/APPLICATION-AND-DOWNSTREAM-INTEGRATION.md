# AXIOM-MESH Application and Downstream Integration Model

**Status:** canonical productization specification candidate  
**Updated:** 2026-08-23  
**Applies to:** `0.12.0-dev.3` development line

AXIOM-MESH is the authority, coordination, evidence, portability, and network substrate. It is not intended to absorb every application into one repository. Important applications may remain independently releasable while still being first-class members of the AXIOM project family.

The project therefore needs an explicit application/downstream model that keeps repository independence, compatibility, documentation, installation, and feature adoption synchronized.

## First-class application family

The current project family should be presented consistently across the README, documentation index, roadmap, white paper/product description, installer surfaces, and user/agent guidance.

### AXIOM One

**Repository location:** in `AXIOM-MESH` today  
**Current claim:** experimental loopback-only personal interface

AXIOM One is the human-facing personal node experience: local agent interaction, approvals, private memory/Vault surfaces, receipts, status, selective export, and later application discovery.

### Axiom Education

**Canonical repository:** `https://github.com/Zoverions/Axiom-Education`  
**Repository:** independent  
**Current claim:** active development; not production-ready

Axiom Education is an integral AXIOM application/domain project, not a side example and not merely a high-school application. It is intended to provide a lifelong local-first education platform across age groups, jurisdictions, institutions, and learning stages while consuming AXIOM-MESH policy, consent, authority, evidence, portability, memory, and synchronization facilities through explicit compatibility contracts.

Repository independence is deliberate. It allows Education's Flutter/mobile/desktop release cycle, curriculum evidence, jurisdictional source review, pedagogical testing, and application UX to evolve without making those concerns part of the trusted Mesh kernel.

Independence does **not** mean compatibility is optional. Axiom Education is a declared downstream consumer and should be continuously verified against the Mesh interfaces it actually uses.

The current Mesh/Education convergence is synchronized: AXIOM-MESH contains the governed learner-memory/write/self-read substrate, and Axiom Education independently records the merged Mesh provenance while retaining byte-pinned runtime contracts and its Gateway semantic-seam binding. That synchronization is a current compatibility checkpoint, not a permanent promise that future Mesh changes require no downstream review.

### AXIOM Circles

**Current location:** contracts, roadmap, and development surfaces in AXIOM-MESH  
**Current claim:** invitation/governance/social collaboration work remains evidence-gated and partially experimental/inert

Circles provides governed collaboration while preserving independently owned principals, nodes, records, and filtering choices.

### AXIOM Verify

**Current claim:** product target built from existing verification primitives; a standalone promoted product remains future work.

Verify should let a person or third party validate evidence, signatures, continuity, packages, receipts, and stated non-claims without trusting an AXIOM operator.

### AXIOM Studio

**Current claim:** product target.

Studio should package capsule, adapter, policy, schema, conformance, threat-model, rollback, and developer tooling without granting installed developer artifacts runtime authority.

### AXIOM Managed Node

**Current claim:** optional future product/service profile.

Managed Node should help people run, update, back up, and recover AXIOM infrastructure without transferring ownership of user information or converting the operator into application authority.

### Agent/runtime ecosystem

Hermes, OpenClaw, Agent Zero, MCP, A2A, model providers, local inference engines, and future scaffolds are interoperability targets through the Runtime and Connector Fabric. They may provide planning, tools, coordination, or compute, but do not replace AXIOM's authority path.

## Downstream compatibility contract

Every first-class external repository that depends on AXIOM-MESH should publish a machine-readable compatibility profile.

At minimum it should record:

- downstream repository identity;
- downstream release/version and exact source revision;
- supported AXIOM-MESH semantic version range where meaningful;
- one reviewed Mesh source checkpoint for provenance;
- exact Mesh contract/interface identifiers actually consumed;
- digests or schema versions for authority-bearing contracts;
- Gateway/API semantic seams used by the application;
- required capability statuses;
- required negative/fail-closed behavior;
- optional Mesh features that are recognized but not adopted;
- minimum documentation/operational requirements;
- compatibility-test identity and evidence digest;
- whether the profile is development, candidate, or production-promoted.

A moving `main` branch is never sufficient compatibility evidence.

## Mesh-side downstream registry

AXIOM-MESH should maintain the inverse relationship as well: a machine-readable registry of first-class downstream consumers.

That registry should identify, for each consumer:

- canonical repository;
- integration owner/community surface;
- compatibility manifest location;
- Mesh contracts the downstream application relies on;
- last independently verified downstream revision;
- current compatibility state;
- relevant release/update trigger classes;
- whether a Mesh change requires downstream retest, migration, review, or no action.

This prevents the failure mode where a downstream repository can remain internally green against an old pin while Mesh `main` has moved beyond or lost the referenced integration surface.

The current `application-catalog.json` establishes application identity and relationship metadata, while the documentation-impact policy begins enforcing review obligations for Education-consumed Mesh paths. A fuller inverse downstream registry with independently verified downstream revision/evidence fields remains future work and must not be implied by the catalogue alone.

## Change-impact classes

Every Mesh pull request should eventually classify its downstream impact.

### Class D0 — no downstream semantic impact

Examples: comments, internal refactor with proven byte/behavior equivalence, test-only fixtures.

No downstream release is required, but the classification is still recorded.

### Class D1 — additive non-authority surface

Examples: a new read-only status field or unrelated application capability.

Downstream consumers should be checked for parser/compatibility tolerance. No adoption is required.

### Class D2 — consumed contract or API behavior change

Examples: an Education intent schema, Gateway semantic seam, result/error contract, memory profile, provider contract, or required service route changes.

Affected downstream repositories require fresh compatibility verification before the Mesh change can be described as compatible with them.

### Class D3 — authority/security semantic change

Examples: changes to capability/grant verification, consent, identity, revocation, data ownership, effect routing, external destination rules, credential use, or evidence binding that a downstream application relies on.

This requires explicit downstream threat/authority review, fresh compatibility evidence, and usually coordinated release notes/migration guidance.

### Class D4 — breaking or migration-required change

A downstream consumer cannot operate safely without source/data/configuration migration.

The Mesh release must carry explicit compatibility windows, migration steps, rollback limits, and affected-application status. It may not simply publish and leave the downstream application silently broken.

## Feature-adoption ledger

Compatibility alone is not enough. First-class applications should also have a feature-adoption ledger so useful new Mesh capabilities do not remain unnoticed.

For each relevant new Mesh capability, a downstream application records one of:

- `adopted` — implemented and evidenced;
- `adoption-in-progress` — active bounded work exists;
- `planned` — useful and accepted into the roadmap;
- `evaluated-not-applicable` — reviewed and deliberately not needed;
- `blocked` — useful but waiting on a named prerequisite;
- `unsafe-or-out-of-scope` — intentionally rejected with rationale.

Axiom Education should use this ledger for capabilities such as Sovereign Vault/context surfaces, Personal Agent continuity, bounded runtime adapters, State Fabric simulation, Circles/sharing, identity/delegation, portability, backup, and future node/network services. None should be adopted merely because it exists.

## Documentation synchronization

A new or changed feature is not complete when code and tests pass if the feature materially changes what users, operators, agents, application developers, or downstream repositories need to know.

The project maps implementation changes to documentation families.

| Change family | Documentation that must be reviewed |
|---|---|
| user-visible behavior | README/current-state, user guide, application guide, release notes |
| agent/runtime behavior | agent/runtime guide, adapter contract, security boundary, release notes |
| capability status | capability registry, status/readiness, README/white paper claims |
| architecture/authority | white paper, architecture docs, threat model, requirements |
| roadmap completion/new work | roadmap, master todo/status ownership docs |
| operations/install/update | installation, production, recovery, operator manuals |
| API/contract | contract docs, client guide, downstream compatibility profiles |
| Education-consumed Mesh change | Mesh downstream model plus Axiom Education compatibility/adoption evidence |
| network/node behavior | node/operator docs, security/network docs, community-testnet guidance |

The first executable synchronization layer is:

- `mesh/config/documentation-impact-policy.json` — machine-readable high-risk path-to-document-family rules;
- `mesh/src/check-documentation-impact.mjs` — strict policy validation plus base-to-head changed-path evaluation;
- protected PR verification — the Clean Kernel `verify` job evaluates the pull request base/head before the rest of the kernel verification.

The initial enforced scope covers:

- host-install target/policy/planner surfaces;
- Education-consumed Mesh contracts/runtime paths;
- service-network policy;
- capability registry/evidence-binding status;
- the first-class application catalogue; and
- the documentation-impact policy/checker itself.

For each triggered rule, every required documentation group must contain at least one changed canonical path in the same pull request. A code-only change to one of those high-drift surfaces therefore fails rather than relying on a later manual documentation cleanup.

This v1 gate is intentionally narrower than the full documentation vision. It proves that required document families were reviewed/touched; it does **not** by itself prove that the changed prose is semantically complete or correct. Existing generated capability/status/network checks and semantic document anchors continue to provide deeper checks for the surfaces they already understand. The impact policy should expand only when ownership rules are specific enough to avoid meaningless documentation churn.

There is currently no machine-readable `not-applicable` waiver path in this v1 checker. If a future exception mechanism is added, it must carry an explicit justification and must not become a generic bypass.

Cross-repository consequences remain independent evidence obligations. A Mesh PR touching an Education-consumed surface can be required to update the Mesh-side downstream/current-state documentation, but AXIOM-MESH CI does not silently mutate or self-approve the separate Axiom-Education repository. When the semantic class requires downstream verification, Axiom Education must produce its own compatibility change and CI evidence before the combined state is described as synchronized.

## Installer/application catalogue

Fresh host installation should expose a clear application catalogue after the core node is verified.

The catalogue is informational until an application is selected. Each entry should show:

- name and purpose;
- canonical repository or in-tree path;
- release status;
- supported platforms;
- required Mesh compatibility contract;
- permissions/authority requested;
- storage/data ownership behavior;
- network/provider requirements;
- update/uninstall boundary;
- whether it is installed, available, incompatible, disabled, or experimental.

Selecting an application triggers its own verified installation and compatibility flow. Merely being listed creates no capability or permission.

For Axiom Education, the catalogue should link directly to `Zoverions/Axiom-Education`, identify it as independently releasable, and refuse governed Education runtime binding if its compatibility profile does not match the installed Mesh contracts.

## Community and outside-agent participation

The project should deliberately allow outside people and agents to help improve applications and infrastructure while keeping authority bounded.

Useful participation lanes include:

- compatibility reproduction across application/Mesh version pairs;
- fresh-host installer testing across Linux distributions/architectures;
- Windows/macOS repository and application compatibility;
- infrastructure-node hardware/resource observations;
- adapter/provider reviews;
- documentation drift reports;
- backup/restore interoperability testing;
- red-team and authority-boundary testing;
- accessibility/usability reviews;
- application-specific work in the appropriate external repository.

GitHub remains the current canonical collaboration surface. Community identity/reputation may help route review effort, but it never creates merge, release, infrastructure, signing-key, credential, governance, or user-data authority.

## Storage and backup interoperability

Applications should not each invent a different cloud backup model.

Mesh should provide a provider-neutral encrypted backup/export substrate that applications can reference. Provider adapters can then move already protected artifacts into owner-selected services such as Google Drive, Microsoft OneDrive, S3-compatible storage, or future decentralized stores.

Applications retain their own domain export semantics, but long-term recoverable application state should identify which material is:

- part of canonical Mesh state;
- an application-owned local store;
- a derived/rebuildable cache;
- a signed/encrypted backup artifact;
- an external application/domain artifact that needs its own backup contract.

Remote storage never becomes authority merely because it retains bytes.

## Full-stack principle

AXIOM should support both modular adoption and a coherent full stack.

A user may choose only the Mesh authority substrate, only an application connected to a compatible Mesh node, an external runtime using AXIOM authority, or a complete owner-local stack. The full-stack path should provide the best integrated security, recovery, evidence, application discovery, network support, and update experience, but the project should not make interoperability artificially worse for modular deployments.

The design goal is:

> **Easy to enter, easy to understand, easy to connect, hard to misuse, possible to leave.**

Interoperability is not ambient trust. Convenience is not authority. Integration is successful when independent components can cooperate while every consequential boundary remains explicit, revocable, observable, and recoverable.
