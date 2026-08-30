# Sovereign Intelligence Selection v0 — Design

**Status:** approved architectural extension for an inert, zero-authority first slice

**Date:** 2026-08-30

**Scope:** routing-relevant cognitive capability metadata bound to the existing runtime/provider catalog, plus deterministic candidate eligibility evaluation without model invocation, network access, credential use, authority grants, or runtime activation

**Builds on:**

- `docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md`
- `docs/superpowers/specs/2026-08-29-extensible-agent-provider-substrate-design.md`
- `mesh/config/runtime-provider-catalog.v0.json`
- `mesh/src/lib/runtime-connector-fabric-contracts.mjs`
- `mesh/src/lib/agent-composition.mjs`
- `mesh/src/lib/cognitive-topology.mjs`

**Authority boundary:** `mesh/config/capabilities.json` remains authoritative. This slice is descriptive and evaluative only. It does not promote `ai.providers`, install or start providers, activate models, read credentials, perform egress, grant authority, select an execution winner, spend funds, mutate Cognitive Topology, or claim model quality.

## 1. Core decision

AXIOM should treat models, hosted providers, local inference backends, and agent runtimes as replaceable cognitive capabilities around a persistent sovereign identity/authority/memory substrate.

The first executable routing slice therefore separates three questions:

1. **What candidate exists?** — answered by the existing runtime/provider catalog.
2. **What routing-relevant properties are declared for this exact candidate?** — answered by Cognitive Capability Profile v0.
3. **Does a candidate satisfy this caller-supplied set of constraints?** — answered by a pure deterministic evaluator.

None of those questions authorize execution.

> **Discovery is not authority. Eligibility is not selection. Selection is not execution.**

## 2. Why this is an adjunct contract

The current `axiom-runtime-connector-catalog-entry.v1` contract intentionally describes installation provenance, compatibility, requested access, orchestration, assurance observations, lifecycle, and non-claims. It should not be expanded into a fast-changing AI model scorecard.

Likewise, Agent Composition v0 and Cognitive Topology v0 describe what a sovereign agent is composed from and how strongly it depends on cognitive components. They should not become provider-market catalogs.

Cognitive Capability Profile v0 is therefore a separately content-addressed adjunct bound to one exact existing runtime/provider catalog entry.

This keeps:

- provider/runtime discovery stable;
- cognitive routing metadata replaceable;
- composition and topology contracts unchanged;
- model/provider facts explicitly reviewable;
- future learned routing policy separable from authority.

## 3. Cognitive Capability Profile v0

Schema identifier:

`axiom-cognitive-capability-profile.v0`

A profile binds to exactly one existing catalog entry using:

- `entry_id`;
- `entry_version`;
- canonical `entry_digest`.

The profile also declares an `offering_ref`. For a hosted provider this may identify a model or service offering. For a local compute backend or agent runtime it may identify a reviewed local/runtime profile. The reference is descriptive and does not prove availability.

### 3.1 Capability metadata

The closed v0 capability vocabulary is:

- `reasoning`
- `coding`
- `vision`
- `computer-use`
- `research`
- `planning`
- `critique`
- `summarization`
- `embedding`
- `tool-use`
- `agent-orchestration`
- `other`

At least one capability is required. Duplicate values fail closed.

### 3.2 Modalities

Input and output modalities are independently declared from:

- `text`
- `image`
- `audio`
- `video`
- `embedding`

Each list is closed-world, duplicate-free, and bounded.

### 3.3 Deployment posture

Routing-relevant deployment metadata is intentionally coarse:

**Locality**

- `owner-local`
- `owner-remote`
- `provider-remote`
- `hybrid`

**Access mode**

- `local-runtime`
- `api`
- `remote-runtime`
- `hybrid`

These values describe how cognition would be reached if separately authorized. They do not enable that access.

### 3.4 Data posture

The profile declares bounded, reviewable data-handling posture rather than silently inferring privacy from provider branding.

**Retention**

- `none`
- `transient`
- `persistent`
- `unknown`

**Training use**

- `excluded`
- `possible`
- `unknown`

**Exportability**

- `none`
- `partial`
- `full`
- `unknown`

A nullable `policy_ref` may identify the reviewed policy/evidence basis. The profile does not fetch or verify that policy remotely.

### 3.5 Economic and performance bands

The first slice avoids volatile exact prices and benchmark claims. It uses coarse operator-reviewed classes only.

**Cost class**

- `none`
- `low`
- `medium`
- `high`
- `unknown`

**Latency class**

- `local-fast`
- `interactive`
- `slow`
- `batch`
- `unknown`

**Context class**

- `small`
- `medium`
- `large`
- `very-large`
- `unknown`

These are declarations for filtering, not universal quality claims.

### 3.6 Openness and custody

**Weight access**

- `closed`
- `open-remote`
- `open-acquired`
- `local-proprietary`
- `not-applicable`

The profile may carry a nullable exact artifact digest and nullable licence reference. `open-acquired` and `local-proprietary` require an exact artifact digest; other states require `artifact_digest: null`.

