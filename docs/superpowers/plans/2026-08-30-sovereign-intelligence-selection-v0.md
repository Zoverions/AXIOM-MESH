# Sovereign Intelligence Selection v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a zero-authority cognitive capability profile and deterministic eligibility evaluator that bind routing metadata to exact runtime/provider catalog entries without activating or invoking anything.

**Architecture:** Introduce one pure contract module for cognitive capability profiles and eligibility requests/evaluation, with a strict JSON Schema mirror for the profile. Bind profiles to existing runtime/provider catalog entries by exact canonical digest. Keep candidate evaluation deterministic, reason-coded, and eligibility-only; no ranking, credentials, network I/O, provider invocation, or authority effects.

**Tech Stack:** Node.js ESM, Node built-in `node:test`, existing `canonical.mjs` digest/validation helpers, existing `runtime-connector-fabric-contracts.mjs` catalog validator, JSON Schema 2020-12.

**Spec:** `docs/superpowers/specs/2026-08-30-sovereign-intelligence-selection-v0-design.md`

## Global Constraints

- Node compatibility remains `>=22.23.2 <23 || >=24.14.0 <25`.
- `mesh/config/capabilities.json` remains authoritative; this slice does not promote `ai.providers`.
- No production module in this slice may import filesystem, network, subprocess, Grid, credential, wallet, token, secret, or runtime-supervisor surfaces.
- `authority_effect` must remain `none`.
- `network_effect` must remain `none`.
- `credential_visibility` must remain `none`.
- `runtime_activation` must remain `false`.
- `selection_effect` must remain `eligibility-only`.
- Eligibility output order must be deterministic by `profile_id` and must not imply ranking.

---

### Task 1: Specify the cognitive capability profile contract

**Files:**
- Create: `mesh/test/cognitive-capability-profile.test.mjs`
- Create: `mesh/test/cognitive-capability-profile-schema.test.mjs`
- Create later after RED: `mesh/src/lib/cognitive-capability-profile.mjs`
- Create later after RED: `mesh/config/cognitive-capability-profile-v0.schema.json`

**Interfaces:**
- Produces: `COGNITIVE_CAPABILITY_PROFILE_SCHEMA`, `validateCognitiveCapabilityProfile(profile)`, `cognitiveCapabilityProfileDigest(profile)`, `resolveCognitiveCapabilityProfile(profile, catalogEntry)`.
- Consumes: `digestObject`, `ValidationError`, and `validateRuntimeConnectorCatalogEntry`.

- [ ] **Step 1: Write failing profile tests**

Test a valid provider-remote/API profile, deterministic digesting, exact catalog binding, boundary constants, weight-artifact semantics, duplicate/unknown-field rejection, timestamp ordering, non-mutation, and impossible locality/network combinations.

- [ ] **Step 2: Write failing schema-mirror tests**

Assert JSON Schema 2020-12, closed-world objects, the exact enum vocabularies from the spec, hard boundary constants, and semantic-validator metadata pointing to `mesh/src/lib/cognitive-capability-profile.mjs`.

- [ ] **Step 3: Verify RED in CI**

Expected failure: module/schema missing for the new tests. The failure must be attributable to the absent feature rather than unrelated CI breakage.

- [ ] **Step 4: Implement the minimal profile validator/resolver and schema**

Implementation requirements:

```js
export const COGNITIVE_CAPABILITY_PROFILE_SCHEMA = 'axiom-cognitive-capability-profile.v0';

export function validateCognitiveCapabilityProfile(profile) { /* strict closed-world validation */ }
export function cognitiveCapabilityProfileDigest(profile) { /* validate then digestObject */ }
export function resolveCognitiveCapabilityProfile(profile, catalogEntry) { /* exact id/version/digest/class + posture checks */ }
```

The resolver returns a frozen summary containing the exact profile/catalog identities and digests plus only zero-authority boundary metadata.

- [ ] **Step 5: Verify GREEN for profile/schema tests**

Run through PR CI and confirm both new tests pass without weakening existing checks.

