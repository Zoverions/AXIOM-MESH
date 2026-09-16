# Replay-Grounded Self-Improvement Core v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the inert Replay Core v0: strict content-addressed discovery traces, replay worlds, exploration-policy and objective manifests, deterministic prefix-only replay, replay-world pools, and policy-evaluation evidence. The result must make historical exploration executable as bounded evidence without executing arbitrary candidate policy code or adding any live self-improvement authority.

**Architecture:** Keep the replay core pure and effect-inert inside `mesh/src/lib/`. Historical attempts are captured as a rooted replay-causal tree. A replay world exposes only the currently revealed prefix. The engine consumes caller-supplied decision scripts representing trusted fixture-policy output; it never imports or executes candidate artifacts. Pool and evaluation contracts bind exact worlds, objectives, policies, baseline comparisons, currentness dispositions, and sealed-holdout roles. All artifacts remain non-authorizing and reuse the existing canonical JSON/digest primitives.

**Tech Stack:** Node.js ESM on the protected AXIOM kernel runtime, built-in `node:test` / `node:assert`, existing `mesh/src/lib/canonical.mjs`, strict JSON Schema Draft 2020-12 mirrors, current canonical-document verifier, no new runtime dependency.

**Spec:** `docs/superpowers/specs/2026-09-16-replay-grounded-self-improvement-design.md`

## Global Constraints

- `mesh/config/capabilities.json` is unchanged by this plan.
- No Gateway, Hypervisor, Sandbox, Grid, policy, credential, provider, network, filesystem-effect, deployment, merge, or production-promotion path is added.
- No model/provider call occurs in replay validation or replay execution.
- No TypeSafe/Jev integration is part of Replay Core v0. Semantic annotations remain a separately reviewed follow-on adapter.
- No arbitrary candidate code is executed. Replay Core v0 consumes deterministic decision records only.
- Node `vm` is not used as a containment boundary.
- No generic improvement/promotion protocol is duplicated. PR #1455 remains unmerged provenance unless repository convergence later promotes an equivalent canonical layer.
- No recursive subagent work from PR #1451 is required by this plan.
- Canonical serialization and hashing use `canonicalJson()` / `digestObject()` from `mesh/src/lib/canonical.mjs`; do not invent a replay-specific canonicalizer.
- Every durable replay contract is strict, closed-world, content-addressable, and rejects unknown fields.
- Every durable replay artifact hard-codes non-authorizing semantics. At minimum: `authority_effect: 'none'`, `network_effect: 'none'`, `runtime_activation: false`, and `production_promotion: false` where applicable.
- Discovery/replay evidence may contain references and digests to private artifacts but must not require raw chain-of-thought, credentials, provider tokens, raw hidden-state tensors, reconstructive embeddings, or unrelated workspace contents.
- Replay never fabricates an unobserved branch. An unknown continuation is `out-of-support`; a known descendant requested before its parent is revealed is an invalid prefix-leak attempt.
- The first engine comparison mode is deliberately **lexicographic only**. This is a YAGNI restriction of Replay Core v0, not a claim that Pareto or weighted objectives are invalid. A future contract version may add them explicitly rather than hiding compensation semantics in v0.
- Hard constraints are evaluated before optimization. A candidate cannot trade performance for a safety, support-boundary, or resource-envelope violation.
- All tests use explicit timestamps. Production modules do not call `Date.now()` or read ambient wall clock.
- Full completion still requires the repository checks required by `CONTRIBUTING.md`: `npm run check` and `npm run release:verify` from the appropriate repository/root package context, plus the protected cross-platform workflows before any merge-readiness claim.

---

## File Map

**Create — production modules**

- `mesh/src/lib/replay-grounded-common.mjs` — shared strict validators and deep-freeze helper for replay contracts.
- `mesh/src/lib/discovery-trace.mjs` — `axiom-discovery-trace.v0` semantic validator, digest, and deterministic summary.
- `mesh/src/lib/replay-world.mjs` — `axiom-replay-world.v0` validator, digest, and exact trace resolver/index.
- `mesh/src/lib/exploration-policy.mjs` — `axiom-exploration-policy.v0` manifest validator/digest only; no policy execution.
- `mesh/src/lib/replay-objective.mjs` — `axiom-replay-objective.v0` validator/digest and lexicographic metric comparison helper.
- `mesh/src/lib/replay-engine.mjs` — prefix-only deterministic replay of caller-supplied decision records; no arbitrary-code runner.
- `mesh/src/lib/replay-world-pool.mjs` — `axiom-replay-world-pool.v0` validator/digest, exact world resolution, split-overlap rejection, and development-view gate.
- `mesh/src/lib/replay-policy-evaluation.mjs` — `axiom-replay-policy-evaluation.v0` validator/digest and deterministic candidate-vs-baseline derivation over exact replay run results.

**Create — JSON Schema mirrors**

- `docs/architecture/contracts/discovery-trace.v0.schema.json`
- `docs/architecture/contracts/replay-world.v0.schema.json`
- `docs/architecture/contracts/exploration-policy.v0.schema.json`
- `docs/architecture/contracts/replay-objective.v0.schema.json`
- `docs/architecture/contracts/replay-world-pool.v0.schema.json`
- `docs/architecture/contracts/replay-policy-evaluation.v0.schema.json`

**Create — tests/fixtures**

- `mesh/test/fixtures/replay-grounded-fixtures.mjs`
- `mesh/test/discovery-trace.test.mjs`
- `mesh/test/replay-world.test.mjs`
- `mesh/test/replay-policy-contracts.test.mjs`
- `mesh/test/replay-engine.test.mjs`
- `mesh/test/replay-world-pool.test.mjs`
- `mesh/test/replay-policy-evaluation.test.mjs`
- `mesh/test/replay-schema-parity.test.mjs`
- `mesh/test/replay-boundary-static.test.mjs`

**Modify**

- `docs/superpowers/specs/2026-09-16-replay-grounded-self-improvement-design.md` — change status from pending review to approved architectural design; do not claim implementation before verification.
- `mesh/src/check-docs.mjs` — register the approved spec, this implementation plan, and the six new contract schemas in the closed canonical-document boundary with exact required-content assertions.

**Must remain unchanged**

- `mesh/config/capabilities.json`
- Gateway/Hypervisor/Sandbox/Grid effect-path code
- production policy and service-network policy
- runtime/provider activation paths

