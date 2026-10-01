# Capability Substitution & Sovereign Continuity v0 — Design

**Status:** approved architectural direction; written specification for review; implementation remains separately gated

**Date:** 2026-09-17

**Scope:** preserve user-requested capabilities when an external provider becomes unavailable, incompatible, restrictive, uneconomic, discontinued, or otherwise unsuitable by preferring interoperable alternatives and, when necessary, producing a separately verified replacement-service candidate without turning provider failure into authority to bypass controls.

**Authority:** `mesh/config/capabilities.json` remains authoritative for runnable capability state. Provider failure, service denial, technical buildability, generated code, conformance evidence, substitution planning, or a replacement candidate grants no AXIOM authority by itself.

**Builds on:**

- `docs/superpowers/specs/2026-08-29-extensible-agent-provider-substrate-design.md`;
- `docs/superpowers/specs/2026-08-30-sovereign-intelligence-selection-v0-design.md`;
- `docs/superpowers/specs/2026-09-02-deployment-capability-engine-v0-design.md` and issue #1459 / implementation PR #1476;
- issue #1461 — replaceable runtime/model adapters and cognition fallback;
- issue #1467 — sovereign deployment convergence;
- issue #1492 — failure-domain diversity and sovereign degraded mode;
- issue #1540 — verified-work and exact harness provenance;
- issue #1575 — provider-loss/degraded-mode and endpoint-fallback falsification backlog;
- `docs/rebuild/REQUIREMENTS.md`, especially fail-closed dependency handling and the prohibition on synthetic success.

## 1. Objective

AXIOM should treat third-party services as replaceable implementations of semantic capabilities rather than permanent veto points over the user's digital life.

The target behavior is:

```text
required capability
  -> current provider becomes unavailable / incompatible / disallowed
  -> preserve truthful unavailable/degraded state
  -> identify compatible alternatives
  -> reuse or switch when possible
  -> configure/install an accepted alternative when justified
  -> compose existing local primitives when sufficient
  -> build a new service candidate only when needed and permitted
  -> verify the candidate against the capability contract
  -> separately authorize deployment/migration/activation
  -> reroute the capability
  -> preserve portability, rollback, provenance, and receipts
```

The design must support substantial agent autonomy without converting autonomy into ambient authority.

> **No non-essential third party should have a permanent veto over a capability the user's own systems are technically and lawfully able to provide.**

The corresponding safety rule is equally important:

> **A third party refusing or blocking an agent is a reason to replace the dependency, not permission to bypass the third party's access controls.**

## 2. Core doctrine

### 2.1 Capability is the stable abstraction

A capability such as storage, search, inference, publication, scheduling, document editing, synchronization, verification, or messaging should be represented separately from the provider currently satisfying it.

Provider identity remains important for provenance, credentials, data destination, policy, cost, failure domains, licences, compatibility, and evidence. It does not become the capability's permanent identity.

### 2.2 Substitution is not fallback success

Current requirements already require a missing provider or other required dependency to fail closed. This design preserves that rule.

Until a substitute has been independently shown to satisfy the required capability contract and has been separately admitted for the intended effect path, the capability remains `unavailable`, `degraded`, or another truthful non-success state.

No planner may convert:

```text
provider unavailable
```

into:

```text
success via fallback
```

merely because an alternative could theoretically be built.

### 2.3 Buildability is not authority

An agent may be capable of writing a replacement service. That fact grants no permission to:

- obtain or use new credentials;
- access a blocked provider through another route;
- scrape or retrieve data it is not entitled to access;
- spend money;
- purchase infrastructure;
- expose a public endpoint;
- open new egress;
- migrate sensitive state;
- install privileged software;
- deploy to production;
- alter policy or capability status;
- resume stale queued effects after a provider transition.

Those remain separate current authority decisions.

### 2.4 No ongoing intervention means standing bounded authority, not self-authorization

The system should eventually be able to recover from ordinary dependency failures without asking the owner to approve every implementation step.

That may occur only where a pre-existing mandate explicitly covers the relevant class of work. For example, a user may pre-authorize local code generation, testing in a disposable workspace, and replacement of a non-consequential local utility within resource ceilings.

The agent cannot infer a standing mandate merely from the owner's preference for autonomy.

