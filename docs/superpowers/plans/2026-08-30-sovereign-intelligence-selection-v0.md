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
- `authority_effect` must remain `none` until the dedicated Gateway authorization step; authorization itself is selection-scoped only and never execution authority.
- `network_effect` must remain `none`.
- `credential_visibility` must remain `none`.
- `runtime_activation` must remain `false`.
- Eligibility contract `selection_effect` must remain `eligibility-only`; proposal output alone uses `proposal-only`.
- Eligibility output order must be deterministic by `profile_id`.
- Eligibility remains a hard filter. Later recommendation logic may rank only eligible profiles and must not widen eligibility.
- Recommendation is not authorization: proposal output must retain `winner_selected: false`, `runtime_activation: false`, `authority_effect: none`, and `selection_effect: proposal-only`.
- Policy-bounded recommendation v0 uses explicit ordered enum preferences only; no hidden weights, learned scores, ambient provider defaults, or automatic execution.
- `profile_id` raw JavaScript code-unit order is the mandatory final recommendation tie-break; `localeCompare()` is forbidden for evidence ordering.
- Raw `PolicyEngine.evaluate()` allow is never sufficient evidence of completed cognitive selection authorization.
- Selection authorization must traverse the normal Gateway `/v1/intents` path and bind the exact proposal to terminal execution evidence.
- A selection authorization decision is non-transferable evidence, not a bearer capability, provider credential, runtime grant, or cognitive-execution authorization.
- Any future provider/model execution must re-enter a fresh normal Gateway authority path and independently satisfy current policy, capability, assurance, credential, destination, and runtime constraints.

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

---

## Follow-on: Policy-Bounded Selection Proposals v0

The eligibility slice above is implemented on `main`. The follow-on below adds recommendation evidence while preserving the separation: **eligibility is not recommendation, recommendation is not selection, and selection is not execution**.

### Task 6: Define an inert explicit selection policy

**Files:**
- Create: `mesh/src/lib/cognitive-selection-proposal.mjs`
- Create: `mesh/config/cognitive-selection-policy-v0.schema.json`
- Create: `mesh/test/cognitive-selection-proposal.test.mjs`

**Interfaces:**
- Produces: `COGNITIVE_SELECTION_POLICY_SCHEMA`, `validateCognitiveSelectionPolicy(policy)`, `proposeCognitiveSelection(candidates, request, policy)`.
- Consumes: `digestObject`, `ValidationError`, and `evaluateCognitiveCandidates`.

- [x] **Step 1: Write the missing-surface RED test**

Expected failure: `ERR_MODULE_NOT_FOUND` for `cognitive-selection-proposal.mjs` while the existing suite remains green.

- [x] **Step 2: Add only the surface/schema stub and verify initial GREEN**

The module exports exist but proposal/validation functions throw `ValidationError`; no ranking exists yet.

- [x] **Step 3: Write behavioral RED tests**

Tests cover valid policy validation, closed-world rejection, deterministic explicit preferences, eligibility dominance, all-rejected behavior, code-unit tie-breaking, non-mutation, deep immutability, and no effect-bearing imports.

- [x] **Step 4: Verify behavioral RED**

Protected Clean Kernel observed 1,757 tests with 1,748 passing and 8 failures, all confined to the deliberately unimplemented policy/proposal behavior; documentation governance and the existing Mesh suite remained intact.

### Task 7: Implement deterministic recommendation evidence

**Files:**
- Modify: `mesh/src/lib/cognitive-selection-proposal.mjs`
- Complete: `mesh/config/cognitive-selection-policy-v0.schema.json`

**Interfaces:**
- Policy fields: `schema`, `version`, `status`, `policy_id`, `criteria`, `created_at`, plus fixed non-authority boundaries.
- Criterion fields supported in v0: `integration_class`, `deployment.locality`, `deployment.access_mode`, `data_policy.retention`, `data_policy.training_use`, `data_policy.exportability`, `economics.cost_class`, `economics.latency_class`, `economics.context_class`, `openness.weight_access`, `assurance.ceiling`.

- [x] **Step 1: Implement strict policy validation**

Each criterion must use a complete unique permutation of the closed enum for that field. Duplicate criterion fields, unknown fields, partial preference sets, invalid canonical timestamps, and boundary widening throw `ValidationError`.

- [x] **Step 2: Rank only candidates returned as eligible**

Call `evaluateCognitiveCandidates(candidates, request)` first. Map only `eligibility.eligible` IDs back to candidate profiles. Compare policy criteria in listed order; first unequal preference position decides. If all criteria tie, compare `profile_id` with raw `<`/`>` code-unit order.

- [x] **Step 3: Emit a frozen inert proposal report**

The report must include request/policy/eligibility digests, ranked candidate evidence, nullable recommendation identity/digest, `winner_selected: false`, `requires_gateway_authorization: true`, `execution_effect: none`, `authority_effect: none`, `network_effect: none`, `credential_visibility: none`, `runtime_activation: false`, and `selection_effect: proposal-only`.

- [x] **Step 4: Complete the JSON Schema mirror**

Use JSON Schema 2020-12, closed-world objects, fixed boundary constants, explicit criterion variants, semantic-validator metadata, and non-claims for invocation, egress, execution, authority, learned routing, and hidden scoring.

- [x] **Step 5: Verify GREEN**

Focused tests and the full protected suite passed without weakening eligibility or provider/runtime safeguards.

### Task 8: Review, verify, and integrate the exact head

**Files:**
- Review all changed files; add regression tests before any defect correction.