---

## Common Contract Vocabulary

Use the following exact v0 identifiers:

```js
export const DISCOVERY_TRACE_SCHEMA = 'axiom-discovery-trace.v0';
export const REPLAY_WORLD_SCHEMA = 'axiom-replay-world.v0';
export const EXPLORATION_POLICY_SCHEMA = 'axiom-exploration-policy.v0';
export const REPLAY_OBJECTIVE_SCHEMA = 'axiom-replay-objective.v0';
export const REPLAY_WORLD_POOL_SCHEMA = 'axiom-replay-world-pool.v0';
export const REPLAY_POLICY_EVALUATION_SCHEMA = 'axiom-replay-policy-evaluation.v0';
export const REPLAY_RUN_RESULT_SCHEMA = 'axiom-replay-run-result.v0';
export const REPLAY_POLICY_INTERFACE = 'axiom-replay-policy-interface.v0';
export const REPLAY_OBSERVATION_SCHEMA = 'axiom-replay-observation.v0';
```

Use lowercase 64-character SHA-256 digests throughout. Timestamps are canonical UTC instants ending in `Z` and must round-trip through `new Date(value).toISOString() === value` without consulting the current clock.

Common effect fields use these exact values:

```js
{
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false,
  production_promotion: false
}
```

`replay-grounded-common.mjs` should expose only deterministic helpers:

```js
export function assertExactKeys(value, expectedKeys, name) {}
export function assertSha256(value, name) {}
export function assertCanonicalInstant(value, name) {}
export function assertSafeNonNegativeInteger(value, name) {}
export function assertSafePositiveInteger(value, name) {}
export function assertBoundedId(value, name) {}
export function deepFreezeJson(value) {}
```

`assertExactKeys` must compare own enumerable string keys as a set and reject missing/extra keys. `deepFreezeJson` is for already validated plain JSON data and recursively freezes arrays/records without invoking accessors.

---

### Task 1: Register the approved design/plan and lock the documentation boundary

**Files:**
- Modify: `docs/superpowers/specs/2026-09-16-replay-grounded-self-improvement-design.md`
- Modify: `mesh/src/check-docs.mjs`
- Existing: `docs/superpowers/plans/2026-09-16-replay-grounded-self-improvement-core-v0.md`

- [ ] **Step 1: Witness the current documentation RED**

From the repository root, run:

```bash
node mesh/src/check-docs.mjs
```

Expected: fail because the approved replay design/plan are not yet admitted to the closed canonical Markdown inventory. Record the exact failure; do not weaken `check-docs` or broaden its directory rules.

- [ ] **Step 2: Update only the design status line**

Change:

```md
**Status:** design direction approved in chat; written specification pending user review; implementation not started
```

to:

```md
**Status:** approved architectural design; Replay Core v0 implementation plan approved for execution only after plan review; implementation not yet verified
```

If implementation execution begins immediately after plan approval, preserve the phrase `implementation not yet verified` until executable evidence exists.

- [ ] **Step 3: Register exact replay documents in `check-docs.mjs`**

Add exact canonical paths for:

```text
docs/superpowers/specs/2026-09-16-replay-grounded-self-improvement-design.md
docs/superpowers/plans/2026-09-16-replay-grounded-self-improvement-core-v0.md
```

Add required-content assertions that lock at least these design invariants:

```text
Replay improvement is evidence for a promotion request, never authority to self-promote.
prefix-only
out-of-support
Improve the search. Preserve the evidence. Hold the authority boundary.
```

Do not register wildcard paths.

- [ ] **Step 4: Re-run the focused documentation check**

```bash
node mesh/src/check-docs.mjs
```

Expected: pass for the current two replay Markdown documents. No claim is made yet about the later schema paths.

- [ ] **Step 5: Commit the documentation gate**

```bash
git add docs/superpowers/specs/2026-09-16-replay-grounded-self-improvement-design.md \
  docs/superpowers/plans/2026-09-16-replay-grounded-self-improvement-core-v0.md \
  mesh/src/check-docs.mjs
git commit -m "docs: approve replay-grounded self-improvement plan"
```

---

### Task 2: Implement Discovery Trace v0 as strict inert evidence

**Files:**
- Create: `mesh/src/lib/replay-grounded-common.mjs`
- Create: `mesh/src/lib/discovery-trace.mjs`
- Create: `mesh/test/fixtures/replay-grounded-fixtures.mjs`
- Create: `mesh/test/discovery-trace.test.mjs`

#### Contract shape

A valid trace has this exact top-level shape:

```js
{
  schema: 'axiom-discovery-trace.v0',
  status: 'inert-evidence',
  trace_id: 'trace.example',
  domain: 'coding',
  task_definition: { ref: 'task.example', digest: '<sha256>' },
  root_state: { node_id: 'root', state_ref: 'state.root', state_digest: '<sha256>' },
  online_policy: { policy_id: 'policy.baseline', artifact_digest: '<sha256>' },
  evaluator: { evaluator_id: 'eval.example', evaluator_digest: '<sha256>' },
  objective: { objective_id: 'objective.example', objective_digest: '<sha256>' },
  environment: { runtime_ref: 'runtime.node24', runtime_digest: '<sha256>' },
  resource_envelope: null,
  started_at: '2026-09-16T12:00:00.000Z',
  ended_at: '2026-09-16T12:05:00.000Z',
  privacy_class: 'owner-private',
  nodes: [],
  contains_secret_material: false,
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false,
  production_promotion: false
}
```

Each attempt node uses this exact v0 shape:

```js
{
  node_id: 'n1',
  primary_parent_id: 'root',
  creation_ordinal: 1,
  prefix_state_digest: '<sha256>',
  attempt_digest: '<sha256>',
  state_snapshot: { ref: 'snapshot.n1', digest: '<sha256>' },
  candidate_artifact: { ref: 'candidate.n1', digest: '<sha256>' },
  evaluator_result: {
    ref: 'evaluation.n1',
    digest: '<sha256>',
    quality: { value: 730000, scale: 1000000 }
  },
  diagnostics: { ref: 'diagnostics.n1', digest: '<sha256>' },
  resources: {
    generation_calls: 1,
    evaluation_calls: 1,
    token_or_cost_units: 100,
    wall_clock_ms: 500,
    storage_bytes: 2048,
    worker_slots: 1,
    external_effects: 0
  },
  runtime: {
    runtime_ref: 'runtime.node24',
    model_ref: 'model.fixture',
    provider_ref: 'provider.fixture'
  },
  tool_capability_ids: ['tool.test'],
  receipt_refs: [],
  started_at: '2026-09-16T12:00:10.000Z',
  ended_at: '2026-09-16T12:00:20.000Z',
  termination: 'completed'
}
```