Consequential migration, credential provisioning, new data destinations, spending, public exposure, production activation, or protection-lowering changes require the authority already defined for those effects.

### 2.5 Replace function, not proprietary product identity

The target is semantic capability continuity, not automatic cloning of a provider's proprietary product, interface, branding, private implementation, or inaccessible data.

A replacement may have a different internal design or user experience if it satisfies the required capability contract.

Where a new implementation is needed, prefer:

- open standards;
- public specifications;
- documented interoperability formats;
- user-controlled data and exports;
- permissibly available source/components;
- clean-room implementation where appropriate;
- independently testable semantic contracts.

Unknown licensing, provenance, or entitlement questions remain explicit blockers or review requirements; they are not silently resolved in the agent's favor.

## 3. Approaches considered

### Approach A — provider fallback lists only

Maintain ordered provider lists and switch when a provider fails.

**Advantages:** simple, immediately useful, low implementation risk.

**Insufficient because:** it still leaves the user dependent on a finite vendor set, does not solve discontinued interfaces or unique capabilities, does not handle local composition, and cannot express the user's requirement that the agent may create the missing capability itself.

### Approach B — unrestricted self-building replacement engine

Whenever a dependency blocks work, allow the agent to create, deploy, and migrate to a substitute service automatically.

**Advantages:** maximum apparent autonomy.

**Rejected because:** it collapses planning, coding, credential use, infrastructure mutation, data migration, spending, deployment, and authority into one mechanism. Provider refusal could become an accidental authorization oracle. It also conflicts with AXIOM's fail-closed and effect-boundary doctrine.

### Approach C — substitution planner plus separately governed build/migration path — chosen

Add a small capability-substitution layer that determines what function is missing, why the current provider is unusable, which existing alternatives satisfy the hard constraints, and whether a new implementation candidate is justified.

The planner may hand off a bounded build requirement to existing verified-work / development machinery. The resulting artifact then enters the existing provider, deployment, verification, and authority layers like any other candidate.

This preserves autonomy while retaining one authority plane.

## 4. Relationship to existing architecture

This design must not create a second provider registry, deployment engine, cognition router, evidence envelope, executor, or authority path.

### Provider substrate

`Agent Provider Profile v0` already separates logical provider capability from activation and authority. New local/fork/adapter replacement implementations should become ordinary reviewed provider profiles with exact artifact provenance rather than a special trusted class.

### Deployment & Capability Engine

The approved Deployment & Capability Engine already represents desired semantic capabilities, provider bindings, presence state, replacement requirements, hard constraints, `reuse_existing`, `offline_required`, and `allow_replacement`.

PR #1476 contains a fully implemented/verified version but is currently open and has drifted from current `main`. Before executable substitution work lands, that implementation must be merged or its accepted semantics reconstructed on the then-current base.

Capability Substitution therefore sits **above and around** Deployment & Capability Engine:

```text
provider/dependency observation
  -> substitution trigger
  -> substitution policy + capability dependency profile
  -> Deployment & Capability Engine candidate resolution
  -> substitution plan
```

It does not reimplement provider eligibility or installation planning.

### Sovereign Intelligence Selection

AI/model/runtime replacement continues to use Cognitive Capability Profiles and eligibility evaluation. A substitution event may cause a fresh eligibility evaluation, but cannot turn eligibility into selection or execution.

### Verified Work

If no acceptable provider exists and a new implementation is justified, code generation and verification should use the project's existing verified-work / bounded development path. Do not create a second generic build-result envelope.

### Resilience / degraded mode

Provider substitution complements, rather than replaces, sovereign degraded mode. The local control plane must remain operable even when every frontier provider is unavailable. A replacement may restore capability later; degraded safety must not depend on successful replacement.

## 5. Terminology

### Capability

A provider-neutral semantic function with explicit inputs, outputs, side-effect class, data requirements, conformance obligations, and policy constraints.

### Dependency

A currently selected implementation, provider, protocol, external endpoint, artifact, or service whose availability is needed to satisfy a capability.

### Substitution trigger

Evidence that a currently selected dependency no longer satisfies a required condition.

A trigger is diagnostic evidence only. It does not authorize a substitute.

### Substitution

Changing the implementation that satisfies a capability while preserving the required semantics and current authority rules.

### Replacement candidate

A newly built or newly acquired implementation that has not yet been admitted as the active provider.