### Task 2: Specify deterministic candidate eligibility evaluation

**Files:**
- Create: `mesh/test/cognitive-candidate-selection.test.mjs`
- Modify later after RED: `mesh/src/lib/cognitive-capability-profile.mjs`

**Interfaces:**
- Produces: `COGNITIVE_ELIGIBILITY_REQUEST_SCHEMA`, `validateCognitiveEligibilityRequest(request)`, `evaluateCognitiveCandidates(profiles, request)`.
- Consumes: validated Cognitive Capability Profile v0 documents.

- [ ] **Step 1: Write failing evaluator tests**

Use two or more valid fixtures to prove every hard constraint dimension, stable reason codes, duplicate-profile rejection, deterministic profile-id ordering, non-ranking semantics, no input mutation, and hard boundary metadata.

- [ ] **Step 2: Verify RED in CI**

Expected failure: evaluator/request exports are missing.

- [ ] **Step 3: Implement the minimal evaluator**

Required reason codes:

```text
missing-capability
integration-class-not-allowed
locality-not-allowed
retention-not-allowed
training-use-not-allowed
weight-access-not-allowed
cost-too-high-or-unknown
latency-too-high-or-unknown
assurance-too-low-or-unknown
context-too-small-or-unknown
```

Use fixed ordinal maps only for max/min constraint comparisons. Do not compute a preference score and do not return a winner.

- [ ] **Step 4: Verify GREEN for evaluator tests**

Confirm eligible/rejected outputs are deterministic and the evaluator remains pure.

### Task 3: Prove the no-authority/no-I/O boundary statically

**Files:**
- Create: `mesh/test/cognitive-selection-boundary-static.test.mjs`

**Interfaces:**
- Inspects: `mesh/src/lib/cognitive-capability-profile.mjs`.

- [ ] **Step 1: Write a failing/static boundary test before broadening implementation**

Reject imports or direct references to:

```text
node:fs
node:http
node:https
node:net
node:tls
node:dns
node:child_process
node:worker_threads
Grid
gateway
credential
wallet
token
secret
fetch(
```

Permit imports only from `./canonical.mjs` and `./runtime-connector-fabric-contracts.mjs`.

- [ ] **Step 2: Verify the static test passes once implementation exists**

A pass demonstrates only local source-boundary absence, not complete system security.

### Task 4: Integrate the architectural boundary into project documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md`
- Modify: `docs/superpowers/specs/2026-08-29-extensible-agent-provider-substrate-design.md`
- Modify: `docs/MASTER-TODO-AGENT-INTEROPERABILITY.md` only if an existing routing/provider backlog item can be updated without overstating implementation.

**Interfaces:**
- Documents the relationship: runtime/provider catalog -> cognitive capability profile -> eligibility report -> future governed router -> normal Gateway authority path.

- [ ] **Step 1: Add cross-links and current executable-boundary text**

State that Cognitive Capability Profile v0 adds routing-relevant metadata without changing catalog/composition/topology contracts and that eligibility is not execution.

- [ ] **Step 2: Preserve explicit non-claims**

Do not advertise provider invocation, automatic routing, learned routing, credential brokerage, policy freshness, exact price truth, or model-quality certification.

### Task 5: Full verification and merge decision

**Files:**
- No new production files unless verification exposes a defect.

- [ ] **Step 1: Run the full protected PR checks**

Required evidence: GitHub Actions jobs for the PR head, especially Clean Kernel `verify` and Node 22 compatibility.

- [ ] **Step 2: Inspect failures rather than rerunning blindly**

If a job fails, read the failed step/log, fix the cause, and rerun through a fresh commit or targeted retry only when the failure is infrastructure-only.

- [ ] **Step 3: Review changed-file scope**

Confirm only the spec/plan, new cognitive contract/schema/tests, and narrowly necessary cross-links changed.

- [ ] **Step 4: Merge only after fresh green verification**

Use the repository's normal merge mechanism. Do not claim implementation or integration complete before the final main-branch/merge SHA is known and its verification state is checked.