Closed vocabularies:

```text
privacy_class = public | owner-private | restricted
termination = completed | failed | cancelled | budget-exhausted | unsupported
```

Core v0 requires `resources.external_effects === 0`. A trace that observed an external effect is valid historical evidence in principle but outside Replay Core v0 and must fail this contract rather than be silently normalized into the zero-effect laboratory.

Tree rules:

- `root_state.node_id` is unique and may not equal any attempt `node_id`.
- `creation_ordinal` is exactly contiguous `1..N`, and `nodes` are stored in that order.
- each `primary_parent_id` is either the root node or a node with a lower creation ordinal;
- therefore cycles and forward-parent references fail closed;
- duplicate node IDs fail closed;
- child ordering derives only from creation ordinal, never object-key ordering;
- `started_at <= ended_at` at trace and node level;
- each node time interval is inside the trace interval;
- quality `scale` is a positive safe integer and `value` is a safe integer with `0 <= value <= scale`.

- [ ] **Step 1: Write the failing trace tests and fixture factory**

`mesh/test/fixtures/replay-grounded-fixtures.mjs` must export deterministic helpers such as:

```js
export const H = 'a'.repeat(64);
export function makeDiscoveryTrace(overrides = {}) { /* return fresh plain JSON */ }
export function makeTraceNode(overrides = {}) { /* return fresh plain JSON */ }
```

Do not reuse mutable fixture objects between tests.

`mesh/test/discovery-trace.test.mjs` must cover, at minimum:

```js
test('valid discovery trace is deterministic and non-authorizing', () => {});
test('unknown trace and node fields fail closed', () => {});
test('duplicate node ids and ordinals fail closed', () => {});
test('forward parent and replay-causal cycle fail closed', () => {});
test('non-contiguous or reordered creation ordinals fail closed', () => {});
test('digest or identifier substitution changes the trace digest', () => {});
test('non-canonical timestamps and inverted chronology fail closed', () => {});
test('nonzero external effects fail Replay Core v0', () => {});
test('credential-like durable payload fields cannot be added through unknown fields', () => {});
test('inputs remain unmodified and validated output is deeply frozen', () => {});
```

- [ ] **Step 2: Run RED**

```bash
node --test mesh/test/discovery-trace.test.mjs
```

Expected: fail with `ERR_MODULE_NOT_FOUND` for `mesh/src/lib/discovery-trace.mjs` or equivalent missing export.

- [ ] **Step 3: Implement shared strict helpers and Discovery Trace**

`discovery-trace.mjs` exports exactly:

```js
export const DISCOVERY_TRACE_SCHEMA = 'axiom-discovery-trace.v0';
export function validateDiscoveryTrace(input) {}
export function digestDiscoveryTrace(input) {}
export function summarizeDiscoveryTrace(input) {}
```

Implementation rules:

- call `assertExactKeys` at every nested record;
- use existing `digestObject()` after semantic validation;
- never call the filesystem, network, subprocess APIs, environment variables, or wall clock;
- return a new deeply frozen validated object rather than mutating input;
- `digestDiscoveryTrace()` validates first and hashes the validated canonical object;
- `summarizeDiscoveryTrace()` returns only IDs/digests, node count, termination counts, total recorded resources, quality min/max where present, privacy class, and hard non-authority values; it must not echo raw refs beyond the bounded IDs already in the contract.

- [ ] **Step 4: Run GREEN**

```bash
node --test mesh/test/discovery-trace.test.mjs
```

Expected: all focused trace tests pass.

- [ ] **Step 5: Commit**

```bash
git add mesh/src/lib/replay-grounded-common.mjs \
  mesh/src/lib/discovery-trace.mjs \
  mesh/test/fixtures/replay-grounded-fixtures.mjs \
  mesh/test/discovery-trace.test.mjs
git commit -m "feat: add inert discovery trace v0"
```

---

### Task 3: Implement Replay World v0 and exact prefix support

**Files:**
- Create: `mesh/src/lib/replay-world.mjs`
- Create: `mesh/test/replay-world.test.mjs`
- Modify: `mesh/test/fixtures/replay-grounded-fixtures.mjs`

#### Contract shape

```js
{
  schema: 'axiom-replay-world.v0',
  status: 'inert-replay-world',
  world_id: 'world.example',
  trace_id: 'trace.example',
  trace_digest: '<sha256>',
  compiler: {
    compiler_id: 'axiom-replay-world-compiler.v0',
    compiler_version: '0',
    compiler_digest: '<sha256>'
  },
  evaluator_digest: '<sha256>',
  objective_digest: '<sha256>',
  semantics: {
    opening: 'root-children',
    child_reveal: 'after-parent-revealed',
    sibling_order: 'creation-ordinal',
    out_of_support: 'record-and-stop',
    terminal: 'stop-or-no-eligible-or-round-limit'
  },
  ceilings: {
    max_worker_slots: 2,
    max_rounds: 16
  },
  created_at: '2026-09-16T13:00:00.000Z',
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false,
  production_promotion: false
}
```

`resolveReplayWorld(world, trace)` must recompute the trace digest and require exact equality for trace ID, trace digest, evaluator digest, and objective digest. It returns a frozen resolver object with deterministic indexes:

```js
{
  world,
  trace,
  root_id,
  node_by_id,
  children_by_parent
}
```

Do not expose internal mutable `Map` objects in a returned evidence object. Internal maps may be used during derivation; public output should be frozen plain JSON or a frozen resolver with accessor functions that never expose mutable state. Prefer plain arrays/records because they can be deterministically tested and digested.

- [ ] **Step 1: Add RED tests**

Cover:

```js
test('world resolves only against exact trace/evaluator/objective digests', () => {});
test('children are indexed by creation ordinal independent of object construction order', () => {});
test('world semantics and ceilings are closed-world', () => {});
test('world cannot claim network/runtime/promotion authority', () => {});
test('trace substitution and compiler digest substitution fail closed', () => {});
test('resolved world does not expose future node outcomes through its public prefix projector', () => {});
```

