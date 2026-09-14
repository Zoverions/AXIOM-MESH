# Cooperative Immune Fabric H1-H2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the already-approved Continuous Threat Intelligence A/B foundation is merged, add inert Cooperative Immune Fabric evidence contracts plus deterministic synthetic multi-node simulation proving that duplicated, Sybil-amplified, correlated, stale, or contradictory security claims cannot manufacture authority or masquerade as independent corroboration.

**Architecture:** H1 introduces three closed language-neutral evidence contracts—`ImmuneSignal`, `ImmuneAttestation`, and `CorroborationSet`—plus deterministic correlation summarization. H2 uses only synthetic local fixtures and pure deterministic simulation to exercise honest corroboration, Sybils, correlated detector failure, copied-source amplification, contradiction, staleness, benign novelty, and applicability mismatch. No networking, live peer discovery, quarantine execution, capability mutation, credential access, or production effect is added.

**Tech Stack:** Node.js ESM on the repository-supported Node ranges (`>=22.23.2 <23 || >=24.14.0 <25`), built-in `node:test`, JSON Schema 2020-12 documents as language-neutral contract descriptions, existing canonical/digest helpers, zero third-party runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-13-cooperative-immune-fabric-stage5b-design.md`

## Global Constraints

- H0 remains the existing Continuous Threat Intelligence A/B programme and PR #1573; this plan must not widen that PR or duplicate its implementation.
- Start H1/H2 only after PR #1573 and the Stage 5B Cooperative Immune Fabric design have both landed on `main`.
- The swarm may increase knowledge; it must not increase authority.
- No one-agent-one-vote threat semantics.
- Collective evidence is not collective authority.
- Remote `confirmed` labels do not create local confirmation.
- Unknown independence is not independent.
- Contradictory evidence must remain explicit.
- Freshness/expiry must remain explicit.
- `confidence_band` is fixed to `unscored` in v0; H1/H2 must not invent a universal trust/reputation formula.
- No live peer exchange, socket, listener, fetch, provider call, subprocess, container launch, host hook, eBPF/LSM attachment, browser automation, payment, external target, or network side effect.
- No automatic challenge, throttle, constrain, quarantine, revoke, recover, block, deploy, merge, or policy mutation.
- No universal reputation score, persistent malicious-node score, or social-credit analogue.
- No autonomous retaliation or hack-back capability.
- Do not modify `mesh/config/capabilities.json`.
- Do not introduce production credentials, credential reads, provider tokens, or private user data.
- All H2 fixtures use synthetic principals, nodes, digests, versions, and observations only.
- `ImmuneSignal` and `ImmuneAttestation` canonical object size limit: 65,536 bytes each.
- `CorroborationSet` canonical object size limit: 262,144 bytes.
- Maximum signals in one H1/H2 corroboration set: 1,024.
- Maximum attestations in one H1/H2 corroboration set: 1,024.
- Maximum independence claims per signal or attestation: 16.
- Correlation-cluster membership is summarized using `member_count`, `membership_digest`, and at most 8 sample member digests; do not duplicate all member digests into every cluster.
- Use canonical ordering for all generated arrays and cluster summaries so the same inputs produce the same digest.
- Signature fields in H1/H2 are inert references only. Actual signed portable package verification belongs to H3.
- Dangerous payloads, exploit code, secrets, and raw personal telemetry are out of scope.
- Preserve `Gateway -> Hypervisor -> Sandbox -> Grid`; H1/H2 add no alternate authority path.

## Exact changed-file envelope

H1/H2 implementation may create or modify only:

```text
docs/architecture/contracts/immune-signal.v0.schema.json
docs/architecture/contracts/immune-attestation.v0.schema.json
docs/architecture/contracts/corroboration-set.v0.schema.json
mesh/src/lib/cooperative-immune-contracts.mjs
mesh/src/lib/immune-corroboration.mjs
mesh/src/lib/cooperative-immune-simulator.mjs
mesh/fixtures/cooperative-immune/correlation-v0.vectors.json
mesh/fixtures/cooperative-immune/adversarial-v0.scenarios.json
mesh/test/cooperative-immune-contracts.test.mjs
mesh/test/immune-corroboration.test.mjs
mesh/test/cooperative-immune-simulation.test.mjs
docs/security/COOPERATIVE-IMMUNE-FABRIC-THREAT-MODEL.md
docs/MASTER-TODO-COOPERATIVE-IMMUNE-FABRIC.md
docs/README.md
mesh/src/check-docs.mjs
docs/superpowers/plans/2026-09-13-cooperative-immune-fabric-h1-h2.md
```

If implementation requires a production policy file, Gateway, Hypervisor, Sandbox, Grid, node-discovery service, live causal-exchange path, provider, credential broker, runtime launcher, recovery executor, telemetry collector, external network path, or capability-registry change, STOP and return to Stage 5B review.

---

### Task 0: H0 prerequisite and clean branch gate

**Files:** none.

**Interfaces:**
- Consumes: merged Continuous Threat Intelligence A/B work from PR #1573.
- Produces: a clean `feat/cooperative-immune-h1-h2` branch from current `main` only after the prerequisite is real.

- [ ] **Step 1: Verify PR #1573 is merged**

```bash
test "$(gh pr view 1573 --repo Zoverions/AXIOM-MESH --json state --jq .state)" = "MERGED"
```

Expected: exit 0. If not, stop; do not stack H1/H2 onto the unfinished A/B implementation branch.

- [ ] **Step 2: Refresh `main` and verify H0 files exist**

```bash
git checkout main
git pull --ff-only
test -f mesh/src/lib/threat-intelligence-contracts.mjs
test -f mesh/src/lib/threat-observation-normalizer.mjs
test -f mesh/src/lib/threat-applicability.mjs
test -f mesh/test/threat-intelligence-authority-boundary.test.mjs
```

Expected: all commands exit 0.

- [ ] **Step 3: Run the H0 focused verification before branching**

```bash
cd mesh
node --test \
  test/threat-intelligence-contracts.test.mjs \
  test/threat-observation-normalizer.test.mjs \
  test/threat-applicability.test.mjs \
  test/threat-intelligence-authority-boundary.test.mjs
