# Cognitive Selection Proposals v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic, policy-bounded recommendation evidence over already-eligible cognitive resources without granting execution, provider access, runtime activation, or authority.

**Architecture:** Keep `evaluateCognitiveCandidates()` as the neutral hard-constraint filter. Add a separate pure selection-proposal module that validates an explicit ordered preference policy, recomputes eligibility internally, ranks only eligible profiles, and emits a content-addressable recommendation report. Recommendation remains evidence only: no final winner is selected and no provider/runtime action is reachable from this module.

**Tech Stack:** Node.js 24.18.0 primary CI, Node.js 22 compatibility lane, ESM, built-in `node:test`, existing AXIOM canonical JSON/digest and validation primitives, JSON Schema 2020-12.

**Spec:** `docs/superpowers/specs/2026-08-30-sovereign-intelligence-selection-v0-design.md`

## Global Constraints

- `mesh/config/capabilities.json` remains authoritative.
- `ai.providers` remains `adapter_required`.
- Eligibility constraints are evaluated before any recommendation criterion.
- No model invocation, provider egress, credential access, credential brokerage, runtime activation, authority grant, capability promotion, or execution effect.
- No hidden weights, learned scores, provider defaults, or ambient preferences in v0.
- Every ranking criterion uses an explicit full preference ordering over its closed enum.
- `profile_id` raw JavaScript string code-unit order is the mandatory final tie-break; `localeCompare()` is forbidden for evidence ordering.
- Unknown fields, duplicate criteria, incomplete preference sets, duplicate preference values, invalid timestamps, and boundary widening fail closed.
- All outputs and nested ranking evidence are immutable.

---

### Task 1: Establish the selection-proposal surface

**Files:**
- Create: `mesh/src/lib/cognitive-selection-proposal.mjs`
- Create: `mesh/config/cognitive-selection-policy-v0.schema.json`
- Test: `mesh/test/cognitive-selection-proposal.test.mjs`

**Interfaces:**
- Produces: `COGNITIVE_SELECTION_POLICY_SCHEMA`, `validateCognitiveSelectionPolicy(policy)`, `proposeCognitiveSelection(candidates, request, policy)`.

- [x] **Step 1: Write the failing surface test**

```js
assert.equal(selection.COGNITIVE_SELECTION_POLICY_SCHEMA, 'axiom-cognitive-selection-policy.v0');
assert.equal(typeof selection.validateCognitiveSelectionPolicy, 'function');
assert.equal(typeof selection.proposeCognitiveSelection, 'function');
```

- [x] **Step 2: Run the protected test suite and verify RED**

Run through Clean Kernel CI. Expected: exactly the new surface test fails with `ERR_MODULE_NOT_FOUND`; existing tests remain green.

- [x] **Step 3: Add only the module exports and schema identity**

The exported functions deliberately throw `ValidationError` until behavioral tests exist.

- [ ] **Step 4: Verify the surface-only test is GREEN**

Run: `node --test test/cognitive-selection-proposal.test.mjs` from `mesh/`, plus protected Clean Kernel CI.
Expected: surface test passes while no ranking behavior exists.

### Task 2: Define and validate explicit selection policy

**Files:**
- Modify: `mesh/test/cognitive-selection-proposal.test.mjs`
- Modify: `mesh/src/lib/cognitive-selection-proposal.mjs`
- Replace/complete: `mesh/config/cognitive-selection-policy-v0.schema.json`

**Interfaces:**
- Consumes: AXIOM identifier/timestamp/digest conventions.
- Produces: validated policy with fields `schema`, `version`, `status`, `policy_id`, `criteria`, `created_at`, and fixed non-authority boundary fields.

- [ ] **Step 1: Write failing semantic-policy tests**

Use a valid policy such as:

```js
{
  schema: 'axiom-cognitive-selection-policy.v0',
  version: 0,
  status: 'inert-selection-policy',
  policy_id: 'selection.example.sovereign',
  criteria: [
    {
      field: 'assurance.ceiling',
      preference: ['hardware-rooted', 'cryptographic', 'behavioral', 'self-asserted', 'none']
    },
    {
      field: 'economics.cost_class',
      preference: ['none', 'low', 'medium', 'high', 'unknown']
    }
  ],
  created_at: '2026-08-30T04:10:00.000Z',
  authority_effect: 'none',
  network_effect: 'none',
  credential_visibility: 'none',
  runtime_activation: false,
  selection_effect: 'proposal-only'
}
```