The last test should call a small exported helper:

```js
export function projectReplayPrefix(resolvedWorld, revealedNodeIds) {}
```

For an empty revealed set it may expose root metadata plus only eligible root-child IDs and non-outcome structural descriptors. It must not expose unrevealed quality, candidate digest, diagnostics, resources, or grandchildren.

- [ ] **Step 2: Run RED**

```bash
node --test mesh/test/replay-world.test.mjs
```

Expected: missing module/export failure.

- [ ] **Step 3: Implement Replay World**

Exports:

```js
export const REPLAY_WORLD_SCHEMA = 'axiom-replay-world.v0';
export function validateReplayWorld(input) {}
export function digestReplayWorld(input) {}
export function resolveReplayWorld(worldInput, traceInput) {}
export function projectReplayPrefix(resolvedWorld, revealedNodeIds) {}
```

`projectReplayPrefix()` returns:

```js
{
  world_id,
  trace_id,
  revealed: [/* only already revealed node outcome summaries */],
  eligible_node_ids: [/* children of root/revealed nodes not yet revealed */],
  exhausted_node_ids: [/* revealed nodes with no unrevealed children */]
}
```

Eligible IDs are creation-ordinal sorted. The projection must not include raw full trace or unrevealed node objects.

- [ ] **Step 4: Run GREEN**

```bash
node --test mesh/test/discovery-trace.test.mjs mesh/test/replay-world.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add mesh/src/lib/replay-world.mjs \
  mesh/test/replay-world.test.mjs \
  mesh/test/fixtures/replay-grounded-fixtures.mjs
git commit -m "feat: add deterministic replay world v0"
```

---

### Task 4: Implement Exploration Policy and Replay Objective manifests

**Files:**
- Create: `mesh/src/lib/exploration-policy.mjs`
- Create: `mesh/src/lib/replay-objective.mjs`
- Create: `mesh/test/replay-policy-contracts.test.mjs`
- Modify: `mesh/test/fixtures/replay-grounded-fixtures.mjs`

#### Exploration Policy v0 shape

```js
{
  schema: 'axiom-exploration-policy.v0',
  status: 'inert-policy-manifest',
  policy_id: 'policy.candidate',
  version: '1',
  artifact_digest: '<sha256>',
  implementation: {
    kind: 'external-artifact',
    runtime: 'not-executed-by-replay-core'
  },
  interface_version: 'axiom-replay-policy-interface.v0',
  observation_schema: 'axiom-replay-observation.v0',
  derived_features: [],
  max_internal_state_bytes: 0,
  proposer: {
    kind: 'human',
    ref: 'proposer.owner',
    digest: null
  },
  created_at: '2026-09-16T13:10:00.000Z',
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false,
  production_promotion: false
}
```

`proposer.kind = human | agent | optimizer | imported | unknown`. `digest` is either null or SHA-256. `derived_features` entries are exact `{ feature_id, feature_digest }`, duplicate-free and deterministically ordered by `feature_id` in the canonical contract. The validator rejects unordered/duplicate arrays rather than silently sorting caller evidence.

#### Replay Objective v0 shape

Replay Core v0 intentionally supports lexicographic comparison only:

```js
{
  schema: 'axiom-replay-objective.v0',
  status: 'inert-objective',
  objective_id: 'objective.discovery-quality-cost',
  comparison_mode: 'lexicographic',
  quality_scale: 1000000,
  hard_limits: {
    max_rounds: 16,
    max_worker_slots: 2,
    max_generation_calls: 64,
    max_evaluation_calls: 64,
    max_token_or_cost_units: 100000,
    max_wall_clock_ms: 3600000,
    max_storage_bytes: 100000000,
    max_external_effects: 0
  },
  metrics: [
    { metric: 'best_quality', direction: 'maximize' },
    { metric: 'generation_calls', direction: 'minimize' },
    { metric: 'evaluation_calls', direction: 'minimize' },
    { metric: 'token_or_cost_units', direction: 'minimize' },
    { metric: 'rounds', direction: 'minimize' }
  ],
  created_at: '2026-09-16T13:11:00.000Z',
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false,
  production_promotion: false
}
```

Closed metric vocabulary:

```text
best_quality
generation_calls
evaluation_calls
token_or_cost_units
wall_clock_ms
storage_bytes
worker_slot_peak
rounds
out_of_support_requests
failed_attempts
```

Every metric appears at most once. The explicit array order is the lexicographic priority order and is therefore order-sensitive.

- [ ] **Step 1: Write RED tests**

Cover exact-key rejection, non-authority constants, policy artifact binding, derived-feature duplicate/unordered rejection, objective hard ceilings, `max_external_effects !== 0` rejection, duplicate metrics, unsupported comparison mode, and lexicographic comparison.

Define the pure comparison export:

```js
export function compareReplayMetrics(candidateMetrics, baselineMetrics, objectiveInput) {}
```

It returns one of:

```text
better | equivalent | worse
```

The helper first verifies both metric records contain every objective metric as a finite safe integer. It compares in declared metric order and uses direction; it does not average or normalize metrics.

- [ ] **Step 2: Run RED**

```bash
node --test mesh/test/replay-policy-contracts.test.mjs
```

- [ ] **Step 3: Implement the two manifest modules**

Exports:

```js
// exploration-policy.mjs
export const EXPLORATION_POLICY_SCHEMA = 'axiom-exploration-policy.v0';
export const REPLAY_POLICY_INTERFACE = 'axiom-replay-policy-interface.v0';
export const REPLAY_OBSERVATION_SCHEMA = 'axiom-replay-observation.v0';
export function validateExplorationPolicy(input) {}
export function digestExplorationPolicy(input) {}

// replay-objective.mjs
export const REPLAY_OBJECTIVE_SCHEMA = 'axiom-replay-objective.v0';
export function validateReplayObjective(input) {}
export function digestReplayObjective(input) {}
export function compareReplayMetrics(candidateMetrics, baselineMetrics, objectiveInput) {}
```

Neither module may import a process/network/filesystem/runtime/provider module.

- [ ] **Step 4: Run GREEN**

```bash
node --test mesh/test/replay-policy-contracts.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add mesh/src/lib/exploration-policy.mjs \
  mesh/src/lib/replay-objective.mjs \
  mesh/test/replay-policy-contracts.test.mjs \
  mesh/test/fixtures/replay-grounded-fixtures.mjs
git commit -m "feat: add replay policy and objective manifests"
```