cd ..
```

Expected: PASS.

- [ ] **Step 4: Create the implementation branch from verified `main`**

```bash
git checkout -b feat/cooperative-immune-h1-h2
```

Expected: new branch at the same commit just verified.

---

### Task 1: H1 closed Cooperative Immune Fabric contracts

**Files:**
- Create: `docs/architecture/contracts/immune-signal.v0.schema.json`
- Create: `docs/architecture/contracts/immune-attestation.v0.schema.json`
- Create: `docs/architecture/contracts/corroboration-set.v0.schema.json`
- Create: `mesh/src/lib/cooperative-immune-contracts.mjs`
- Test: `mesh/test/cooperative-immune-contracts.test.mjs`

**Interfaces:**
- Consumes: `contractDigest` from `mesh/src/lib/threat-intelligence-contracts.mjs`; canonical validation helpers from `mesh/src/lib/canonical.mjs`.
- Produces:
  - `IMMUNE_SIGNAL_SCHEMA = 'axiom-immune-signal.v0'`
  - `IMMUNE_ATTESTATION_SCHEMA = 'axiom-immune-attestation.v0'`
  - `CORROBORATION_SET_SCHEMA = 'axiom-corroboration-set.v0'`
  - `verifyImmuneSignal(value)` -> canonical verified object
  - `verifyImmuneAttestation(value)` -> canonical verified object
  - `verifyCorroborationSet(value)` -> canonical verified object
  - exported enum sets/constants needed by `immune-corroboration.mjs`

- [ ] **Step 1: Write the failing contract tests**

Create `mesh/test/cooperative-immune-contracts.test.mjs` with positive fixtures plus explicit authority-negative cases.

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { contractDigest } from '../src/lib/threat-intelligence-contracts.mjs';
import {
  verifyImmuneSignal,
  verifyImmuneAttestation,
  verifyCorroborationSet
} from '../src/lib/cooperative-immune-contracts.mjs';

const D = digit => `sha256:${digit.repeat(64)}`;
const NOW = '2026-09-13T22:00:00.000Z';
const LATER = '2026-09-14T22:00:00.000Z';

function withDigest(value, field) {
  return { ...value, [field]: contractDigest(value, field) };
}

function independence(dimension, digit, claim_basis = 'deterministic_derivation') {
  return {
    dimension,
    correlation_key_digest: D(digit),
    claim_basis,
    evidence_binding: D('e')
  };
}

function baseSignal() {
  return withDigest({
    schema: 'axiom-immune-signal.v0',
    signal_id: 'immune:signal:synthetic-1',
    origin_scope: 'synthetic_peer',
    origin_principal_or_node_ref: 'peer:synthetic:1',
    observation_digest: D('1'),
    threat_class: 'behavioral_anomaly',
    affected_surface: ['synthetic:gateway'],
    behavioral_indicators: ['synthetic:unexpected_effect_request'],
    observation_kind: 'direct_local_observation',
    confidence: 'observed',
    observed_at: NOW,
    last_observed_at: NOW,
    expires_or_review_at: LATER,
    software_state_ref: D('2'),
    runtime_or_detector_ref: D('3'),
    source_lineage: [D('4')],
    independence_claims: [
      independence('operator', '5'),
      independence('node', '6'),
      independence('detector', '7'),
      independence('source', '8')
    ],
    sensitivity_class: 'synthetic_security',
    disclosure_profile: 'minimized_peer_v0',
    evidence_bindings: [D('9')],
    signed_envelope_ref: null
  }, 'signal_digest');
}

test('ImmuneSignal is inert, closed, and digest-bound', () => {
  const value = baseSignal();
  assert.equal(verifyImmuneSignal(value).signal_digest, value.signal_digest);
  assert.throws(() => verifyImmuneSignal({ ...value, authorize: true }), /unsupported field/);
  assert.throws(() => verifyImmuneSignal({ ...value, quarantine_action: 'execute' }), /unsupported field/);
});

test('ImmuneAttestation preserves unknown and contradiction states', () => {
  const signal = baseSignal();
  const raw = {
    schema: 'axiom-immune-attestation.v0',
    attestation_id: 'immune:attestation:synthetic-1',
    subject_signal_digest: signal.signal_digest,
    observer_scope: 'synthetic_peer',
    observer_principal_or_node_ref: 'peer:synthetic:2',
    result: 'unknown',
    observation_method: 'synthetic_review',
    observation_digest: D('a'),
    evidence_bindings: [D('b')],
    independence_claims: [independence('operator', 'c')],
    software_state_ref: D('d'),
    runtime_or_detector_ref: D('f'),
    confidence: 'insufficient_evidence',
    observed_at: NOW,
    expires_or_review_at: LATER,
    signed_envelope_ref: null
  };
  const value = withDigest(raw, 'attestation_digest');
  assert.equal(verifyImmuneAttestation(value).result, 'unknown');
});

test('CorroborationSet remains unscored and non-authorizing', () => {
  const raw = {
    schema: 'axiom-corroboration-set.v0',
    corroboration_id: 'immune:corroboration:synthetic-1',
    subject_digest: D('1'),
    signal_digests: [D('2')],
    attestation_digests: [],
    direct_observation_count: 1,
    reproduction_count: 0,
    contradiction_count: 0,
    unknown_count: 0,
    independence_dimensions: [],
    correlation_clusters: [],
    stale_evidence: [],
    applicability_scope: 'synthetic:current-build',
    confidence_band: 'unscored',
    unresolved_questions: [],
    computed_at: NOW,
    review_at: LATER
  };
  const value = withDigest(raw, 'corroboration_digest');
  assert.equal(verifyCorroborationSet(value).confidence_band, 'unscored');
  assert.throws(() => verifyCorroborationSet({ ...value, decision_lane: 'confirmed' }), /unsupported field/);
  assert.throws(() => verifyCorroborationSet({ ...value, revoke: true }), /unsupported field/);
});
```