This mirrors the Cognitive Topology sovereignty distinction without changing topology itself.

### 3.7 Assurance

The profile declares an evidence ceiling from:

- `none`
- `self-asserted`
- `behavioral`
- `cryptographic`
- `hardware-rooted`

It may name zero or more bounded `evidence_refs`.

This is evidence metadata only. Assurance never grants authority.

### 3.8 Hard boundary fields

Every profile must contain:

```text
authority_effect = none
network_effect = none
credential_visibility = none
runtime_activation = false
selection_effect = eligibility-only
```

Unknown fields fail closed.

## 4. Exact catalog-entry binding

`resolveCognitiveCapabilityProfile(profile, catalogEntry)` must:

1. validate the profile;
2. validate the supplied runtime/provider catalog entry through the existing contract;
3. require exact `entry_id` equality;
4. require exact `entry_version` equality;
5. recompute the canonical catalog-entry digest and require exact `entry_digest` equality;
6. require the profile `integration_class` to match the catalog entry;
7. enforce simple locality/access consistency with the catalog entry's integration class and declared network requirement;
8. return a frozen evidence summary only.

The resolver must perform no filesystem, network, subprocess, Grid, credential, wallet, or runtime operation.

## 5. Candidate Eligibility Request v0

The evaluator accepts a closed request object rather than hidden preferences.

Schema identifier:

`axiom-cognitive-eligibility-request.v0`

The request contains:

- `request_id`;
- required capabilities;
- allowed integration classes;
- allowed localities;
- allowed retention classes;
- allowed training-use classes;
- allowed weight-access classes;
- maximum cost class;
- maximum latency class;
- minimum assurance ceiling;
- minimum context class;
- `created_at`;
- hard no-authority constants.

No candidate ordering preference is encoded in v0. This avoids smuggling a project-wide cognitive policy into the substrate.

## 6. Deterministic eligibility evaluation

`evaluateCognitiveCandidates(profiles, request)` performs only deterministic filtering over already validated profile data.

For each profile it returns either:

- an eligible record with `profile_id`, `offering_ref`, and the exact profile digest; or
- a rejected record with a stable sorted list of reason codes.

The v0 reason-code vocabulary is:

- `missing-capability`
- `integration-class-not-allowed`
- `locality-not-allowed`
- `retention-not-allowed`
- `training-use-not-allowed`
- `weight-access-not-allowed`
- `cost-too-high-or-unknown`
- `latency-too-high-or-unknown`
- `assurance-too-low-or-unknown`
- `context-too-small-or-unknown`

Output ordering is deterministic by `profile_id` and does not imply preference.

The evaluator returns:

```text
selection_effect = eligibility-only
authority_effect = none
network_effect = none
credential_visibility = none
runtime_activation = false
requires_gateway_authorization = true
```

The caller or a later policy-controlled router may use the eligibility report as evidence. That later layer must remain separately authorized.

## 7. Error handling

Validation fails closed for:

- unknown fields;
- malformed identifiers or digests;
- invalid or duplicate enum values;
- empty capability sets;
- invalid timestamps or timestamp ordering;
- incompatible weight/digest declarations;
- boundary widening;
- catalog-entry digest drift;
- catalog-entry identity/version mismatch;
- integration-class mismatch;
- impossible local/network posture declarations;
- duplicate profile identifiers in one evaluation;
- malformed eligibility requests.

## 8. Testing strategy

Tests must prove:

- strict profile validation and deterministic digesting;
- exact catalog-entry digest binding;
- provider-remote/API profiles require a network-requiring model-provider catalog entry;
- owner-local/local-runtime profiles reject a network-required provider service entry;
- open-acquired/local-proprietary states require exact artifact digests;
- unknown/secret-bearing fields fail closed;
- eligibility filtering covers every constraint dimension and stable reason codes;
- output order is deterministic and not a ranking claim;
- input objects are not mutated;
- profile and evaluator sources import no network, filesystem, subprocess, Grid, credential, wallet, token, or secret runtime surface.

## 9. Explicit non-claims

This slice does not provide:

- model invocation;
- provider API compatibility;
- provider availability checks;
- credential brokerage;
- network egress;
- automatic winner selection;
- learned routing;
- benchmark truth;
- exact price truth;
- provider-policy freshness;
- runtime installation;
- model acquisition;
- principal continuity;
- subjective identity continuity;
- authority grants or delegation.

## 10. Future promotion path

Later work may add a separately governed router that consumes:

- eligibility reports;
- operator policy;
- task consequence;
- budget;
- measured local evidence;
- continuity/fidelity requirements;
- provider availability;
- independent verification requirements.

That router may eventually choose who thinks about a task. Any resulting effect must still traverse the normal AXIOM authority path.

The architectural invariant remains:

> **Identity, authority, and memory belong to the sovereign node. Cognitive providers are replaceable capabilities whose use remains policy- and authority-bound.**