---

### Task 5: Implement the deterministic prefix-only Replay Engine

**Files:**
- Create: `mesh/src/lib/replay-engine.mjs`
- Create: `mesh/test/replay-engine.test.mjs`
- Modify: `mesh/test/fixtures/replay-grounded-fixtures.mjs`

#### Decision record

Replay Core v0 executes no candidate artifact. Tests and callers provide already-produced decisions with this strict ephemeral shape:

```js
{
  round: 1,
  open_node_ids: ['n1'],
  stop: false
}
```

Rules:

- `round` is exactly the next 1-based round;
- `stop: true` requires `open_node_ids: []`;
- `stop: false` requires one or more IDs;
- IDs must be unique;
- selected count may not exceed both world and objective worker ceilings;
- every selected ID must be currently eligible;
- an ID not present in the trace produces `out-of-support` and terminates the run under v0's `record-and-stop` semantics;
- an ID that exists but is not currently eligible is a fail-closed prefix-leak/invalid-decision error;
- selected eligible nodes are revealed in creation-ordinal order regardless of the decision array's order;
- before reveal, the engine computes the prospective cumulative resource usage and rejects the round if a hard objective limit would be exceeded;
- candidate self-reported diagnostics never influence resource accounting.

#### Replay Run Result

The engine returns a deeply frozen, content-addressed plain JSON result:

```js
{
  schema: 'axiom-replay-run-result.v0',
  status: 'inert-replay-result',
  world_id: 'world.example',
  world_digest: '<sha256>',
  trace_id: 'trace.example',
  trace_digest: '<sha256>',
  policy_id: 'policy.candidate',
  policy_digest: '<sha256>',
  objective_id: 'objective.discovery-quality-cost',
  objective_digest: '<sha256>',
  revealed_node_ids: ['n1'],
  rounds: 1,
  stop_reason: 'explicit-stop',
  metrics: {
    best_quality: 730000,
    generation_calls: 1,
    evaluation_calls: 1,
    token_or_cost_units: 100,
    wall_clock_ms: 500,
    storage_bytes: 2048,
    worker_slot_peak: 1,
    rounds: 1,
    out_of_support_requests: 0,
    failed_attempts: 0
  },
  out_of_support: [],
  failures: [],
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false,
  production_promotion: false,
  run_digest: '<sha256>'
}
```

`run_digest` is SHA-256 of the canonical result **without** its `run_digest` field. Provide `verifyReplayRunResult(result)` to recompute the digest and fixed semantics; it is a pure verifier, not a standalone durable JSON Schema contract in Core v0.

Closed stop reasons:

```text
explicit-stop
no-eligible-nodes
round-limit
out-of-support
budget-limit
script-exhausted
```

A script that ends while eligible work remains returns `script-exhausted`; the engine must not guess another decision.

- [ ] **Step 1: Write RED engine tests**

Must include:

```js
test('same world, policy, objective, and decisions produce identical run digest', () => {});
test('initial observation exposes eligible root children but no unrevealed outcomes', () => {});
test('revealing a parent makes only its recorded children eligible', () => {});
test('unknown continuation becomes out-of-support and no outcome is synthesized', () => {});
test('known grandchild selected before parent fails as prefix leakage', () => {});
test('decision cannot exceed worker ceiling', () => {});
test('prospective resource overflow stops before revealing the node', () => {});
test('decision ordering cannot change reveal order or digest', () => {});
test('script exhaustion is explicit and engine never invents a next move', () => {});
test('candidate diagnostics cannot override recorded resource use', () => {});
test('tampered run result fails digest verification', () => {});
```

- [ ] **Step 2: Run RED**

```bash
node --test mesh/test/replay-engine.test.mjs
```

- [ ] **Step 3: Implement the engine**

Exports:

```js
export const REPLAY_RUN_RESULT_SCHEMA = 'axiom-replay-run-result.v0';
export function validateReplayDecision(input, expectedRound) {}
export function runReplayDecisionScript({ trace, world, policy, objective, decisions }) {}
export function verifyReplayRunResult(input) {}
```

The engine composes only the validated replay contracts and canonical helpers. It performs no I/O and accepts no function callback supplied by the candidate.

- [ ] **Step 4: Run GREEN plus preceding replay tests**

```bash
node --test \
  mesh/test/discovery-trace.test.mjs \
  mesh/test/replay-world.test.mjs \
  mesh/test/replay-policy-contracts.test.mjs \
  mesh/test/replay-engine.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add mesh/src/lib/replay-engine.mjs \
  mesh/test/replay-engine.test.mjs \
  mesh/test/fixtures/replay-grounded-fixtures.mjs
git commit -m "feat: add deterministic replay engine v0"
```

---

### Task 6: Implement Replay World Pool v0 and sealed-holdout discipline

**Files:**
- Create: `mesh/src/lib/replay-world-pool.mjs`
- Create: `mesh/test/replay-world-pool.test.mjs`
- Modify: `mesh/test/fixtures/replay-grounded-fixtures.mjs`

#### Pool shape

```js
{
  schema: 'axiom-replay-world-pool.v0',
  status: 'inert-world-pool',
  pool_id: 'pool.training.1',
  cycle_id: 'cycle.1',
  role: 'training',
  visibility: 'development-visible',
  worlds: [
    {
      world_id: 'world.example',
      world_digest: '<sha256>',
      compatibility: 'current-compatible'
    }
  ],
  selection: {
    method: 'explicit',
    seed: null,
    evidence_ref: 'split.explicit.1',
    evidence_digest: '<sha256>'
  },
  created_at: '2026-09-16T14:00:00.000Z',
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false,
  production_promotion: false
}
```

Closed vocabularies:

```text
role = training | validation | sealed-holdout
visibility = development-visible | acceptance-sealed
compatibility = historical-valid | current-compatible | incompatible | unverified
selection.method = explicit | seeded
```

Rules:

- `training` and `validation` require `development-visible`;
- `sealed-holdout` requires `acceptance-sealed`;
- `seeded` requires a canonical unsigned 32-bit decimal seed; `explicit` requires `seed: null`;
- world entries are ordered by `world_id`, unique by both ID and digest, and not silently sorted;
- `resolveReplayWorldPool()` must receive exact supplied world artifacts, recompute every digest, and reject missing/extra worlds;
- compatibility `historical-valid`, `incompatible`, or `unverified` remains represented but is excluded from `current_acceptance_world_ids`; only `current-compatible` counts toward current acceptance metrics;
- exclusion does not delete the world from the pool digest.