Add explicit tests that:

- all three contracts reject unknown fields;
- all self-digests are recomputed and mismatches fail;
- timestamps are canonical UTC ISO-8601;
- `last_observed_at >= observed_at`;
- `expires_or_review_at > observed_at` for signals/attestations;
- `observation_kind` is one of `direct_local_observation`, `deterministic_verifier_result`, `bounded_lab_reproduction`, `locally_inferred_behavioral_anomaly`, `imported_external_intelligence`, `relayed_peer_observation`;
- attestation `result` is one of `corroborates`, `contradicts`, `reproduced`, `not_applicable`, `blocked_by_current_controls`, `insufficient_evidence`, `unknown`;
- independence dimensions are restricted to `operator`, `node`, `software`, `detector`, `source`, `network`, `temporal`, `environment`, `method`;
- `claim_basis` is one of `deterministic_derivation`, `signed_metadata`, `direct_attestation`, `self_reported`, `unknown`;
- `correlation_key_digest` may be `null`; null means unknown independence, never independent;
- at most one independence claim per dimension appears in one signal/attestation;
- `signed_envelope_ref` is null or an inert bounded string reference only;
- `confidence_band` is exactly `unscored` in v0;
- no contract has `authorize`, `execute`, `token`, `credential`, `capability`, `policy_patch`, `reputation_score`, `global_block`, `retaliation_target`, or `decision_lane` fields;
- raw prompts, payload bytes, user-content blobs, or exploit scripts have no contract field;
- `CorroborationSet.signal_digests` accepts 1..1024 unique digests;
- `CorroborationSet.attestation_digests` accepts 0..1024 unique digests;
- a correlation cluster uses only `dimension`, `correlation_key_digest`, `member_count`, `membership_digest`, `member_sample_digests`, `claim_basis_values`;
- `member_sample_digests` contains at most 8 digests.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
cd mesh
node --test test/cooperative-immune-contracts.test.mjs
```

Expected: FAIL because `cooperative-immune-contracts.mjs` and schemas do not exist.

- [ ] **Step 3: Add the exact JSON Schema shapes**

Use JSON Schema 2020-12 and `additionalProperties: false` for all objects, including nested independence and cluster objects.

Required `ImmuneSignal` fields:

```text
schema, signal_id, origin_scope, origin_principal_or_node_ref,
observation_digest, threat_class, affected_surface, behavioral_indicators,
observation_kind, confidence, observed_at, last_observed_at,
expires_or_review_at, software_state_ref, runtime_or_detector_ref,
source_lineage, independence_claims, sensitivity_class, disclosure_profile,
evidence_bindings, signed_envelope_ref, signal_digest
```

Required `ImmuneAttestation` fields:

```text
schema, attestation_id, subject_signal_digest, observer_scope,
observer_principal_or_node_ref, result, observation_method,
observation_digest, evidence_bindings, independence_claims,
software_state_ref, runtime_or_detector_ref, confidence, observed_at,
expires_or_review_at, signed_envelope_ref, attestation_digest
```

Required `CorroborationSet` fields:

```text
schema, corroboration_id, subject_digest, signal_digests,
attestation_digests, direct_observation_count, reproduction_count,
contradiction_count, unknown_count, independence_dimensions,
correlation_clusters, stale_evidence, applicability_scope,
confidence_band, unresolved_questions, computed_at, review_at,
corroboration_digest
```

Nested independence claim shape:

```text
dimension
correlation_key_digest   # sha256 digest or null
claim_basis
evidence_binding         # sha256 digest or null
```

Nested independence-dimension summary shape:

```text
dimension
known_cluster_count
unknown_count
singleton_cluster_count
largest_cluster_size
```

Nested correlation-cluster shape:

```text
dimension
correlation_key_digest
member_count
membership_digest
member_sample_digests[]  # sorted, max 8
claim_basis_values[]     # sorted unique tokens
```

- [ ] **Step 4: Implement the minimal zero-dependency semantic verifier**

Create `mesh/src/lib/cooperative-immune-contracts.mjs` using canonicalization and the existing `contractDigest`.

```js
import {
  assertPlainObject,
  assertString,
  canonicalJson,
  ValidationError
} from './canonical.mjs';
import { contractDigest } from './threat-intelligence-contracts.mjs';