- [x] **Step 1: Review for determinism and authority leakage**

Checked for `localeCompare`, filesystem/network/subprocess imports, provider/runtime invocation, credential paths, hidden defaults, eligibility bypass, mutable nested evidence, and accidental winner semantics.

- [x] **Step 2: Run exact-head cross-platform verification**

Clean Kernel full suite and signed assurance chain, Node 22, container deny-egress/segmentation/failure isolation, Windows, macOS ARM, and macOS Intel passed on the verified head.

- [x] **Step 3: Merge only the verified head**

The known ready-for-review connector mutation failed, so the draft was closed without rewriting the branch and a non-draft replacement was opened from the same exact verified head, then merged with the expected-head guard.

- [x] **Step 4: Verify the resulting `main` merge commit**

Post-merge Clean Kernel, Node 22, container, Windows/macOS compatibility, and protected analysis contexts completed green before integration was claimed.

---

## Follow-on: Governed Cognitive Selection Authorization v0

This slice adds a narrow authority bridge after an inert recommendation. The governing doctrine is:

> **Eligibility establishes admissibility. Preference proposes an ordering. Gateway authority may authorize the proposed selection. Execution requires a separate fresh authority path.**

Selection authorization is intentionally not a provider call and not a transferable execution grant.

### Task 9: Bind an exact recommendation to the normal Gateway authority path

**Files:**
- Create: `mesh/src/lib/cognitive-selection-authorization.mjs`
- Modify: `mesh/config/policy.json`
- Modify: `mesh/src/sandbox/executor.mjs`
- Create: `mesh/test/cognitive-selection-authorization.test.mjs`

**Interfaces:**
- Action: `cognitive.selection.authorize`.
- Policy scope: `cognitive:select`.
- Tool: `builtin.cognitive-selection-authorize`.
- Gateway route: existing `intents.submit` / `POST /v1/intents` only.

- [x] **Step 1: Reject pre-authorized, widened, or recommendation-free proposals**

The authorization builder validates the exact inert proposal, requires rank-one recommendation binding, and rejects winner selection, runtime activation, provider egress, credential visibility, authority widening, or bypass of Gateway authorization.

- [x] **Step 2: Build only a normal Gateway intent**

The contract builds a standard `axiom-intent-request.v1` shape. It does not call PolicyEngine, Gateway, Hypervisor, Sandbox, Grid, a provider, a credential broker, or a runtime itself.

- [x] **Step 3: Add an output-only local Sandbox builtin**

`builtin.cognitive-selection-authorize` returns only a deterministic authorization-output object. It returns no Grid mutation/query, activates no runtime, exposes no credential, and invokes no cognitive provider.

- [x] **Step 4: Prove raw policy allow is insufficient**

A regression test demonstrates that `PolicyEngine.evaluate()` returning `allow: true` cannot be passed off as a completed cognitive selection authorization result.

### Task 10: Validate terminal authorization evidence without laundering it into execution authority

**Files:**
- Modify: `mesh/src/lib/cognitive-selection-authorization.mjs`
- Create: `mesh/test/cognitive-selection-authorization-e2e.test.mjs`
- Modify: `mesh/test/cognitive-selection-boundary-static.test.mjs`

- [x] **Step 1: Require completed Gateway result and exact Sandbox-output digest binding**

The validator requires terminal `status: completed`, exact authorization output fields, plan/invocation/capability-consumption/policy digests, and an `execution_digest` equal to the digest of the exact Sandbox output.

- [x] **Step 2: Match the real human/operator evidence contract**

Human/operator intent results do not serialize `effect_destination`; machine-principal results may do so. If present it must be exactly `local`. The authorization decision records `effect_destination: null` when the Gateway made no destination claim rather than inventing evidence.

- [x] **Step 3: Exercise the real four-service path**

Start the actual development Gateway, Hypervisor, Sandbox, and Grid; submit the authorization intent through `/v1/intents`; validate the returned terminal result; and prove the resulting decision authorizes selection only.

- [x] **Step 4: Pin the source boundary statically**

The authorization module may import only canonical helpers, the inert selection-proposal contract, and the Gateway client contract. It may not import I/O, provider/runtime, credential, wallet, secret, subprocess, or execution transport surfaces.

### Task 11: Preserve non-transferability and verify integration

- [ ] **Step 1: Document the decision as non-transferable authority evidence**

The completed decision is evidence that the normal Gateway authorized one exact proposed selection under the policy digest recorded in that intent. It is not a token, capability, credential, lease, runtime activation, or permission to invoke the selected provider/model later.

- [ ] **Step 2: Require fresh authorization for future cognitive execution**

Any future provider/model invocation must enter a separate fresh Gateway intent and independently re-evaluate current policy, principal authority, assurance, credentials, destination restrictions, runtime state, and other execution constraints. The selection decision cannot be replayed as a bearer grant.

- [ ] **Step 3: Review the exact PR diff**

Check action scope, policy risk, output-only Sandbox behavior, evidence binding, unknown-field rejection, static imports, non-transferability semantics, and absence of capability-registry/provider promotion.

- [ ] **Step 4: Run exact-head cross-platform verification**

Require Clean Kernel full suite and signed assurance chain, Node 22, container deny-egress/segmentation/failure isolation, Windows, macOS ARM, and macOS Intel.

- [ ] **Step 5: Merge only the verified exact head and verify `main`**

Use the expected-head guard. If the known draft-ready mutation fails, preserve the branch/head and use the same non-draft replacement-PR workaround. After merge, require post-merge protected workflows to pass before claiming integration complete.