Implement:

```js
export function validateReplayPoolPartition({ training, validation, holdout }) {}
```

It requires one cycle ID, distinct pool IDs/digests, and no repeated world digest across the three role pools. It must reject development-visible/holdout overlap even when an attacker changes a world ID while retaining the same world digest.

Implement:

```js
export function projectDevelopmentPool(poolInput) {}
```

It rejects `acceptance-sealed` pools rather than returning redacted membership. This is the Core-v0 process guard preventing accidental holdout exposure through the development helper.

- [ ] **Step 1: Write RED tests**

Cover exact digest resolution, duplicate world ID/digest, reordering, role/visibility mismatch, seed semantics, same-cycle overlap, ID-renamed/digest-identical overlap, currentness disposition, and rejection of sealed pool development projection.

- [ ] **Step 2: Run RED**

```bash
node --test mesh/test/replay-world-pool.test.mjs
```

- [ ] **Step 3: Implement pool module**

Exports:

```js
export const REPLAY_WORLD_POOL_SCHEMA = 'axiom-replay-world-pool.v0';
export function validateReplayWorldPool(input) {}
export function digestReplayWorldPool(input) {}
export function resolveReplayWorldPool(poolInput, worldInputs) {}
export function validateReplayPoolPartition(partition) {}
export function projectDevelopmentPool(poolInput) {}
```

- [ ] **Step 4: Run GREEN**

```bash
node --test mesh/test/replay-world-pool.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add mesh/src/lib/replay-world-pool.mjs \
  mesh/test/replay-world-pool.test.mjs \
  mesh/test/fixtures/replay-grounded-fixtures.mjs
git commit -m "feat: add replay world pool discipline"
```

---

### Task 7: Implement candidate-vs-baseline Replay Policy Evaluation v0

**Files:**
- Create: `mesh/src/lib/replay-policy-evaluation.mjs`
- Create: `mesh/test/replay-policy-evaluation.test.mjs`
- Modify: `mesh/test/fixtures/replay-grounded-fixtures.mjs`

#### Evaluation shape

The deterministic derivation must return a contract of this shape:

```js
{
  schema: 'axiom-replay-policy-evaluation.v0',
  status: 'inert-evaluation-evidence',
  evaluation_id: 'evaluation.candidate-vs-baseline.1',
  candidate_policy: { policy_id: 'policy.candidate', policy_digest: '<sha256>' },
  baseline_policy: { policy_id: 'policy.baseline', policy_digest: '<sha256>' },
  world_pool: { pool_id: 'pool.holdout.1', pool_digest: '<sha256>', role: 'sealed-holdout' },
  objective: { objective_id: 'objective.discovery-quality-cost', objective_digest: '<sha256>' },
  runner: {
    runner_id: 'axiom-replay-engine.v0',
    runner_version: '0',
    runner_digest: '<sha256>'
  },
  world_results: [
    {
      world_id: 'world.example',
      world_digest: '<sha256>',
      candidate_run_digest: '<sha256>',
      baseline_run_digest: '<sha256>',
      compatibility: 'current-compatible'
    }
  ],
  aggregate: {
    candidate_metrics: { /* summed/min-max derived fixed metric record */ },
    baseline_metrics: { /* same */ },
    relation: 'better',
    no_worse_on_fixed_history: true,
    compared_world_count: 1,
    excluded_world_count: 0,
    out_of_support_requests: 0,
    failure_count: 0,
    regression_world_ids: []
  },
  claim_scope: 'fixed-replay-pool-and-objective-only',
  evaluated_at: '2026-09-16T14:30:00.000Z',
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false,
  production_promotion: false
}
```

Aggregation rules:

- every pool world has exactly one candidate and one baseline run result;
- each run's world, trace, policy, and objective digests are independently verified;
- candidate and baseline are evaluated against the exact same world/objective;
- only `current-compatible` worlds enter the current acceptance metric comparison;
- incompatible/unverified/historical-only worlds remain in `world_results` and increment `excluded_world_count`;
- if zero current-compatible worlds remain, relation is not invented: derivation must fail with `insufficient current-compatible replay worlds` rather than output `equivalent`;
- aggregate `best_quality` is the maximum observed best quality across included worlds;
- count/cost/time/storage/round metrics are summed using safe-integer overflow checks;
- `worker_slot_peak` is the maximum peak;
- `failed_attempts` and `out_of_support_requests` are summed;
- a `regression_world_id` is one where the candidate is `worse` than baseline under the same objective's lexicographic comparison;
- the aggregate relation compares aggregate metric records under the exact objective;
- `no_worse_on_fixed_history` is true only for `better | equivalent` aggregate relation **and** `regression_world_ids.length === 0`;
- the evaluation never emits `eligible`, `authorized`, `deploy`, `promote`, or any equivalent decision.

- [ ] **Step 1: Write RED evaluation tests**

Include:

```js
test('candidate and baseline must bind the exact same fixed pool and objective', () => {});
test('evaluation independently verifies every run digest', () => {});
test('baseline substitution and candidate policy substitution fail closed', () => {});
test('historical/incompatible worlds remain recorded but do not count as current acceptance', () => {});
test('zero current-compatible worlds fails instead of inventing equivalence', () => {});
test('per-world regression prevents no-worse claim even if aggregate improves', () => {});
test('no-worse claim is scoped to exact pool/objective and recomputed metrics', () => {});
test('negative results and out-of-support counts affect evaluation digest', () => {});
test('evaluation cannot set runtime, network, authority, merge, deployment, or promotion semantics', () => {});
```

- [ ] **Step 2: Run RED**

```bash
node --test mesh/test/replay-policy-evaluation.test.mjs
```

- [ ] **Step 3: Implement evaluation module**

Exports:

```js
export const REPLAY_POLICY_EVALUATION_SCHEMA = 'axiom-replay-policy-evaluation.v0';
export function validateReplayPolicyEvaluation(input) {}
export function digestReplayPolicyEvaluation(input) {}
export function deriveReplayPolicyEvaluation({
  evaluation_id,
  candidate_policy,
  baseline_policy,
  pool,
  worlds,
  objective,
  candidate_runs,
  baseline_runs,
  runner,
  evaluated_at
}) {}
```