export const IMMUNE_SIGNAL_SCHEMA = 'axiom-immune-signal.v0';
export const IMMUNE_ATTESTATION_SCHEMA = 'axiom-immune-attestation.v0';
export const CORROBORATION_SET_SCHEMA = 'axiom-corroboration-set.v0';

export const INDEPENDENCE_DIMENSIONS = Object.freeze([
  'operator', 'node', 'software', 'detector', 'source',
  'network', 'temporal', 'environment', 'method'
]);

export const ATTESTATION_RESULTS = Object.freeze([
  'corroborates', 'contradicts', 'reproduced', 'not_applicable',
  'blocked_by_current_controls', 'insufficient_evidence', 'unknown'
]);
```

Implement explicit exact-key sets, enum sets, digest checks, timestamp ordering, cardinality bounds, per-dimension uniqueness, canonical byte limits, and self-digest verification. Do not add AJV or another dependency only for the checked-in schemas.

- [ ] **Step 5: Run contract and canonicalization regressions**

```bash
cd mesh
node --test \
  test/cooperative-immune-contracts.test.mjs \
  test/threat-intelligence-contracts.test.mjs \
  test/canonical-domain.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add \
  docs/architecture/contracts/immune-signal.v0.schema.json \
  docs/architecture/contracts/immune-attestation.v0.schema.json \
  docs/architecture/contracts/corroboration-set.v0.schema.json \
  mesh/src/lib/cooperative-immune-contracts.mjs \
  mesh/test/cooperative-immune-contracts.test.mjs
git commit -m "feat: add inert cooperative immune contracts"
```

---

### Task 2: H1 deterministic independence and correlation summarization

**Files:**
- Create: `mesh/src/lib/immune-corroboration.mjs`
- Create: `mesh/fixtures/cooperative-immune/correlation-v0.vectors.json`
- Test: `mesh/test/immune-corroboration.test.mjs`

**Interfaces:**
- Consumes: `verifyImmuneSignal`, `verifyImmuneAttestation`, `verifyCorroborationSet`, schema constants, and `contractDigest`.
- Produces:
  - `buildCorrelationClusters(records)` -> canonical cluster array
  - `summarizeIndependence(records)` -> canonical per-dimension summaries
  - `buildCorroborationSet({ subjectDigest, signals, attestations, applicabilityScope, computedAt, reviewAt })` -> verified `CorroborationSet`
- Does **not** produce a threat verdict, authority decision, reputation score, or response action.

- [ ] **Step 1: Write failing correlation tests**

Create `mesh/test/immune-corroboration.test.mjs`.

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCorrelationClusters,
  summarizeIndependence,
  buildCorroborationSet
} from '../src/lib/immune-corroboration.mjs';

function byDimension(summary, dimension) {
  return summary.find(item => item.dimension === dimension);
}

test('1000 Sybil observations under one operator remain one operator cluster', () => {
  const signals = makeSyntheticSignals({
    count: 1000,
    operatorGroups: 1,
    nodeGroups: 1000,
    detectorGroups: 1,
    sourceGroups: 1
  });
  const set = buildCorroborationSet({
    subjectDigest: D('a'),
    signals,
    attestations: [],
    applicabilityScope: 'synthetic:applicable',
    computedAt: NOW,
    reviewAt: LATER
  });
  const operator = byDimension(set.independence_dimensions, 'operator');
  assert.equal(operator.known_cluster_count, 1);
  assert.equal(operator.largest_cluster_size, 1000);
  assert.equal(set.confidence_band, 'unscored');
  assert.equal('decision_lane' in set, false);
});

test('unknown independence is counted as unknown, not independent', () => {
  const records = makeSyntheticSignals({ count: 4, operatorGroups: null });
  const operator = byDimension(summarizeIndependence(records), 'operator');
  assert.equal(operator.known_cluster_count, 0);
  assert.equal(operator.unknown_count, 4);
});

test('contradictions remain visible beside direct observations', () => {
  const signal = makeSyntheticSignals({ count: 1 })[0];
  const attestation = makeSyntheticAttestation({ signal, result: 'contradicts' });
  const set = buildCorroborationSet({
    subjectDigest: signal.observation_digest,
    signals: [signal],
    attestations: [attestation],
    applicabilityScope: 'synthetic:applicable',
    computedAt: NOW,
    reviewAt: LATER
  });
  assert.equal(set.direct_observation_count, 1);
  assert.equal(set.contradiction_count, 1);
  assert.ok(set.unresolved_questions.includes('contradictory_evidence_present'));
});
```

Also add tests that:

- 20 reports with 14 sharing one source cluster, 4 sharing one operator cluster, and 2 independent direct observations are summarized as correlated supporting evidence rather than 20 independent observations;
- same-model/same-detector reports share one detector cluster even across different operators;
- relayed copies preserve the same source-lineage correlation;
- `self_reported` and `unknown` claim bases never increase an independence summary beyond their explicit correlation-key information;
- stale signal and attestation digests appear in `stale_evidence` when `expires_or_review_at <= computedAt`;
- attestation digests must reference a signal included in the set;
- duplicate signals/attestations are rejected;
- output arrays and clusters are deterministically sorted;
- changing input order does not change `corroboration_digest`;
- membership lists are represented by `membership_digest` + max-8 samples, not repeated unbounded arrays;
- no function returns `allow`, `deny`, `confirmed`, `quarantine`, `revoke`, or another authority-bearing decision.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
cd mesh
node --test test/immune-corroboration.test.mjs
```

Expected: FAIL because `immune-corroboration.mjs` does not exist.

- [ ] **Step 3: Add checked-in correlation vectors**

Create `mesh/fixtures/cooperative-immune/correlation-v0.vectors.json` with these named vectors:

```text
honest-three-domain-corroboration
one-operator-many-nodes
same-detector-different-operators
copied-source-many-peers
unknown-operator-independence
mixed-corroboration-and-contradiction
stale-replay
```

Every fixture uses synthetic digests and principals only. Store compact input metadata and expected cluster counts; do not store private or real incident telemetry.

- [ ] **Step 4: Implement deterministic correlation summarization**

Use one pure path for signals and attestations.

```js
export function buildCorrelationClusters(records) {
  const entries = flattenIndependenceClaims(records);
  const groups = new Map();

  for (const entry of entries) {
    if (entry.claim.correlation_key_digest === null) continue;
    const key = `${entry.claim.dimension}:${entry.claim.correlation_key_digest}`;
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([key, members]) => clusterFromMembers(key, members))
    .sort(compareClusters);
}
```

`clusterFromMembers` must:

1. sort member object digests;
2. compute `membership_digest` over that complete sorted digest list;
3. store only the first 8 sorted member digests in `member_sample_digests`;
4. count all members in `member_count`;
5. sort and deduplicate `claim_basis_values`.

`summarizeIndependence(records)` must iterate all nine dimensions and return, for each:

```text
known_cluster_count
unknown_count
singleton_cluster_count
largest_cluster_size
```

Unknown/null correlation keys increment `unknown_count`; they do not create singleton clusters.

- [ ] **Step 5: Implement `buildCorroborationSet` without scoring**

```js
export function buildCorroborationSet({
  subjectDigest,
  signals,
  attestations,
  applicabilityScope,
  computedAt,
  reviewAt
}) {
  const verifiedSignals = signals.map(verifyImmuneSignal);
  const verifiedAttestations = attestations.map(verifyImmuneAttestation);

  assertUniqueObjectDigests(verifiedSignals, 'signal_digest');
  assertUniqueObjectDigests(verifiedAttestations, 'attestation_digest');
  assertAttestationSubjectsPresent(verifiedSignals, verifiedAttestations);

  const records = [...verifiedSignals, ...verifiedAttestations];
  const raw = {
    schema: CORROBORATION_SET_SCHEMA,
    corroboration_id: `immune:corroboration:${subjectDigest.slice(7, 23)}`,
    subject_digest: subjectDigest,
    signal_digests: sortedDigests(verifiedSignals, 'signal_digest'),
    attestation_digests: sortedDigests(verifiedAttestations, 'attestation_digest'),
    direct_observation_count: countDirectObservations(verifiedSignals),
    reproduction_count: countReproductions(verifiedSignals, verifiedAttestations),
    contradiction_count: verifiedAttestations.filter(v => v.result === 'contradicts').length,
    unknown_count: verifiedAttestations.filter(v => ['unknown', 'insufficient_evidence'].includes(v.result)).length,
    independence_dimensions: summarizeIndependence(records),
    correlation_clusters: buildCorrelationClusters(records),
    stale_evidence: staleDigests(records, computedAt),
    applicability_scope: applicabilityScope,
    confidence_band: 'unscored',
    unresolved_questions: unresolvedQuestions(records, computedAt),
    computed_at: computedAt,
    review_at: reviewAt
  };
  return verifyCorroborationSet({
    ...raw,
    corroboration_digest: contractDigest(raw, 'corroboration_digest')
  });
}
```

Do not add a hidden score, weight, trust scalar, or lane transition.

- [ ] **Step 6: Run H1 correlation tests**

```bash
cd mesh
node --test \
  test/cooperative-immune-contracts.test.mjs \
  test/immune-corroboration.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add \
  mesh/src/lib/immune-corroboration.mjs \
  mesh/fixtures/cooperative-immune/correlation-v0.vectors.json \
  mesh/test/immune-corroboration.test.mjs
git commit -m "feat: summarize immune evidence independence"
```

---

### Task 3: H2 deterministic adversarial multi-node simulation

**Files:**
- Create: `mesh/src/lib/cooperative-immune-simulator.mjs`
- Create: `mesh/fixtures/cooperative-immune/adversarial-v0.scenarios.json`
- Test: `mesh/test/cooperative-immune-simulation.test.mjs`

**Interfaces:**
- Consumes: Task 1 contract validators and Task 2 `buildCorroborationSet`.
- Produces:
  - `expandSyntheticScenario(spec)` -> `{ signals, attestations }`
  - `runSyntheticImmuneScenario(spec)` -> verified `CorroborationSet`
  - no sockets, filesystem mutation, timers, subprocesses, providers, or external effects.

- [ ] **Step 1: Write failing simulation tests**

Create `mesh/test/cooperative-immune-simulation.test.mjs`.

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import scenarios from '../fixtures/cooperative-immune/adversarial-v0.scenarios.json' with { type: 'json' };
import { runSyntheticImmuneScenario } from '../src/lib/cooperative-immune-simulator.mjs';

function dimension(set, name) {
  return set.independence_dimensions.find(item => item.dimension === name);
}

test('Sybil majority cannot manufacture operator independence', () => {
  const scenario = scenarios.find(v => v.id === 'sybil-majority-1000');
  const set = runSyntheticImmuneScenario(scenario);
  assert.equal(set.signal_digests.length, 1000);
  assert.equal(dimension(set, 'operator').known_cluster_count, 1);
  assert.equal(dimension(set, 'operator').largest_cluster_size, 1000);
  assert.equal(set.confidence_band, 'unscored');
});

test('same-model correlated false positive remains visible as one detector cluster', () => {
  const scenario = scenarios.find(v => v.id === 'same-model-correlated-false-positive');
  const set = runSyntheticImmuneScenario(scenario);
  assert.ok(dimension(set, 'operator').known_cluster_count > 1);
  assert.equal(dimension(set, 'detector').known_cluster_count, 1);
});

test('malicious contradiction does not erase direct evidence', () => {
  const scenario = scenarios.find(v => v.id === 'malicious-contradiction');
  const set = runSyntheticImmuneScenario(scenario);
  assert.ok(set.direct_observation_count >= 1);
  assert.ok(set.contradiction_count >= 1);
  assert.ok(set.unresolved_questions.includes('contradictory_evidence_present'));
});
```