### Blocked provider

A provider is considered blocked for this architecture only when the currently authorized and permitted interface cannot satisfy the required capability under the applicable technical/provider constraints.

Examples include an unavailable API, withdrawn automation support, incompatible protocol version, provider-side denial of automated use, unavailable credentials under current policy, or a provider policy that conflicts with the user's declared privacy/locality requirements.

`blocked` does **not** mean "an access control exists that the agent should defeat."

## 6. Trigger classes

The initial closed trigger vocabulary should be:

- `availability-loss`;
- `provider-discontinued`;
- `interface-withdrawn`;
- `automation-not-supported`;
- `protocol-version-incompatible`;
- `credential-unavailable`;
- `policy-incompatible`;
- `privacy-locality-incompatible`;
- `security-assurance-degraded`;
- `cost-budget-incompatible`;
- `performance-slo-incompatible`;
- `failure-domain-unavailable`;
- `user-requested-replacement`.

The trigger must bind evidence rather than rely only on generated prose.

A trigger may be `observed`, `declared`, `inferred`, or `unknown` according to the evidence source. Higher-consequence automatic substitution may require stronger evidence under separate policy.

## 7. Strategy ladder

The planner should use a least-disruptive, constraint-first strategy ladder.

### S0 — stay safely degraded

If no compatible and authorized path exists, preserve truthful unavailability/degraded mode. Do not force recovery by weakening constraints.

### S1 — reuse an already present compatible provider

Prefer an installed/available implementation when exact capability and hard-constraint evidence supports it.

### S2 — switch to another reviewed provider

Select from existing provider candidates only after the normal provider/deployment eligibility checks. A new provider destination, privacy posture, retention rule, cost, or failure domain remains visible.

### S3 — configure or install an accepted provider

Produce only the existing downstream deployment/acquisition/configuration request. Installation and activation remain separate effects.

### S4 — compose existing local capabilities

A capability may be satisfied by a small adapter or composition of already available local primitives where the semantic contract permits it.

The composition becomes its own reviewed provider/adapter artifact; composition does not launder authority from its components.

### S5 — build a new service candidate

Use only when no acceptable lower strategy satisfies the capability and policy permits construction.

The output is a candidate artifact, not an active provider.

## 8. Capability Dependency Profile v0

The first new caller-authored contract should be:

`axiom-capability-dependency-profile.v0`

It describes what must survive provider replacement without embedding provider execution authority.

Required fields:

- `schema`;
- `version`;
- `status: inert-dependency-profile`;
- `dependency_id`;
- `capability_id`;
- `capability_contract_ref`;
- `capability_contract_digest`;
- `current_provider_ref`;
- `current_provider_digest`;
- `state_classes`;
- `state_portability`;
- `accepted_substitution_strategies`;
- `interoperability_requirements`;
- `privacy_constraints`;
- `locality_constraints`;
- `failure_domain_requirements`;
- `licence_provenance_requirements`;
- `conformance_requirements`;
- `rollback_requirements`;
- `criticality`;
- `created_at`;
- `contains_secret_material: false`;
- `authority_effect: none`;
- `network_effect: none`;
- `runtime_activation: false`;
- `migration_authorized: false`.

### State portability

Initial state-portability values:

- `stateless`;
- `portable-full`;
- `portable-partial`;
- `provider-export-required`;
- `nonportable-known`;
- `unknown`.

A profile must not claim portability merely because the current provider has an export button. The exact data classes, format, completeness, and applicable evidence should be explicit.

### Criticality

Initial criticality values:

- `optional`;
- `ordinary`;
- `important`;
- `continuity-critical`;
- `control-plane-critical`.

Criticality can raise recovery and verification requirements. It cannot grant replacement authority.

## 9. Substitution Trigger v0

The second new caller-authored contract should be:

`axiom-substitution-trigger.v0`

Required fields:

- `schema`;
- `version`;
- `status: inert-substitution-trigger`;
- `trigger_id`;
- `dependency_id`;
- `dependency_profile_digest`;
- `trigger_class`;
- `observation_class`;
- `observed_at`;
- `evidence_refs`;
- `current_provider_state`;
- `requested_strategy_ceiling`;
- `reason_code`;
- `contains_secret_material: false`;
- `authority_effect: none`;
- `network_effect: none`;
- `runtime_activation: false`;
- `bypass_authorized: false`.