The derivation must accept data, not function callbacks. It must not execute either policy.

- [ ] **Step 4: Run GREEN**

```bash
node --test \
  mesh/test/replay-engine.test.mjs \
  mesh/test/replay-world-pool.test.mjs \
  mesh/test/replay-policy-evaluation.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add mesh/src/lib/replay-policy-evaluation.mjs \
  mesh/test/replay-policy-evaluation.test.mjs \
  mesh/test/fixtures/replay-grounded-fixtures.mjs
git commit -m "feat: add replay policy evaluation evidence"
```

---

### Task 8: Add closed JSON Schema mirrors and semantic parity guards

**Files:**
- Create: six schema files listed in File Map
- Create: `mesh/test/replay-schema-parity.test.mjs`
- Modify: `mesh/src/check-docs.mjs`

The schemas are mirrors of the semantic validators, not alternate sources of authority.

Every object schema must use:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false
}
```

Nested records also use `additionalProperties: false`. String digests use `^[a-f0-9]{64}$`. Integer limits use `type: integer`, `minimum: 0`, and maximums consistent with JS safe-integer semantics where practical. Constants must be represented with `const` rather than descriptive prose.

- [ ] **Step 1: Add the schema-parity test before schemas**

The test must require all six schema files and check at minimum:

- exact `$schema` URI;
- top-level `additionalProperties: false`;
- exact schema/status/non-authority constants;
- digest patterns;
- objective `comparison_mode` fixed to `lexicographic`;
- replay pool role/visibility enums;
- discovery node `external_effects` fixed to `0` or semantically constrained so the schema cannot accept a nonzero value that the semantic validator rejects;
- representative valid fixtures are accepted by semantic validator and structurally compatible with required schema fields;
- representative invalid fixtures rejected by semantic validators correspond to closed schema constraints.

Do not introduce AJV or another dependency solely for this slice. Follow the repository's existing dependency-free schema-parity testing pattern.

- [ ] **Step 2: Run RED**

```bash
node --test mesh/test/replay-schema-parity.test.mjs
```

Expected: fail because the six schema files do not exist.

- [ ] **Step 3: Add all six schemas**

Paths:

```text
docs/architecture/contracts/discovery-trace.v0.schema.json
docs/architecture/contracts/replay-world.v0.schema.json
docs/architecture/contracts/exploration-policy.v0.schema.json
docs/architecture/contracts/replay-objective.v0.schema.json
docs/architecture/contracts/replay-world-pool.v0.schema.json
docs/architecture/contracts/replay-policy-evaluation.v0.schema.json
```

- [ ] **Step 4: Register exact schema paths in `mesh/src/check-docs.mjs`**

Register each exact path in the canonical-document inventory. Add required-content assertions for its exact schema identifier and non-authority fields. Do not widen the allowed-document policy.

- [ ] **Step 5: Run schema + docs GREEN**

```bash
node --test mesh/test/replay-schema-parity.test.mjs
node mesh/src/check-docs.mjs
```

- [ ] **Step 6: Commit**

```bash
git add docs/architecture/contracts/discovery-trace.v0.schema.json \
  docs/architecture/contracts/replay-world.v0.schema.json \
  docs/architecture/contracts/exploration-policy.v0.schema.json \
  docs/architecture/contracts/replay-objective.v0.schema.json \
  docs/architecture/contracts/replay-world-pool.v0.schema.json \
  docs/architecture/contracts/replay-policy-evaluation.v0.schema.json \
  mesh/test/replay-schema-parity.test.mjs \
  mesh/src/check-docs.mjs