Tests must reject unknown policy fields, unknown criterion fields, duplicate criterion fields, incomplete preference lists, duplicate preference values, invalid enum values, noncanonical timestamps, and every widened boundary field.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/cognitive-selection-proposal.test.mjs` from `mesh/`.
Expected: policy tests fail because validator is intentionally unimplemented.

- [ ] **Step 3: Implement the minimum closed-world policy validator**

Supported v0 criterion fields are exactly:

```text
integration_class
deployment.locality
deployment.access_mode
data_policy.retention
data_policy.training_use
data_policy.exportability
economics.cost_class
economics.latency_class
economics.context_class
openness.weight_access
assurance.ceiling
```

Each preference array must be a full permutation of that field's allowed enum. `validateCognitiveSelectionPolicy()` returns a frozen summary containing `policy_id`, `policy_digest`, and fixed non-authority boundary fields.

- [ ] **Step 4: Complete the JSON Schema mirror**

The schema must be closed-world, identify the semantic validator, encode the fixed boundary constants, and state non-claims for execution, provider access, model invocation, and authority.

- [ ] **Step 5: Run focused tests and commit GREEN**

Run: `node --test test/cognitive-selection-proposal.test.mjs`.
Expected: policy validation cases pass; proposal behavior may still fail or remain untested.

### Task 3: Build deterministic recommendation evidence

**Files:**
- Modify: `mesh/test/cognitive-selection-proposal.test.mjs`
- Modify: `mesh/src/lib/cognitive-selection-proposal.mjs`

**Interfaces:**
- Consumes: `evaluateCognitiveCandidates(candidates, request)` from `cognitive-capability-profile.mjs` and a validated selection policy.
- Produces: `axiom-cognitive-selection-proposal.v0` report containing eligibility binding, ordered candidate evidence, and a non-authorizing recommendation.

- [ ] **Step 1: Write failing ranking tests**

Cover all of these cases:

```text
explicit criteria deterministically rank two eligible candidates
reversing an explicit preference reverses the recommendation
an eligibility-rejected candidate can never enter ranked_candidates
all candidates rejected produces no recommendation
profile_id code-unit order breaks complete criterion ties
frozen inputs are not mutated and nested output is frozen
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/cognitive-selection-proposal.test.mjs`.
Expected: proposal tests fail because builder remains unimplemented.

- [ ] **Step 3: Implement ranking only after eligibility**

`proposeCognitiveSelection()` must call `evaluateCognitiveCandidates()` first, map only `eligibility.eligible` profile IDs back to validated candidate profiles, then compare explicit policy criteria in order. The first non-equal preference index decides order; if every criterion ties, compare `profile_id` with `<` and `>`.

- [ ] **Step 4: Emit an inert proposal report**

The report must include exact request/policy/eligibility digests, ranked candidate evidence, nullable recommendation fields, and these fixed boundaries:

```js
{
  winner_selected: false,
  requires_gateway_authorization: true,
  execution_effect: 'none',
  authority_effect: 'none',
  network_effect: 'none',
  credential_visibility: 'none',
  runtime_activation: false,
  selection_effect: 'proposal-only'
}
```

No eligible candidates means `recommendation_made: false` and null recommendation identity/digest; constraints are never widened to manufacture a candidate.

- [ ] **Step 5: Run focused and full kernel tests**

Run focused test, then protected Clean Kernel CI. Expected: all tests green.

### Task 4: Review, cross-platform verify, and integrate

**Files:**
- Review all files changed by the feature branch.
- Modify tests first if review uncovers a defect.

**Interfaces:**
- Produces: a mergeable exact-head PR with evidence that recommendation remains non-authorizing.

- [ ] **Step 1: Review the complete PR diff for authority or determinism leakage**

Check specifically for `localeCompare`, network/process/filesystem imports in production source, credential access paths, runtime/provider invocation, hidden scoring defaults, eligibility bypass, and mutable output.

- [ ] **Step 2: Add a RED regression before any review fix**

Any discovered defect must first receive a failing test that isolates the defect, then the minimum production correction.

- [ ] **Step 3: Run exact-head protected verification**

Required green lanes: Clean Kernel full test suite and signed assurance chain, Node 22 compatibility, container deny-egress/network segmentation/failure isolation, Windows, macOS 15 ARM, and macOS 15 Intel.

- [ ] **Step 4: Integrate only the verified head**

Merge with GitHub's expected-head SHA guard. If the known ready-for-review connector mutation still fails, close the draft without rewriting its branch and open a non-draft replacement from the same exact head before merging.

- [ ] **Step 5: Verify the resulting `main` merge commit**

Confirm merged files on `main` and require the post-merge Clean Kernel and Windows/macOS compatibility workflows to finish green before claiming integration complete.
