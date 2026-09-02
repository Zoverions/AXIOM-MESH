# Agent Improvement Experiment v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a non-production-reaching, local-verifiable experiment protocol that binds agent improvement proposals to evaluation evidence and derives promotion-request eligibility without applying changes.

**Architecture:** Add one focused pure library for proposal/evaluation/experiment/promotion-assessment objects, reusing canonical digests and the new subagent lineage record as provenance evidence. Keep all objects non-authorizing; persistent activation/training/model-weight application remain outside this slice.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, existing canonical JSON/digest utilities and agent lineage artifacts.

**Spec:** `docs/superpowers/specs/2026-09-01-agent-improvement-experiment-v0-design.md`

## Global Constraints

- `automatic_application=false` for every v0 assessment.
- `authority_effect=none`; no object in this protocol is a bearer capability.
- No Gateway, Sandbox, runtime-adapter or provider activation route is added.
- No model weights, adapters, prompts, memory policies, workflows, tools or runtime code are modified by the protocol.
- C4 (`training-data-pipeline`, `adapter-parameters`) and C5 (`model-weights`, `improvement-mechanism`) can be recorded/evaluated but can never become promotion-eligible in v0.
- Evaluator/reward mutation cannot be promotion-eligible when the candidate evaluator is the sole judge.
- C1+ requires rollback evidence.
- C2+ requires lineage-independent evidence unless a profile requirement is explicitly satisfiable by deterministic locally reproducible verification.
- Imported/popular evidence never grants installation authority.
- Unknown fields, digest mismatch, invalid timestamps, contradictory independence claims and semantic widening fail closed.
- Naming remains substrate-neutral and provisional branding is not introduced.
- Existing currentness, delegation and aggregate-budget controls remain unchanged.

---

### Task 1: Register the spec/plan and protect the documentation boundary

**Files:**
- Create: `docs/superpowers/specs/2026-09-01-agent-improvement-experiment-v0-design.md`
- Create: `docs/superpowers/plans/2026-09-01-agent-improvement-experiment-v0.md`
- Modify: `mesh/src/check-docs.mjs`

**Interfaces:**
- Consumes: current `CANONICAL_DOCUMENTS` boundary.
- Produces: both new Markdown paths as explicitly supported canonical documents.

- [ ] **Step 1: Add exactly the two new Markdown paths to `CANONICAL_DOCUMENTS`**

Add:

```js
'docs/superpowers/specs/2026-09-01-agent-improvement-experiment-v0-design.md',
'docs/superpowers/plans/2026-09-01-agent-improvement-experiment-v0.md',
```

Do not add required-content assertions unless repository checks reveal an existing policy that requires them.

- [ ] **Step 2: Run documentation verification**

```bash
cd mesh && node src/check-docs.mjs
```