Add one test per required H2 scenario and a final meta-test that recursively scans returned objects and fails if any output key is one of:

```text
authorize, execute, allow, deny, quarantine, revoke, recover,
policy_patch, capability, credential, retaliation_target,
reputation_score, decision_lane
```

- [ ] **Step 2: Run the simulation test and verify RED**

```bash
cd mesh
node --test test/cooperative-immune-simulation.test.mjs
```

Expected: FAIL because the simulator and scenario file do not exist.

- [ ] **Step 3: Add the compact scenario fixture format**

Create `mesh/fixtures/cooperative-immune/adversarial-v0.scenarios.json` with at least these scenarios:

```text
honest-independent-corroboration
sybil-majority-1000
one-operator-many-agents
same-model-correlated-false-positive
copied-upstream-feed
conflicting-independent-evidence
stale-replay
compromised-previously-reliable-peer
benign-novelty
malicious-contradiction
quarantine-denial-of-service-attempt
version-config-applicable
version-config-not-applicable
missing-independence-metadata
```

Each scenario uses this compact shape:

```json
{
  "id": "sybil-majority-1000",
  "subject_seed": "sybil-majority",
  "population": 1000,
  "observation_kind": "relayed_peer_observation",
  "threat_class": "behavioral_anomaly",
  "correlation_groups": {
    "operator": 1,
    "node": 1000,
    "software": 1,
    "detector": 1,
    "source": 1,
    "network": 4,
    "temporal": 4,
    "environment": 1,
    "method": 1
  },
  "attestations": {
    "corroborates": 0,
    "contradicts": 0,
    "reproduced": 0,
    "unknown": 0
  },
  "stale_signals": 0,
  "applicability_scope": "synthetic:applicable"
}
```

Use `null` as a dimension's group count to generate unknown independence metadata. Group counts must be positive integers `<= population` when non-null.

- [ ] **Step 4: Implement deterministic synthetic expansion**

Create `mesh/src/lib/cooperative-immune-simulator.mjs`.

```js
import { digestObject } from './canonical.mjs';
import { contractDigest } from './threat-intelligence-contracts.mjs';
import {
  IMMUNE_SIGNAL_SCHEMA,
  IMMUNE_ATTESTATION_SCHEMA,
  verifyImmuneSignal,
  verifyImmuneAttestation
} from './cooperative-immune-contracts.mjs';
import { buildCorroborationSet } from './immune-corroboration.mjs';

const digest = value => `sha256:${digestObject(value)}`;

function groupDigest(scenarioId, dimension, index, groupCount) {
  if (groupCount === null) return null;
  return digest({ scenarioId, dimension, group: index % groupCount });
}

export function expandSyntheticScenario(spec) {
  validateScenarioSpec(spec);
  const signals = Array.from({ length: spec.population }, (_, index) =>
    makeSyntheticSignal(spec, index)
  );
  const attestations = makeSyntheticAttestations(spec, signals);
  return { signals, attestations };
}

export function runSyntheticImmuneScenario(spec) {
  const { signals, attestations } = expandSyntheticScenario(spec);
  return buildCorroborationSet({
    subjectDigest: digest({ scenario: spec.subject_seed }),
    signals,
    attestations,
    applicabilityScope: spec.applicability_scope,
    computedAt: '2026-09-13T23:00:00.000Z',
    reviewAt: '2026-09-14T23:00:00.000Z'
  });
}
```

Synthetic origin refs must use `peer:synthetic:<scenario-id>:<index>`. Synthetic timestamps must be deterministic; do not call `Date.now()`.

For `stale_signals`, make exactly the first N signals expire before `computedAt`; all others expire after it.

For attestation counts, attach attestations deterministically round-robin to included signal digests.

- [ ] **Step 5: Add scenario-specific assertions**

Required expected properties:

- `honest-independent-corroboration`: multiple independent operator/node/source clusters are preserved.
- `sybil-majority-1000`: 1000 signals, one operator cluster, no authority-bearing output.
- `one-operator-many-agents`: many origins do not imply many independent operators.
- `same-model-correlated-false-positive`: multiple operators can still share one detector cluster.
- `copied-upstream-feed`: many peers preserve one source correlation cluster.
- `conflicting-independent-evidence`: contradiction remains explicit.
- `stale-replay`: stale digests remain explicit and do not refresh themselves.
- `compromised-previously-reliable-peer`: no historical-reputation field is introduced; the new evidence stands on its own provenance.
- `benign-novelty`: anomaly evidence remains unscored and does not create hostility classification.
- `malicious-contradiction`: contradiction cannot erase direct observation.
- `quarantine-denial-of-service-attempt`: large duplicated input creates no quarantine action or action field.
- `version-config-applicable` and `version-config-not-applicable`: identical threat family may carry different local applicability scopes without remote evidence overriding the local scope.
- `missing-independence-metadata`: null correlation keys count as unknown, not singleton independent clusters.

- [ ] **Step 6: Run H2 deterministic simulations repeatedly**

```bash
cd mesh
for i in 1 2 3; do
  node --test test/cooperative-immune-simulation.test.mjs || exit 1
done
```

Expected: all three runs PASS with identical fixture-driven digests.

- [ ] **Step 7: Run H1/H2 combined regression set**

```bash
cd mesh
node --test \
  test/cooperative-immune-contracts.test.mjs \
  test/immune-corroboration.test.mjs \
  test/cooperative-immune-simulation.test.mjs \
  test/threat-intelligence-contracts.test.mjs \
  test/threat-intelligence-authority-boundary.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add \
  mesh/src/lib/cooperative-immune-simulator.mjs \
  mesh/fixtures/cooperative-immune/adversarial-v0.scenarios.json \
  mesh/test/cooperative-immune-simulation.test.mjs
git commit -m "test: simulate adversarial immune corroboration"
```

---

### Task 4: Threat model, executable backlog, and canonical-document registration

**Files:**
- Create: `docs/security/COOPERATIVE-IMMUNE-FABRIC-THREAT-MODEL.md`
- Create: `docs/MASTER-TODO-COOPERATIVE-IMMUNE-FABRIC.md`
- Modify: `docs/README.md`
- Modify: `mesh/src/check-docs.mjs`
- Modify: `docs/superpowers/plans/2026-09-13-cooperative-immune-fabric-h1-h2.md` only to check completed boxes during execution if the repository workflow records plan progress.

**Interfaces:**
- Consumes: approved Stage 5B design and H1/H2 implementation evidence.
- Produces: canonical claim boundary, later-slice backlog H3-H6, and doc-verifier coverage.

- [ ] **Step 1: Write the threat-model document**

`docs/security/COOPERATIVE-IMMUNE-FABRIC-THREAT-MODEL.md` must contain these exact top-level sections:

```text
# Cooperative Immune Fabric Threat Model
## Scope and non-claims
## Assets protected
## Trust boundaries
## Adversaries
## Sybil and correlation attacks
## Poisoned or compromised defensive peers
## Replay, staleness, and applicability mismatch
## Privacy and disclosure abuse
## Autoimmunity and denial-of-service
## Prompt/tool injection through threat evidence
## Authority amplification attempts
## Retaliation boundary
## H1/H2 residual risk
## Required evidence before H3
```

The non-claims section must explicitly say H1/H2 provide no live federation, automatic containment, reputation system, credential revocation, policy mutation, or retaliation capability.

- [ ] **Step 2: Write the executable master backlog**

`docs/MASTER-TODO-COOPERATIVE-IMMUNE-FABRIC.md` must use these sections:

```text
# Cooperative Immune Fabric Master TODO
## Priority 0 — Preserve authority and privacy truth
## Priority 1 — Complete H0 prerequisite
## Priority 2 — H1 inert evidence contracts
## Priority 3 — H1 independence/correlation semantics
## Priority 4 — H2 adversarial multi-node simulation
## Priority 5 — H3 signed portable immune packages
## Priority 6 — H4 admitted-node exchange evaluation
## Priority 7 — H5 reversible local immune response
## Priority 8 — H6 adaptive immunity and memory propagation
## Required anti-autoimmunity evidence
## Promotion rules
## Completion rule
```

Mark H3-H6 as unimplemented/future and preserve the fresh-gate requirements from the spec.

- [ ] **Step 3: Register the documents in `docs/README.md`**

Add links for:

```text
docs/superpowers/specs/2026-09-13-cooperative-immune-fabric-stage5b-design.md
docs/superpowers/plans/2026-09-13-cooperative-immune-fabric-h1-h2.md
docs/security/COOPERATIVE-IMMUNE-FABRIC-THREAT-MODEL.md
docs/MASTER-TODO-COOPERATIVE-IMMUNE-FABRIC.md
```

Do not change production/capability claims.

- [ ] **Step 4: Register canonical docs and required strings in `mesh/src/check-docs.mjs`**

Add all four paths above to `CANONICAL_DOCUMENTS`.

Add required-content checks:

```js
'docs/superpowers/specs/2026-09-13-cooperative-immune-fabric-stage5b-design.md': [
  'The swarm may increase knowledge. It must not increase authority.',
  'No one-agent-one-vote security semantics.',
  'No autonomous retaliation.'
],
'docs/superpowers/plans/2026-09-13-cooperative-immune-fabric-h1-h2.md': [
  '## Exact changed-file envelope',
  '### Task 1: H1 closed Cooperative Immune Fabric contracts',
  '### Task 3: H2 deterministic adversarial multi-node simulation'
],
'docs/security/COOPERATIVE-IMMUNE-FABRIC-THREAT-MODEL.md': [
  '## Sybil and correlation attacks',
  '## Autoimmunity and denial-of-service',
  '## Retaliation boundary'
],
'docs/MASTER-TODO-COOPERATIVE-IMMUNE-FABRIC.md': [
  '## Priority 0 — Preserve authority and privacy truth',
  '## Priority 5 — H3 signed portable immune packages',
  '## Completion rule'
]
```