`requested_strategy_ceiling` limits how far the planner may explore. It never authorizes the selected strategy's effects.

`bypass_authorized` is hard-false in v0. The field exists only to make the anti-bypass boundary machine-verifiable and difficult to omit from projections.

## 10. Derived Substitution Plan v0

The planner returns a derived:

`axiom-substitution-plan.v0`

Containing:

- exact dependency/profile/trigger digests;
- current capability state;
- accepted hard constraints;
- compatible existing candidates;
- rejected candidates with stable reason codes;
- chosen planning strategy where deterministic evidence permits one;
- unresolved owner/policy choices;
- existing Deployment & Capability Engine request/result references;
- state export/import requirements;
- conformance obligations;
- failure-domain consequences;
- rollback obligations;
- build-candidate requirement if S5 is justified;
- downstream authority/effect requirements;
- reason codes;
- plan digest;
- `authority_effect: none`;
- `network_effect: none`;
- `runtime_activation: false`;
- `execution_authorized: false`;
- `migration_authorized: false`;
- `provider_bypass_authorized: false`.

The planner must be deterministic for identical canonical evidence.

## 11. Build-candidate handoff

S5 does not introduce a new executor.

The substitution plan may emit a bounded **build-candidate requirement** that can be transformed into an existing verified-work/development request under a separately authorized workspace mandate.

The requirement should bind:

- capability contract digest;
- exact semantic behavior to implement;
- required input/output formats;
- side-effect classification;
- allowed implementation sources/specifications;
- prohibited proprietary/private sources;
- dependency/licence constraints;
- resource ceilings;
- data fixtures permitted for development;
- required tests;
- security checks;
- interoperability checks;
- packaging expectations;
- rollback/uninstall requirements;
- evidence obligations.

A coding agent may then create an implementation candidate only within its normal workspace authority.

### Build rules

1. Prefer standards and public/authorized specifications.
2. Do not use provider denial as authority to retrieve inaccessible source code, private APIs, credentials, or data.
3. Use synthetic, public, or specifically authorized user data in tests.
4. Pin dependencies and preserve licence/provenance metadata.
5. Produce an exact artifact digest and build provenance.
6. Keep secrets outside generated source and evidence artifacts.
7. Treat generated code as untrusted until testing/review appropriate to consequence succeeds.
8. A successful test run does not activate the provider.
9. A replacement implementation receives no privileged status because AXIOM generated it itself.

## 12. Conformance model

The required capability contract should distinguish at least:

- semantic input/output behavior;
- error/failure semantics;
- data and schema compatibility;
- durability/state semantics;
- effect classification;
- privacy/retention expectations;
- cancellation/idempotency behavior where applicable;
- resource ceilings;
- availability/SLO requirements when evidenced;
- export/import behavior;
- security properties;
- observability/receipt requirements;
- interoperability/version requirements.

Conformance should be evidence-backed and scoped. It must not become a universal `compatible: true` claim.

A replacement may implement only a named subset of a broad provider product. The active capability must truthfully expose that subset rather than pretending full product equivalence.

## 13. Migration and continuity

State migration is a distinct consequence-bearing phase.

A substitution plan may describe migration, but must not execute it.

### Required principles

- export only through interfaces and data the user is authorized to use;
- bind export/import artifacts by digest where practical;
- preserve provenance and timestamps where semantics require them;
- distinguish complete, partial, lossy, unavailable, and unknown migration;
- never fabricate missing provider state;
- preserve a pre-migration snapshot or rollback path where the capability requires it;
- invalidate or re-evaluate stale sessions, queued effects, credentials, callbacks, and destinations after provider change;
- do not assume idempotency across providers unless the capability contract proves it;
- a provider transition must not silently change data residency, retention, training use, sharing, or public exposure;
- if a provider offers no permitted export path, report the retained dependency or partial continuity rather than bypassing the provider.

For consequential external effects, recovery from provider failure must not replay an effect merely because the original provider outcome is unknown. Existing effect-uncertainty and semantic-replay controls remain controlling.

## 14. Failure-domain awareness

A substitute is not meaningfully resilient merely because its vendor name differs.

The planner should consume failure-domain evidence from #1492 where available and distinguish:

- same provider / different product;
- different provider / shared or unknown upstream infrastructure;
- materially independent remote failure domain;
- owner-local implementation;
- offline deterministic path.

Unknown independence remains unknown.

The planner must not claim resilience from provider count alone.

## 15. Policy for autonomous substitution

A later governed policy may allow automatic progression through selected strategy classes.

Illustrative policy levels:

### Level 0 — diagnose only

Detect dependency failure and explain alternatives.

### Level 1 — plan automatically

Create substitution plans and verification requirements without mutation.

### Level 2 — build/test locally

Generate adapter/service candidates and run bounded local/disposable conformance under an existing workspace mandate.

### Level 3 — activate pre-approved substitutes

Switch among already admitted providers only when exact data destinations, costs, privacy posture, credentials, effect semantics, and rollback conditions remain inside a pre-authorized standing mandate.

### Level 4 — bounded migration/deployment

Permit specified classes of deployment or migration under an explicit standing authority envelope with finite destinations, budgets, data classes, rollback/currentness requirements, and revocation.

No policy level may authorize defeating third-party access controls or weakening lower-layer protections.

The initial executable v0 remains at Level 1.

## 16. Reason codes

Initial stable reason codes should include:

- `current-provider-unavailable`;
- `current-provider-incompatible`;
- `automation-interface-unavailable`;
- `provider-policy-incompatible`;
- `privacy-constraint-conflict`;
- `locality-constraint-conflict`;
- `budget-constraint-conflict`;
- `security-assurance-insufficient`;
- `protocol-version-conflict`;
- `failure-domain-conflict`;
- `state-portability-insufficient`;
- `licence-provenance-unresolved`;
- `existing-compatible-provider`;
- `installation-required`;
- `adapter-composition-possible`;
- `build-candidate-justified`;
- `build-candidate-not-permitted`;
- `migration-required`;
- `migration-incomplete`;
- `rollback-unavailable`;
- `insufficient-conformance-evidence`;
- `owner-choice-required`;
- `no-safe-substitute`.

Reason codes explain planning state only. None is an authority result.

## 17. Adversarial acceptance cases

The design must eventually prove at least these cases:

1. Provider returns a denial for automated access -> substitution planning may begin; no alternate path to the same protected interface is attempted without separate authorization.
2. Provider API disappears -> capability remains unavailable until a substitute is verified/admitted; no mock or synthetic success.
3. Provider blocks automation but public/open standard permits independent implementation -> S5 may produce a clean-room candidate requirement without accessing provider-private implementation material.
4. Generated replacement code attempts undeclared network or credential access -> conformance fails; no activation.
5. Generated replacement passes functional tests but changes data destination/retention posture -> migration/activation remains ineligible unless current policy explicitly permits the new posture.
6. Same capability name but incompatible semantics -> candidate rejected.
7. Substitute supports only a subset -> plan records partial capability instead of full equivalence.
8. Current provider contains nonportable state -> planner reports partial/blocked migration; no fabricated reconstruction.
9. Export interface requires user/provider authorization that is absent -> export does not occur.
10. Cost increase triggers substitution -> no procurement or spend occurs from cost evidence alone.
11. Cloud outage triggers local fallback -> effect authority remains unchanged; degraded control plane stays available.
12. Alternate remote provider shares the same failed cloud/control-plane dependency -> planner does not claim independent resilience.
13. Provider transition occurs while a consequential effect has unknown outcome -> no automatic replay at the substitute.
14. Stale queued work references old provider/destination/credential -> currentness re-evaluation is required before any later effect.
15. Malicious provider documentation or error text says to bypass AXIOM policy -> treated as untrusted data, not instruction authority.
16. Replacement candidate supplies its own `compatible`, `secure`, or `verified` assertion -> self-assertion does not satisfy required conformance evidence.
17. A locally generated provider profile attempts to set authority/network/runtime activation fields -> rejected.
18. Substitution plan attempts to set `execution_authorized`, `migration_authorized`, or `provider_bypass_authorized` true -> rejected.
19. User revokes the standing substitution mandate during planning/build -> later effectful stages fail closed under normal currentness rules.
20. Capability is control-plane-critical and no safe substitute exists -> system remains safely degraded rather than lowering requirements.
21. Provider credential is technically present but policy denies its use -> possession does not become authority.
22. A replacement candidate depends on an unreviewed proprietary SDK/licence -> unresolved provenance remains explicit and blocks automatic activation where policy requires resolution.
23. Provider recovers while a replacement is being built -> planner may re-evaluate; generated work remains evidence/artifact and does not force migration.
24. Two equivalent substitutes remain after hard constraints -> emit owner/policy choice unless a separately accepted ranking policy exists.