Expected: exit 0 with no repository Markdown-boundary drift.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-01-agent-improvement-experiment-v0-design.md docs/superpowers/plans/2026-09-01-agent-improvement-experiment-v0.md mesh/src/check-docs.mjs
git commit -m "docs: register agent improvement experiment design"
```

### Task 2: RED — define the improvement proposal contract

**Files:**
- Create: `mesh/test/agent-improvement-experiment.test.mjs`
- Create later: `mesh/src/lib/agent-improvement-experiment.mjs`

**Interfaces:**
- Produces expected exports:
  - `IMPROVEMENT_PROPOSAL_SCHEMA`
  - `IMPROVEMENT_EVALUATION_SCHEMA`
  - `IMPROVEMENT_EXPERIMENT_SCHEMA`
  - `IMPROVEMENT_PROMOTION_ASSESSMENT_SCHEMA`
  - `normalizeImprovementProposal(raw, options)`
  - `normalizeImprovementEvaluation(raw, options)`
  - `createImprovementExperiment(args)`
  - `assessImprovementPromotion(args)`

- [ ] **Step 1: Write a failing C0 proposal test**

Create a retrieval/context proposal with different baseline/candidate digests, exact objective/evaluator-definition digests, bounded experiment resources, C0 consequence, no rollback requirement and fixed non-authorizing semantics.

Assert:

```js
assert.equal(proposal.schema, 'axiom-agent-improvement-proposal.v1');
assert.equal(proposal.target_surface, 'retrieval-context');
assert.equal(proposal.consequence_class, 'C0');
assert.equal(proposal.semantics.authority_effect, 'none');
assert.equal(proposal.semantics.automatic_application, false);
assert.match(proposal.proposal_digest, /^[a-f0-9]{64}$/);
```

- [ ] **Step 2: Write failing strictness tests**

Reject:
- identical baseline/candidate digest when mutation is claimed;
- unsupported target surface;
- target-surface/consequence mismatch below the minimum class;
- missing rollback for C1+;
- expired proposal;
- non-canonical timestamps;
- unknown fields;
- zero/negative/out-of-range resource ceilings;
- `automatic_application=true` or any authority/training/runtime effect.

- [ ] **Step 3: Verify RED**

```bash
cd mesh && node --test test/agent-improvement-experiment.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` for `agent-improvement-experiment.mjs`.

- [ ] **Step 4: Commit the RED contract test**

```bash
git add mesh/test/agent-improvement-experiment.test.mjs
git commit -m "test: define agent improvement experiment contract"
```

### Task 3: GREEN — implement canonical improvement proposals

**Files:**
- Create: `mesh/src/lib/agent-improvement-experiment.mjs`
- Modify: `mesh/test/agent-improvement-experiment.test.mjs`

**Interfaces:**
- Produces `normalizeImprovementProposal(raw, { now })`.

- [ ] **Step 1: Implement exact-field proposal normalization**

Use the existing canonical helpers. Enforce the exact surface taxonomy:

```text
retrieval-context
memory-policy
prompt-instructions
routing-selection
workflow-topology
skill-tool
runtime-scaffolding-code
evaluator-reward
training-data-pipeline
adapter-parameters
model-weights
improvement-mechanism
```

Enforce the minimum consequence mapping defined in the spec and fixed semantics.

- [ ] **Step 2: Bind optional origin lineage**

Proposal origin must contain either an explicit principal ID or an origin lineage record digest; when both exist, preserve both. No origin field can imply trust or authority.

- [ ] **Step 3: Run targeted tests**

```bash
cd mesh && node --test test/agent-improvement-experiment.test.mjs
```

Expected: all proposal tests PASS.

- [ ] **Step 4: Commit**

```bash
git add mesh/src/lib/agent-improvement-experiment.mjs mesh/test/agent-improvement-experiment.test.mjs
git commit -m "feat: normalize bounded improvement proposals"
```

### Task 4: RED/GREEN — evaluation attestations and independence facts

**Files:**
- Modify: `mesh/src/lib/agent-improvement-experiment.mjs`
- Modify: `mesh/test/agent-improvement-experiment.test.mjs`

**Interfaces:**
- Produces `normalizeImprovementEvaluation(raw, { proposal, knownLineageRelations })`.

- [ ] **Step 1: Add RED evaluation tests**

Cover:
- proposal digest binding;
- evaluator ID and optional lineage digest;
- evaluator model/runtime/provider family identifiers;
- evaluator-definition and benchmark/test-corpus digests;
- deterministic-verifier flag/evidence digest;
- metrics and verdict;
- regression evidence;
- independence facts.

- [ ] **Step 2: Add RED anti-fraud tests**

Reject:
- proposal digest mismatch;
- duplicate/unsorted metric IDs;
- evaluation outside proposal validity;
- `same_lineage=false` when a supplied known lineage relation says true;
- deterministic verifier without deterministic evidence digest;
- changed fixed semantics;
- unsupported verdict.

- [ ] **Step 3: Verify RED**

Run the targeted test and confirm failures are for missing evaluation behavior.

- [ ] **Step 4: Implement evaluation normalization**

Keep independence dimensions explicit. Do not derive a global trust score.

- [ ] **Step 5: Verify GREEN**

Run the targeted test; expected PASS.

- [ ] **Step 6: Commit**

```bash
git add mesh/src/lib/agent-improvement-experiment.mjs mesh/test/agent-improvement-experiment.test.mjs
git commit -m "feat: bind improvement evaluation evidence"
```

### Task 5: RED/GREEN — experiment archive record

**Files:**
- Modify: `mesh/src/lib/agent-improvement-experiment.mjs`
- Modify: `mesh/test/agent-improvement-experiment.test.mjs`

**Interfaces:**
- Produces `createImprovementExperiment({ proposal, evaluations, predecessors, status })`.

- [ ] **Step 1: Add RED canonical experiment tests**

Assert deterministic aggregation of:
- unique evaluation IDs;
- evaluator principal count;
- lineage-independent count;
- model-family diversity;
- runtime/provider diversity;
- deterministic-verifier count;
- positive/negative/mixed verdict counts;
- regression count.

- [ ] **Step 2: Add RED archive-integrity tests**

Reject duplicate evaluations, omitted negative evidence from a supplied canonical evaluation set, duplicate predecessor digests, self-predecessor cycles, and experiment status inconsistent with evaluation presence.

- [ ] **Step 3: Implement deterministic aggregation**

Sort evaluations and predecessor digests canonically before hashing. Preserve all bound negative/regression evidence.

- [ ] **Step 4: Verify GREEN**

Run targeted test; expected PASS.

- [ ] **Step 5: Commit**

```bash
git add mesh/src/lib/agent-improvement-experiment.mjs mesh/test/agent-improvement-experiment.test.mjs
git commit -m "feat: create immutable improvement experiment records"
```

### Task 6: RED/GREEN — promotion-request eligibility

**Files:**
- Modify: `mesh/src/lib/agent-improvement-experiment.mjs`
- Modify: `mesh/test/agent-improvement-experiment.test.mjs`

**Interfaces:**
- Produces `assessImprovementPromotion({ experiment, profileOverrides })` returning evidence-only assessment.

- [ ] **Step 1: Add RED consequence-profile tests**

Required behavior:

```text
C0: reproducible evaluation may be sufficient.
C1: rollback + at least one origin-lineage-independent evaluation or explicitly sufficient deterministic verifier.
C2: rollback + lineage-independent evaluation + second independent source or critical deterministic verifier evidence.
C3: prior/independent evaluator evidence required; candidate evaluator cannot be sole judge.
C4: always promotion-ineligible in v0.
C5: always promotion-ineligible in v0.
```

- [ ] **Step 2: Add RED self-certification tests**

A C2 candidate with ten evaluations from descendants of the same origin lineage must remain insufficient. Changing principal IDs alone must not create independence.

- [ ] **Step 3: Add RED evaluator-mutation tests**

For `target_surface=evaluator-reward`, reject eligibility when all positive evaluation evidence uses the candidate evaluator-definition digest. Require an independently defined evaluator/oracle or deterministic evidence bound to the prior evaluator/test definition.

- [ ] **Step 4: Add RED semantics tests**

Assessment must always report:

```js
authority_effect: 'none'
automatic_application: false
promotion_authorized: false
```

- [ ] **Step 5: Implement profile evaluation**

Return `eligible`, `ineligible`, or `insufficient-evidence` plus sorted reason codes and achieved/required evidence facts.

- [ ] **Step 6: Verify GREEN**

Run targeted test; expected PASS.

- [ ] **Step 7: Commit**

```bash
git add mesh/src/lib/agent-improvement-experiment.mjs mesh/test/agent-improvement-experiment.test.mjs
git commit -m "feat: assess evidence-only improvement promotion eligibility"
```

### Task 7: Bind spawned-agent experiment budgets without granting authority

**Files:**
- Modify: `mesh/src/lib/agent-improvement-experiment.mjs`
- Modify: `mesh/test/agent-improvement-experiment.test.mjs`

**Interfaces:**
- Consumes optional `axiom-subagent-lineage-record.v1` evidence facts plus explicit experiment resource ceiling.
- Produces fail-closed compatibility result inside proposal normalization/experiment creation.

- [ ] **Step 1: Add RED lineage-budget tests**

When a proposal binds lineage/budget evidence, reject declared experiment child/cost/wall-clock ceilings that exceed the supplied bounded evidence. Do not interpret lineage evidence itself as execution permission.

- [ ] **Step 2: Add RED absence test**

A proposal without lineage evidence may still be normalized as inert evidence, but it must not claim lineage verification or spawn authorization.

- [ ] **Step 3: Implement budget compatibility**

Use only explicit numeric ceilings; do not infer missing budgets from reputation, principal name, or task class.

- [ ] **Step 4: Verify GREEN**

Run targeted test; expected PASS.

- [ ] **Step 5: Commit**

```bash
git add mesh/src/lib/agent-improvement-experiment.mjs mesh/test/agent-improvement-experiment.test.mjs
git commit -m "feat: bind improvement experiments to bounded lineage resources"
```

### Task 8: Repository-wide verification and non-promotion audit

**Files:**
- Modify only files required by current repository checks.
- Do not add a Gateway route or supported capability-registry promotion.

**Interfaces:**
- Consumes all previous tasks.
- Produces a stack-ready experimental branch with verified non-authorizing semantics.

- [ ] **Step 1: Run targeted test**

```bash
cd mesh && node --test --test-reporter=spec test/agent-improvement-experiment.test.mjs
```

Expected: PASS with zero failures.

- [ ] **Step 2: Run full kernel tests/checks**

```bash
cd mesh && npm run check
```

Expected: PASS.

- [ ] **Step 3: Run release verification**

```bash
cd mesh && npm run release:verify
```

Expected: PASS without adding production reachability.

- [ ] **Step 4: Inspect diff for prohibited widening**

Confirm:

```text
no Gateway route
no runtime activation route
no provider/model write path
no capability promotion caused solely by inert source/tests
no automatic application
no C4/C5 promotion eligibility
no machine-principal v1 delegation change
```

- [ ] **Step 5: Open a draft stacked PR against `feat/recursive-agent-lineage-convergence`**

The PR must identify itself as stacked and preserve the non-authorizing boundary until the base convergence lands.