- [ ] **Step 5: Run documentation verifier**

```bash
cd mesh
node src/check-docs.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add \
  docs/security/COOPERATIVE-IMMUNE-FABRIC-THREAT-MODEL.md \
  docs/MASTER-TODO-COOPERATIVE-IMMUNE-FABRIC.md \
  docs/README.md \
  mesh/src/check-docs.mjs \
  docs/superpowers/plans/2026-09-13-cooperative-immune-fabric-h1-h2.md
git commit -m "docs: register cooperative immune H1 H2 boundary"
```

---

### Task 5: Final authority, scope, and release verification

**Files:** none unless a failure reveals a defect within the exact changed-file envelope.

**Interfaces:**
- Consumes: all H1/H2 work.
- Produces: evidence that the branch is ready for reviewed PR consideration without claiming H3+ capability.

- [ ] **Step 1: Run whitespace and patch sanity checks**

```bash
git diff --check main...HEAD
```

Expected: no output; exit 0.

- [ ] **Step 2: Verify no forbidden capability/config paths changed**

```bash
if git diff --name-only main...HEAD | grep -E '^(mesh/config/capabilities\.json|mesh/src/(gateway|hypervisor|sandbox|grid)|.*credential|.*network|.*relay)'; then
  echo "Forbidden H1/H2 scope expansion detected" >&2
  exit 1
fi
```

Expected: no matches.

- [ ] **Step 3: Verify H1/H2 source contains no live-network or subprocess imports**

```bash
if grep -REn "node:(http|https|net|tls|dgram|child_process)|\bfetch\s*\(" \
  mesh/src/lib/cooperative-immune-contracts.mjs \
  mesh/src/lib/immune-corroboration.mjs \
  mesh/src/lib/cooperative-immune-simulator.mjs; then
  echo "Unexpected live I/O primitive in H1/H2" >&2
  exit 1
fi
```

Expected: no matches.

- [ ] **Step 4: Run focused H0+H1+H2 tests**

```bash
cd mesh
node --test \
  test/threat-intelligence-contracts.test.mjs \
  test/threat-observation-normalizer.test.mjs \
  test/threat-applicability.test.mjs \
  test/threat-intelligence-authority-boundary.test.mjs \
  test/cooperative-immune-contracts.test.mjs \
  test/immune-corroboration.test.mjs \
  test/cooperative-immune-simulation.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run repository-required verification**

```bash
npm run check
npm run release:verify
```

Expected: PASS. If unrelated pre-existing failures occur, record them exactly and do not misreport the branch as fully green.

- [ ] **Step 6: Inspect final diff for claim integrity**

```bash
git diff --stat main...HEAD
git diff main...HEAD -- \
  docs/architecture/contracts \
  mesh/src/lib/cooperative-immune-contracts.mjs \
  mesh/src/lib/immune-corroboration.mjs \
  mesh/src/lib/cooperative-immune-simulator.mjs \
  docs/security/COOPERATIVE-IMMUNE-FABRIC-THREAT-MODEL.md \
  docs/MASTER-TODO-COOPERATIVE-IMMUNE-FABRIC.md
```

Confirm manually that:

- no output object carries authority;
- 1000-Sybil simulation remains one operator cluster when configured that way;
- contradictory and stale evidence remain explicit;
- `confidence_band` remains `unscored`;
- no live transport or containment implementation exists;
- H3-H6 remain documented future work.

- [ ] **Step 7: Open a draft implementation PR**

```bash
gh pr create \
  --repo Zoverions/AXIOM-MESH \
  --base main \
  --head feat/cooperative-immune-h1-h2 \
  --draft \
  --title "feat: cooperative immune evidence and adversarial simulation" \
  --body "Implements only approved Cooperative Immune Fabric H1-H2: inert evidence contracts, deterministic independence/correlation summaries, and synthetic adversarial multi-node simulations. No live networking, containment effects, reputation system, capability mutation, credential authority, production promotion, or retaliation capability. H0/PR #1573 is a prerequisite; H3+ remains separately gated."
```

Expected: draft PR opened against `main`.

## Self-review record

- **Spec coverage:** H1 contract semantics, independence/correlation representation, no one-agent-one-vote, contradiction, staleness, privacy-oriented inert references, and H2 adversarial scenarios are all mapped to Tasks 1-3. Threat model, later H3-H6 backlog, canonical documentation, and claim boundary are mapped to Task 4. Authority/no-retaliation and scope enforcement are rechecked in Task 5.
- **Deliberate exclusions:** live exchange, cryptographic portable-package verification, actual local containment, credential revocation, policy mutation, adaptive-memory propagation across live peers, BFT/shared finality, and retaliation are not implementation gaps in this plan; they are H3+ work requiring later gates.
- **Type consistency:** `ImmuneSignal`, `ImmuneAttestation`, `CorroborationSet`, independence dimensions, correlation clusters, and the simulator all use the exact names and field contracts defined in Task 1.
- **No hidden score:** `confidence_band` is fixed to `unscored`; H1/H2 expose evidence structure rather than a universal trust formula.
- **No placeholders:** all tasks have exact files, interfaces, tests, commands, expected outcomes, and stop conditions.
