# Deployment & Capability Engine v0 — Convergence Design

**Status:** approved first executable slice; inert planning only; no capability promotion

**Date:** 2026-09-02

**Parent programme:** `docs/superpowers/specs/2026-09-02-sovereign-host-deployment-shared-embodiment-design.md`

**Tracker:** #1459

## 1. Objective

Build the smallest reusable planning layer that can answer:

> Given a desired deployment outcome, the capabilities already present on a host or Mesh, the available provider candidates, and existing resource/host-sovereignty evidence, which requirements are already satisfied, which additions are compatible, what consequences would follow, and what owner choices remain unresolved?

v0 stops before execution.

It must not install packages, download models, write disks, activate providers, open network connections, read credentials, create accounts, mutate canonical Grid state, or grant authority.

## 2. Convergence rule

This design **must not create parallel contracts for concepts already implemented or specified elsewhere in the active repository work**.

The first draft of this design proposed new resource-envelope and environment-observation structures. Repository convergence review showed that stronger adjacent contracts already exist on active draft work. Those duplicate structures are rejected.

The Deployment & Capability Engine is therefore a **composition/resolution layer above existing primitives**, not a new resource, host, cognition, or installer authority system.

Required invariant:

> **Compose existing evidence and policy contracts; do not fork their semantics merely to make deployment planning convenient.**

## 3. Upstream architecture to consume

### 3.1 Human / Entity / Societal Fabric — PR #1402

The current #1402 head already carries public-core/private-overlay architecture plus inert implementations for:

- `axiom-resource-envelope.v0`;
- `axiom-resource-observation.v0`;
- resource-pressure evaluation;
- `axiom-capability-surfaces.v0`;
- Blank Egg / public entity foundation contracts;
- the Intelligence Fabric architecture.

The public/private boundary in #1402 is the controlling starting point for reusable entity substrate:

> public reusable composition and contracts may live in the public repository; owner-specific grounding arrives later through private overlays.

Deployment v0 must consume those contracts after their branch is landed or reconstruct only their accepted semantics on current `main`. It must not introduce a second `axiom-resource-envelope.v0`, second resource-observation vocabulary, or second capability-surface registry.

### 3.2 Local host sovereignty gate — PR #1456

#1456 defines the current candidate local host admission boundary for voluntary resource contribution:

- `host.profile.v1`;
- `contribution.policy.v1`;
- `resource.sovereignty-reserve.v1`;
- local Guardian state;
- the rule that remote constraints may narrow or deny local contribution but never enable or widen it.

Deployment planning may explain whether a requested topology appears compatible with those declarations. It may not treat host willingness as remote execution authority.

### 3.3 Linux install planning and signed release input — PRs #1281 / #1282

#1281 already defines a deterministic **non-mutating Linux host-install planner** for `personal-local` and `infrastructure-node` profiles. #1282 adds signed release/install-manifest verification and artifact-bound release input without granting host mutation.

Those branches predate current `main`; their accepted semantics should be forward-ported/reconstructed rather than blindly merged if drift makes direct stacking unsafe.

Deployment v0 sits **above** the host-install planner:

```text
desired user outcome
  -> Deployment & Capability Engine
  -> chosen deployment/profile/provider requirements
  -> existing host-install planner / future platform-specific planner
  -> separately authorized installer
```

The Deployment Engine does not reimplement host directory layout, provisioning, service-unit projection, release-manifest verification, or artifact verification.

### 3.4 Runtime and cognition foundations

Deployment/model planning should consume rather than duplicate:

- Runtime & Connector Fabric / catalog contracts from #1252;
- Agent Composition and Cognitive Topology v0, including persistent/primary model relationships, from #1369/current main;
- Capability Observation v0 from #1393 when empirical capability evidence is available;
- Cognitive Capability Surface reporting from #1395 or its eventual accepted successor;
- Intelligence Fabric / compute qualification architecture from #1402.

A provider being present, observed, benchmarked, or selected for a plan grants no effect authority.

## 4. Existing patterns to reuse

Follow current inert-contract conventions:

- strict exact-field validation;
- deterministic digests through `digestObject`;
- plain-object enforcement;
- bounded arrays and identifiers;
- semantic validator plus JSON Schema mirror for caller-authored contracts;
- exact reference+digest binding where external contracts are composed;
- `authority_effect: "none"`;
- `network_effect: "none"`;
- `runtime_activation: false`;
- tests rejecting extra fields, inconsistent references, invalid enums, duplicate identifiers, and authority-looking declarations.

Do not create a second validation framework.

## 5. New v0 contracts

After convergence, Deployment Engine v0 needs only three new caller-authored concepts plus one derived result.

### 5.1 DesiredDeployment v0

Represents the outcome requested by the user or an authorized planning caller without naming one implementation.

Required top-level fields:

- `schema`: `axiom-desired-deployment.v0`;
- `version`: `0`;
- `status`: `inert-desire`;
- `deployment_id`;
- `target_host_ref`;
- `roles`;
- `required_capabilities`;
- `preferences`;
- `created_at`;
- `contains_secret_material`: false;
- `authority_effect`: `none`;
- `network_effect`: `none`;
- `runtime_activation`: false.

Initial `roles`:

- `personal-node`;
- `cognition-provider`;
- `storage-provider`;
- `backup-provider`;
- `compute-worker`;
- `agent-execution-worker`;
- `interface-endpoint`;
- `embodiment-endpoint`;
- `infrastructure-only`.

`required_capabilities` is a bounded set of semantic capability identifiers. Requirement declaration is not capability authority.

`preferences` contains:

- `locality`: `local-only`, `prefer-local`, `hybrid`, or `cloud-allowed`;
- `priority`: `cost`, `balanced`, `performance`, or `intelligence`;
- `reuse_existing`: boolean;
- `offline_required`: boolean;
- `allow_replacement`: boolean.

The priority label is a preference only. v0 must not invent benchmark, price, or intelligence evidence that was not supplied through an accepted evidence contract.

### 5.2 DeploymentProviderBinding v0

Represents one candidate way to satisfy one or more deployment requirements while referring to the underlying provider/runtime/install identity rather than redefining it.

Required fields:

- `schema`: `axiom-deployment-provider-binding.v0`;
- `version`: `0`;
- `status`: `inert-provider-binding`;
- `binding_id`;
- `provider_kind`;
- `provider_ref`;
- `provider_digest`;
- `capability_ids`;
- `host_ref`;
- `presence_state`;
- `resource_request`;
- `requires_network`;
- `requires_privileged_change`;
- `requires_reboot`;
- `data_egress_possible`;
- `replacement_required`;
- `evidence_refs`;
- `contains_secret_material`: false;
- `authority_effect`: `none`;
- `network_effect`: `none`;
- `runtime_activation`: false.

Initial `provider_kind`:

- `existing-host-component`;
- `runtime-catalog-entry`;
- `local-service`;
- `external-service`;
- `adapter`;
- `install-profile`.

`presence_state`:

- `installed-available`;
- `installed-unavailable`;
- `available-not-installed`;
- `unknown`.

`provider_ref` + `provider_digest` bind the exact underlying descriptor/catalog/profile/evidence artifact. This binding may not self-certify the provider.

`resource_request` uses the same resource dimensions already defined by the accepted Resource Envelope contract rather than creating a deployment-specific CPU/RAM/GPU vocabulary.

A provider binding describes planning consequences only. `requires_privileged_change: true` means a later authorized installer would be required; it does not authorize that installer.

### 5.3 DeploymentSpec v0

The canonical inert planning input.

Required fields:

- `schema`: `axiom-deployment-spec.v0`;
- `version`: `0`;
- `status`: `inert-deployment-spec`;
- `desired`;
- `resource_envelope`;
- `resource_observations`;
- `host_policy_refs`;
- `capability_surface_ref`;
- `provider_bindings`;
- `created_at`;
- `contains_secret_material`: false;
- `authority_effect`: `none`;
- `network_effect`: `none`;
- `runtime_activation`: false;
- `execution_authorized`: false.

Composition rules:

- `desired` is a valid `DesiredDeployment v0` document;
- `resource_envelope` is a valid accepted `axiom-resource-envelope.v0` document for the target host/principal relationship;
- `resource_observations` are valid accepted `axiom-resource-observation.v0` documents bound to that host;
- `host_policy_refs` bind accepted host-profile/contribution/reserve declarations when available;
- `capability_surface_ref` binds the applicable capability-surface registry digest rather than copying human/machine presentation data into deployment state;
- `provider_bindings` is a bounded set of unique valid `DeploymentProviderBinding v0` documents;
- every composed artifact is bound by an exact ID/reference and canonical digest where its source contract supports one.

The engine exposes deterministic `deploymentSpecDigest(document)`.

### 5.4 DeploymentPlan v0

Pure derived output, not caller-authored authority state.

Contains:

- `schema`: `axiom-deployment-plan.v0`;
- `version`: `0`;
- `deployment_id`;
- `target_host_ref`;
- `deployment_spec_digest`;
- `satisfied_existing`;
- `selected_bindings`;
- `unsatisfied_capabilities`;
- `rejected_bindings`;
- `downstream_plan_requests`;
- `consequences`;
- `owner_choices`;
- `reason_codes`;
- `plan_digest`;
- `authority_effect`: `none`;
- `network_effect`: `none`;
- `runtime_activation`: false;
- `execution_authorized`: false.

`downstream_plan_requests` may identify that a selected option requires a host-install plan, runtime acquisition plan, model acquisition plan, or adapter configuration plan. It contains references/requirements only and performs none of those operations.

## 6. Resolution semantics

Resolution is deterministic for the same canonical input.

For each required capability:

1. consider bindings whose exact underlying provider evidence is valid for the planning input;
2. prefer an `installed-available` compatible binding when `reuse_existing` is true;
3. reject bindings that conflict with platform/host policy, resource ceilings, required fresh observations, offline requirements, locality requirements, or explicit replacement policy;
4. preserve the local host sovereignty gate as an independent ceiling rather than interpreting remote selection as local permission;
5. apply user preferences only after all hard constraints are satisfied;
6. if the accepted evidence cannot distinguish equivalent candidates, emit a stable sorted `owner_choice` rather than guessing;
7. if no candidate remains, expose the capability as unsatisfied with stable reason codes;
8. emit a downstream plan request when satisfying the selection requires an installation/acquisition/configuration planner.

The engine never calls the downstream planner in v0.

## 7. Hard constraints vs preferences

Hard constraints include:

- host/platform incompatibility established by accepted host/provider evidence;
- resource-envelope violation;
- missing/stale required resource observations;
- local sovereignty-reserve or contribution-policy conflict where that contract is present;
- `offline_required` with a provider that requires network access;
- `local-only` with an external provider;
- replacement forbidden while candidate requires replacement;
- invalid/mismatched reference or digest;
- contradictory provider declaration.

Preferences include:

- reuse existing;
- prefer local when cloud is permitted;
- cost/balanced/performance/intelligence intent.

A preference never compensates for a hard-constraint failure.

Until trusted cost/performance/intelligence evidence is supplied, v0 may report that a preference cannot yet discriminate candidates; it must not manufacture a ranking.

## 8. Stable reason codes

Initial vocabulary:

- `existing-capability-reused`;
- `provider-reference-invalid`;
- `provider-host-mismatch`;
- `resource-envelope-conflict`;
- `resource-observation-missing-or-stale`;
- `host-sovereignty-conflict`;
- `offline-conflict`;
- `locality-conflict`;
- `replacement-forbidden`;
- `owner-choice-required`;
- `no-compatible-provider`;
- `insufficient-ranking-evidence`;
- `downstream-install-plan-required`;
- `downstream-runtime-plan-required`;
- `downstream-model-plan-required`;
- `downstream-adapter-plan-required`.

Human UIs may translate these into ordinary language without changing semantics.

## 9. No-authority boundary

The following always hold:

- every new v0 caller-authored document has `authority_effect === "none"`;
- every new v0 caller-authored document has `network_effect === "none"`;
- `runtime_activation === false`;
- `DeploymentSpec.execution_authorized === false`;
- `DeploymentPlan.execution_authorized === false`.

The module contains no network calls, filesystem writes, child-process execution, credential reads, Gateway mutations, package-manager calls, model/runtime invocation, or host mutation.

It validates supplied inert documents and computes deterministic derived plans/digests only.

## 10. Reference integrity and limits

Reject:

- host mismatch among desired deployment, resource envelope, observations, host policy, and provider binding;
- digest/reference mismatch;
- duplicate capability IDs or provider binding IDs;
- duplicate underlying provider identity where declarations conflict;
- observations that do not satisfy the Resource Envelope freshness requirement when needed;
- unknown fields or enums;
- exact-input structures exceeding bounded limits.

Initial cardinality limits:

- 32 required capabilities;
- 128 provider bindings;
- 64 resource observations;
- 16 roles;
- 32 capabilities per provider binding;
- 32 evidence refs per binding.

## 11. Expected implementation files

Only after the upstream convergence dependencies are accepted/reconstructed on the implementation base:

- `mesh/config/desired-deployment-v0.schema.json`;
- `mesh/config/deployment-provider-binding-v0.schema.json`;
- `mesh/config/deployment-spec-v0.schema.json`;
- `mesh/src/lib/deployment-capability-engine.mjs`;
- `mesh/test/deployment-capability-engine.test.mjs`.

Do **not** create:

- another resource-envelope schema;
- another resource-observation schema;
- another capability-surface registry;
- another host sovereignty-reserve policy;
- another Linux host-install planner;
- another runtime/catalog identity system.

No Gateway route or capability-registry promotion is part of v0.

## 12. Test requirements

Tests must prove at least:

1. valid desired deployment/provider binding/spec validation and digest stability;
2. exact reuse of accepted Resource Envelope and Resource Observation semantics;
3. host/reference/digest mismatch rejection;
4. installed compatible capability reuse;
5. compatible provider binding selection when an addition is needed;
6. resource-envelope and stale/missing-observation rejection;
7. host sovereignty conflict rejection where host-policy evidence is supplied;
8. offline/locality/replacement-policy rejection;
9. unresolved equivalent candidates becoming explicit owner choice;
10. unsatisfied capability output when no provider fits;
11. downstream plan requests are descriptive only;
12. unknown-field and duplicate-reference rejection;
13. `DeploymentPlan.deployment_spec_digest` binds the exact input spec;
14. all new inputs/outputs remain authority/network/activation inert;
15. monkey-patched network/process/filesystem primitives are never invoked;
16. semantically order-insensitive inputs produce deterministic plans/digests.

## 13. Deliberate exclusions

v0 does not include:

- real hardware probing;
- host mutation;
- package managers;
- model downloads;
- model intelligence ranking;
- benchmark execution;
- pricing ingestion;
- USB writing;
- cloud provisioning;
- smart-home discovery;
- shared-domain authority;
- biometric/presence state;
- Axiom One UI;
- Launchpad UI.

Those are consumers or later planners/executors, not reasons to widen this pure resolver.

## 14. Branch/merge discipline

The convergence dependencies named above are active draft PRs with different historical bases.

Do not merge this v0 implementation independently by copying whichever branch happens to be easiest.

Before implementation:

1. determine which upstream contracts have landed on current `main`;
2. forward-port/reconstruct only accepted missing semantics on a current base;
3. remove any duplicate contract from the plan;
4. run fresh protected verification on the exact combined head;
5. preserve negative/provenance history rather than claiming an older branch's green CI proves the new integration state.

## 15. Success condition

A caller can present a desired deployment plus exact accepted resource/host/provider evidence and receive a deterministic inspectable plan that:

- reuses what is already compatible;
- identifies the minimum missing capability/provider additions;
- respects existing resource and host-sovereignty constraints;
- explains hard conflicts;
- exposes ambiguity instead of guessing;
- identifies which existing downstream planner would be needed next;
- binds the output to the exact input evidence;
- remains completely inert with respect to authority, network, runtime activation, and system mutation.