git commit -m "feat: add replay core schema mirrors"
```

---

### Task 9: Add adversarial authority/privacy/static-boundary regression coverage

**Files:**
- Create: `mesh/test/replay-boundary-static.test.mjs`
- Modify as needed: replay-focused test files only if a newly discovered gap needs a regression

- [ ] **Step 1: Write RED boundary tests before any repair they require**

The boundary test must inspect replay production source files and assert they do **not** import or reference effect-capable modules/surfaces such as:

```text
node:fs
node:child_process
node:net
node:http
node:https
node:dgram
node:dns
process.env
fetch(
Gateway
Hypervisor
Sandbox
Grid
provider-supervisor
runtime-adapter
```

Make the source guard structural enough not to reject ordinary method names such as `RegExp.exec()` merely because a forbidden word appears as a substring. Parse import declarations or use exact anchored patterns, following the repository's existing lessons from executor source-boundary tests.

Also test the contract-level boundary:

```js
test('replay core exposes no capability, authorization, activation, deployment, or merge decision', () => {});
test('raw chain-of-thought/credential/token fields fail closed as unknown contract fields', () => {});
test('candidate artifacts are never dynamically imported or evaluated by replay engine', () => {});
test('Node vm is absent from replay core production imports', () => {});
test('a changed evaluator/objective digest requires fresh replay evaluation', () => {});
test('negative and stale evidence cannot be removed without changing pool/evaluation digest', () => {});
```

- [ ] **Step 2: Run the boundary suite**

```bash
node --test mesh/test/replay-boundary-static.test.mjs
```

If it passes immediately because preceding code already satisfies the intended boundary, retain the test and record that no production repair was required. Do not manufacture a failure. If it reveals a real issue, first preserve the failing evidence, then make the smallest replay-local repair and rerun.

- [ ] **Step 3: Run all Replay Core tests**

```bash
node --test \
  mesh/test/discovery-trace.test.mjs \
  mesh/test/replay-world.test.mjs \
  mesh/test/replay-policy-contracts.test.mjs \
  mesh/test/replay-engine.test.mjs \
  mesh/test/replay-world-pool.test.mjs \
  mesh/test/replay-policy-evaluation.test.mjs \
  mesh/test/replay-schema-parity.test.mjs \
  mesh/test/replay-boundary-static.test.mjs
```

- [ ] **Step 4: Commit**

```bash
git add mesh/test/replay-boundary-static.test.mjs mesh/src/lib mesh/test
git commit -m "test: harden replay core authority boundary"
```

Only stage replay-related paths; do not use the broad command above if unrelated working-tree changes exist. Inspect `git status --short` first.

---

### Task 10: Final integration truth pass and full repository verification

**Files:**
- Modify only if evidence requires: `docs/superpowers/specs/2026-09-16-replay-grounded-self-improvement-design.md`
- Modify only if required for canonical registration: `mesh/src/check-docs.mjs`
- No capability-registry change.

- [ ] **Step 1: Re-read the approved spec line by line against implementation**

Create an implementation checklist from design sections 5–11 and 14–19. Confirm explicitly:

```text
Discovery Trace v0 implemented
Replay World v0 implemented
Exploration Policy Manifest v0 implemented
Replay Objective v0 implemented with documented Core-v0 lexicographic restriction
Replay Policy Evaluation v0 implemented
Replay World Pool v0 implemented
prefix-only visibility implemented
out-of-support is explicit; no synthetic branch
resource ceilings externally enforced by engine
train/validation/sealed-holdout role/overlap discipline implemented
stale/incompatible worlds retained but excluded from current acceptance
negative results preserved in digests
arbitrary candidate code runner absent
TypeSafe adapter absent
policy-development agent loop absent
promotion/canary/live activation absent
capability registry unchanged
```

If any item is false, do not update the spec to pretend otherwise. Either repair within this plan's scope or report the missing item.

- [ ] **Step 2: Confirm the diff is scope-bounded**

```bash
git status --short
git diff --check main...HEAD
git diff --name-status main...HEAD
```

Expected changed paths are only the approved replay spec/plan, six schemas, replay library modules/tests/fixtures, and canonical-doc registration. Any Gateway/policy/capability/runtime/provider/service-network diff is a stop condition.

- [ ] **Step 3: Run focused replay tests fresh**

```bash
node --test \
  mesh/test/discovery-trace.test.mjs \
  mesh/test/replay-world.test.mjs \
  mesh/test/replay-policy-contracts.test.mjs \
  mesh/test/replay-engine.test.mjs \
  mesh/test/replay-world-pool.test.mjs \
  mesh/test/replay-policy-evaluation.test.mjs \
  mesh/test/replay-schema-parity.test.mjs \
  mesh/test/replay-boundary-static.test.mjs
```

Record exact pass/fail counts.

- [ ] **Step 4: Run the governed repository verification**

From the repository/package context prescribed by `CONTRIBUTING.md`:

```bash
npm run check
npm run release:verify
```

Do not claim success without fresh command output and exit status. If the environment cannot execute the required runtime or network-independent toolchain, state that limitation and rely only on protected CI after push; never convert missing local verification into a pass.

- [ ] **Step 5: Verify no capability or production-state drift**

```bash
git diff --exit-code main...HEAD -- mesh/config/capabilities.json
```

Also inspect the diff for Gateway/Hypervisor/Sandbox/Grid, service-network policy, provider activation, credentials, and production promotion. Expected: no changes.

- [ ] **Step 6: Commit any final documentation-only reconciliation required by actual evidence**

Only if the implementation status line or canonical assertions require synchronization:

```bash
git add docs/superpowers/specs/2026-09-16-replay-grounded-self-improvement-design.md mesh/src/check-docs.mjs
git commit -m "docs: reconcile replay core executable boundary"
```

If no reconciliation is required, do not create an empty/no-op commit.

- [ ] **Step 7: Push and require protected exact-head verification before merge-readiness language**

Protected CI must verify the exact final head under the repository's normal Clean Kernel and cross-platform compatibility matrix. Treat any moved head as requiring a fresh pass. Do not represent an older merge candidate or earlier green SHA as proof for a newer head.

- [ ] **Step 8: Update the draft PR description with exact evidence only after checks exist**

The PR description should state:

```text
Replay Core v0 is inert evidence/replay infrastructure only.
No arbitrary candidate policy code executes.
No model/provider call, TypeSafe dependency, network/credential path, Gateway route, capability-registry promotion, self-authorized deployment, or production promotion is added.
Replay wins are scoped to the exact fixed pool/objective and are not live-world monotonicity claims.
```

Include exact head SHA, focused test counts, protected workflow results, and any known limitations. Do not mark the PR non-draft or merge it solely because this plan completed; repository review/merge authority remains separate.

---

## Out of Scope: Separate Follow-On Plans Required

The following are intentionally **not implementation steps in this plan** because each adds a distinct trust/external-service/authority boundary:

1. **Isolated candidate-policy runner** — hardened disposable execution for untrusted policy artifacts, with no credentials/egress/production identity and strict CPU/memory/time/output controls.
2. **TypeSafe/System One semantic annotation adapter** — live documentation/API review, external provider access, frozen typed judgment evidence, confidence handling, and safe fallback. Replay Core must remain functional without it.
3. **Autonomous policy-development loop** — an agent that proposes/revises policies from training replay feedback; it receives no evaluator mutation or promotion authority.
4. **Generic improvement/promotion integration** — only after repository convergence determines the canonical fate of PR #1455 or an equivalent successor.
5. **Live shadow/canary evaluation** — separate current-authority design with bounded real execution, rollback, currentness checks, receipts, and no automatic production promotion.
6. **Domain expansion beyond coding/algorithmic discovery** — governance, financial effects, personal behavioral interventions, production operations, and other high-consequence domains each require a separate threat/authority review.

---

## Completion Contract

Replay Core v0 is complete only when all of the following are simultaneously true:

- all six durable contracts validate strict closed-world plain JSON and have deterministic digests;
- replay tree ancestry is exact and acyclic by construction;
- prefix projection proves unrevealed outcomes remain hidden;
- unknown branches become explicit `out-of-support` rather than generated guesses;
- resource ceilings are measured from recorded trace evidence and cannot be widened by decisions;
- identical fixed inputs reproduce identical run/evaluation digests;
- candidate and baseline comparisons use the same exact pool/objective;
- sealed holdout overlap and development projection fail closed;
- stale/incompatible worlds remain historical evidence while excluded from current acceptance;
- no-worse claims remain scoped to fixed replay history and do not imply deployment authority;
- negative/regression evidence remains digest-significant;
- source-boundary tests show the Replay Core has no filesystem/network/subprocess/provider/runtime/authority path;
- `mesh/config/capabilities.json` is byte-unchanged relative to the approved base;
- focused replay tests pass fresh;
- required repository verification passes fresh on the final head or the exact limitations are reported without a readiness claim;
- protected exact-head CI is green before any merge-readiness claim.

The resulting invariant remains:

> **Improve the search. Preserve the evidence. Hold the authority boundary.**