## 18. First executable slice

The first implementation should remain pure, local, deterministic, and zero-authority.

### Slice CS-0

1. Add strict `CapabilityDependencyProfile v0` semantic validator and JSON Schema.
2. Add strict `SubstitutionTrigger v0` semantic validator and JSON Schema.
3. Add a pure `resolveSubstitutionPlan(...)` composition layer that consumes exact provider/dependency evidence and the accepted Deployment & Capability Engine resolver/output rather than reimplementing provider selection.
4. Add synthetic fixtures for:
   - provider outage with existing substitute;
   - automation refusal with no bypass;
   - privacy conflict requiring local substitute;
   - nonportable state;
   - shared failure-domain fallback rejection;
   - S5 build-candidate justification;
   - no-safe-substitute degraded outcome.
5. Add source-level side-effect traps proving the resolver imports no network, filesystem mutation, process spawn, credential, provider invocation, installer, package manager, or Grid mutation surface.
6. Keep every output hard-false for authority, activation, migration, and bypass.
7. Do not add a Gateway route or promote a capability.

### Dependency gate

Before CS-0 implementation, reconcile the accepted Deployment & Capability Engine implementation from PR #1476 onto the then-current `main`, or explicitly implement CS-0 against its accepted interface in a branch stacked on the exact reviewed DCE head. Do not duplicate DCE logic because the PR is temporarily unmerged.

## 19. Later slices

### CS-1 — bounded build-candidate handoff

Map S5 to an existing verified-work/development request under a separately authorized disposable/local workspace. Produce code/artifacts plus exact provenance and conformance evidence; no provider activation.

### CS-2 — replacement provider admission

Create/reuse Provider Profile/Binding artifacts for the candidate and feed them through the existing Deployment & Capability Engine. No automatic promotion from build success.

### CS-3 — governed migration and reroute

Use existing effect authority, consent, credential brokerage, backup/rollback, currentness, and receipts to move state and activate the substitute under an explicit or standing bounded mandate.

### CS-4 — continuity automation

After evidence from lower slices, allow policy-governed automatic recovery for low-risk capabilities while preserving consequence-proportional approval and degraded-mode behavior.

## 20. User-facing behavior

Axiom One should eventually present substitution in capability language, not infrastructure panic.

Illustrative surface:

```text
Calendar synchronization is unavailable through Provider A.

Your agent found:
- Provider B — compatible, requires a new authorized destination.
- Local CalDAV service — compatible, can run on your node.
- Build a minimal local adapter — feasible, not yet verified.

Current state: degraded; no events have been lost or resent.
No provider controls were bypassed.
No migration or spending has occurred.
```

For a standing mandate, the same surface may report completed bounded recovery afterward, including what changed, exact evidence, rollback state, and any residual differences.

## 21. Security and claim boundary

Passing CS-0 would prove only that AXIOM can describe dependency continuity, classify bounded substitution triggers, and derive deterministic non-authorizing recovery plans.

It would **not** prove:

- autonomous production service replacement;
- permission to bypass API/provider restrictions;
- legal entitlement to reproduce every external service;
- automatic third-party data extraction;
- general arbitrary-code sandbox safety;
- autonomous spending or infrastructure procurement;
- automatic credential acquisition;
- automatic production deployment;
- lossless migration from every provider;
- complete functional equivalence to a replaced product;
- independent failure-domain resilience without evidence;
- provider neutrality from branding alone;
- production capability promotion.

## 22. Constitutional summary

The architectural rule is:

> **External services are replaceable implementations of capabilities, not permanent authorities over the user's digital life.**

The operational rule is:

> **When a provider can no longer serve an authorized capability, preserve truthful degradation, seek the least-dependent compatible substitute, and build a new candidate when justified—but never use dependency failure as authority to bypass protections or widen effects.**

The autonomy rule is:

> **The agent may recover automatically only within authority the user has already granted; it may never manufacture the authority required to complete the recovery.**
