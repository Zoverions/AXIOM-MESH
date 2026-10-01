# Cooperative Immune Fabric H1-H2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the already-approved Continuous Threat Intelligence A/B foundation is merged, add inert Cooperative Immune Fabric evidence contracts plus deterministic synthetic multi-node simulation proving that duplicated, Sybil-amplified, correlated, stale, or contradictory security claims cannot manufacture authority or masquerade as independent corroboration.

**Architecture:** H1 introduces three closed language-neutral evidence contracts—`ImmuneSignal`, `ImmuneAttestation`, and `CorroborationSet`—and deterministic correlation summarization. H2 uses synthetic local fixtures and pure deterministic simulation to exercise honest corroboration, Sybils, correlated detector failure, copied-source amplification, contradiction, staleness, benign novelty, and applicability mismatch. No live transport, automatic containment, reputation system, credential authority, capability mutation, or production effect is added.

**Tech Stack:** Node.js ESM on the repository-supported Node ranges (`>=22.23.2 <23 || >=24.14.0 <25`), built-in `node:test`, JSON Schema 2020-12, existing canonical/digest helpers, zero third-party runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-13-cooperative-immune-fabric-stage5b-design.md`

## Global Constraints

- H0 remains the existing Continuous Threat Intelligence A/B programme in PR #1573; this plan must not widen or duplicate it.
- Begin H1/H2 only after the Stage 5B design and the full H0 A/B artifacts are present on `main` and their focused tests pass.
- The swarm may increase knowledge; it must not increase authority.
- No one-agent-one-vote threat semantics.
- Collective evidence is not collective authority.
- Remote `confirmed` labels do not create local confirmation.
- Unknown independence is not independent.
- Contradictory and stale evidence remain explicit.
- `confidence_band` is exactly `unscored` in v0; H1/H2 must not invent a universal trust/reputation formula.
- No live peer exchange, socket, listener, `fetch`, provider call, subprocess, container launch, host hook, eBPF/LSM attachment, browser automation, external target, or network side effect.
- No automatic challenge, throttle, constrain, quarantine, revoke, recover, block, deploy, merge, or policy mutation.
- No universal reputation score, persistent malicious-node score, social-credit analogue, or autonomous retaliation.
- Do not modify `mesh/config/capabilities.json`.
- Do not read production credentials or private user data.
- All H2 identities, versions, observations, and digests are synthetic.
- `ImmuneSignal` and `ImmuneAttestation` canonical object limit: 65,536 UTF-8 bytes each.
- `CorroborationSet` canonical object limit: 262,144 UTF-8 bytes.
- Maximum signals per set: 1,024. Maximum attestations per set: 1,024.
- Maximum independence claims per signal or attestation: 16; v0 recognizes exactly nine independence dimensions.
- Correlation clusters store `member_count`, `membership_digest`, and at most 8 sample member digests rather than duplicating full membership lists.
- Generated arrays and summaries use canonical deterministic ordering.
- Signature fields are inert references only. Cryptographic portable-package verification belongs to H3.
- Dangerous payloads, exploit code, secrets, and raw personal telemetry are out of scope.
- Preserve `Gateway -> Hypervisor -> Sandbox -> Grid`; H1/H2 add no alternate authority path.

## Exact changed-file envelope

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

If implementation needs a production policy file, Gateway, Hypervisor, Sandbox, Grid, live node-discovery/causal-exchange path, provider, credential broker, runtime launcher, recovery executor, telemetry collector, external network path, or capability-registry change, stop and return to Stage 5B review.

---

### Task 0: Verify H0 and create a clean implementation branch

**Files:** none.

**Interfaces:**
- Consumes: the complete H0 Continuous Threat Intelligence A/B artifacts already planned under `docs/superpowers/plans/2026-09-10-continuous-threat-intelligence-a-b.md`.
- Produces: `feat/cooperative-immune-h1-h2` from verified current `main`.

- [ ] **Step 1: Refresh `main`**

```bash
git fetch origin
git checkout main
git pull --ff-only
```

- [ ] **Step 2: Prove the H0 artifacts are actually on `main`**

```bash
test -f mesh/src/lib/threat-intelligence-contracts.mjs
test -f mesh/src/lib/threat-observation-normalizer.mjs
test -f mesh/src/lib/threat-applicability.mjs
test -f mesh/test/threat-intelligence-contracts.test.mjs
test -f mesh/test/threat-observation-normalizer.test.mjs
test -f mesh/test/threat-applicability.test.mjs
test -f mesh/test/threat-intelligence-authority-boundary.test.mjs
```

Expected: all commands exit 0. If any file is absent, stop and complete the existing H0 plan rather than stacking H1/H2 on an unfinished branch.

- [ ] **Step 3: Run the H0 focused tests**

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

- [ ] **Step 4: Create the H1/H2 branch**

```bash
git checkout -b feat/cooperative-immune-h1-h2
```

---

### Task 1: Add closed inert Cooperative Immune Fabric contracts

**Files:**
- Create: `docs/architecture/contracts/immune-signal.v0.schema.json`
- Create: `docs/architecture/contracts/immune-attestation.v0.schema.json`
- Create: `docs/architecture/contracts/corroboration-set.v0.schema.json`
- Create: `mesh/src/lib/cooperative-immune-contracts.mjs`
- Test: `mesh/test/cooperative-immune-contracts.test.mjs`

**Interfaces:**
- Consumes: `contractDigest` from `threat-intelligence-contracts.mjs`; canonical helpers from `canonical.mjs`.
- Produces:
  - `IMMUNE_SIGNAL_SCHEMA = 'axiom-immune-signal.v0'`
  - `IMMUNE_ATTESTATION_SCHEMA = 'axiom-immune-attestation.v0'`
  - `CORROBORATION_SET_SCHEMA = 'axiom-corroboration-set.v0'`
  - `INDEPENDENCE_DIMENSIONS`
  - `ATTESTATION_RESULTS`
  - `verifyImmuneSignal(value)`
  - `verifyImmuneAttestation(value)`
  - `verifyCorroborationSet(value)`

- [ ] **Step 1: Write failing contract tests**

Use this test scaffold in `mesh/test/cooperative-immune-contracts.test.mjs`:

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
const OBSERVED = '2026-09-13T21:00:00.000Z';
const LATER = '2026-09-14T23:00:00.000Z';

function withDigest(value, field) {
  return { ...value, [field]: contractDigest(value, field) };
}

function independence(dimension, digit) {
  return {
    dimension,
    correlation_key_digest: digit === null ? null : D(digit),
    claim_basis: digit === null ? 'unknown' : 'deterministic_derivation',
    evidence_binding: digit === null ? null : D('e')
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
    observed_at: OBSERVED,
    last_observed_at: OBSERVED,
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

test('ImmuneSignal is closed and cannot carry authority', () => {
  const value = baseSignal();
  assert.equal(verifyImmuneSignal(value).signal_digest, value.signal_digest);
  assert.throws(() => verifyImmuneSignal({ ...value, authorize: true }), /unsupported field/);
  assert.throws(() => verifyImmuneSignal({ ...value, quarantine_action: 'execute' }), /unsupported field/);
});
```

Add positive `ImmuneAttestation` and `CorroborationSet` fixtures plus negative tests that establish all of these exact properties:

- unknown fields fail;
- self-digest mismatch fails;
- timestamps are canonical UTC ISO-8601;
- `last_observed_at >= observed_at`;
- `expires_or_review_at > observed_at`;
- observation kind enum: `direct_local_observation`, `deterministic_verifier_result`, `bounded_lab_reproduction`, `locally_inferred_behavioral_anomaly`, `imported_external_intelligence`, `relayed_peer_observation`;
- attestation result enum: `corroborates`, `contradicts`, `reproduced`, `not_applicable`, `blocked_by_current_controls`, `insufficient_evidence`, `unknown`;
- independence dimensions: `operator`, `node`, `software`, `detector`, `source`, `network`, `temporal`, `environment`, `method`;
- claim basis enum: `deterministic_derivation`, `signed_metadata`, `direct_attestation`, `self_reported`, `unknown`;
- at most one independence claim per dimension;
- null `correlation_key_digest` means unknown independence;
- `signed_envelope_ref` is null or an inert bounded string;
- `confidence_band` is exactly `unscored`;
- no contract accepts `authorize`, `execute`, `token`, `credential`, `capability`, `policy_patch`, `reputation_score`, `global_block`, `retaliation_target`, `decision_lane`, or embedded raw payload fields;
- `signal_digests` accepts 1..1024 unique digests and `attestation_digests` accepts 0..1024;
- count fields cannot exceed their source populations;
- `stale_evidence` must be a subset of the included signal/attestation digests;
- `review_at > computed_at`;
- correlation clusters use only `dimension`, `correlation_key_digest`, `member_count`, `membership_digest`, `member_sample_digests`, `claim_basis_values`;
- `member_sample_digests.length <= 8`.

- [ ] **Step 2: Verify RED**

```bash
cd mesh
node --test test/cooperative-immune-contracts.test.mjs
```

Expected: FAIL because the module and schemas do not exist.

- [ ] **Step 3: Add exact schema shapes**

Use JSON Schema 2020-12 with `additionalProperties: false` at every object level.

`ImmuneSignal` required fields:

```text
schema, signal_id, origin_scope, origin_principal_or_node_ref,
observation_digest, threat_class, affected_surface, behavioral_indicators,
observation_kind, confidence, observed_at, last_observed_at,
expires_or_review_at, software_state_ref, runtime_or_detector_ref,
source_lineage, independence_claims, sensitivity_class, disclosure_profile,
evidence_bindings, signed_envelope_ref, signal_digest
```

`ImmuneAttestation` required fields:

```text
schema, attestation_id, subject_signal_digest, observer_scope,
observer_principal_or_node_ref, result, observation_method,
observation_digest, evidence_bindings, independence_claims,
software_state_ref, runtime_or_detector_ref, confidence, observed_at,
expires_or_review_at, signed_envelope_ref, attestation_digest
```

`CorroborationSet` required fields:

```text
schema, corroboration_id, subject_digest, signal_digests,
attestation_digests, direct_observation_count, reproduction_count,
contradiction_count, unknown_count, independence_dimensions,
correlation_clusters, stale_evidence, applicability_scope,
confidence_band, unresolved_questions, computed_at, review_at,
corroboration_digest
```

Independence claim:

```text
dimension
correlation_key_digest  # sha256 or null
claim_basis
evidence_binding        # sha256 or null
```

Dimension summary:

```text
dimension
known_cluster_count
unknown_count
singleton_cluster_count
largest_cluster_size
```

Correlation cluster:

```text
dimension
correlation_key_digest
member_count
membership_digest
member_sample_digests[] # sorted; max 8
claim_basis_values[]    # sorted unique
```

- [ ] **Step 4: Implement the semantic verifier**

Start `mesh/src/lib/cooperative-immune-contracts.mjs` with:

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

Define these private helpers in the same file with explicit fail-closed behavior:

```text
boundedCanonical(value, name, maxBytes)
assertExactFields(object, fields, name)
assertDigest(value, name)
assertTimestamp(value, name)
assertUniqueStrings(value, name, limits)
assertUniqueDigests(value, name, maxItems)
assertIndependenceClaims(value, name)
assertIndependenceSummaries(value)
assertCorrelationClusters(value)
assertSelfDigest(object, digestField, name)
```

`boundedCanonical` measures canonical UTF-8 size. `assertIndependenceClaims` rejects duplicate dimensions. `assertCorrelationClusters` enforces max-8 member samples. `verifyCorroborationSet` enforces count/subset relationships and exact `confidence_band === 'unscored'`. Each public verifier returns canonical parsed data only after its self-digest matches `contractDigest`.

- [ ] **Step 5: Run Task 1 tests**

```bash
cd mesh
node --test \
  test/cooperative-immune-contracts.test.mjs \
  test/threat-intelligence-contracts.test.mjs \
  test/canonical-domain.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

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

### Task 2: Add deterministic independence/correlation summarization

**Files:**
- Create: `mesh/src/lib/immune-corroboration.mjs`
- Create: `mesh/fixtures/cooperative-immune/correlation-v0.vectors.json`
- Test: `mesh/test/immune-corroboration.test.mjs`

**Interfaces:**
- Consumes: Task 1 verifiers/constants plus `contractDigest` and `digestObject`.
- Produces:
  - `buildCorrelationClusters(records)`
  - `summarizeIndependence(records)`
  - `buildCorroborationSet({ subjectDigest, signals, attestations, applicabilityScope, computedAt, reviewAt })`
- Produces no verdict, trust score, decision lane, action, or authority.

- [ ] **Step 1: Write failing tests and define all test-only helpers locally**

At the top of `mesh/test/immune-corroboration.test.mjs`, define `digest(value)`, `claim(dimension, groupKey)`, `makeSyntheticSignals(options)`, `makeSyntheticAttestation(signal, result, index)`, and `byDimension(summary, dimension)` in that file. `makeSyntheticSignals` must construct valid Task 1 signals and accept `operatorGroups`, `nodeGroups`, `detectorGroups`, and `sourceGroups`; a null group count produces a null correlation key with `claim_basis: 'unknown'`.

The core tests must include:

```js
test('1000 Sybil observations under one operator remain one operator cluster', () => {
  const signals = makeSyntheticSignals({
    count: 1000,
    operatorGroups: 1,
    nodeGroups: 1000,
    detectorGroups: 1,
    sourceGroups: 1
  });
  const set = buildCorroborationSet({
    subjectDigest: digest({ subject: 'sybil' }),
    signals,
    attestations: [],
    applicabilityScope: 'synthetic:applicable',
    computedAt: '2026-09-13T23:00:00.000Z',
    reviewAt: '2026-09-14T23:00:00.000Z'
  });
  const operator = byDimension(set.independence_dimensions, 'operator');
  assert.equal(operator.known_cluster_count, 1);
  assert.equal(operator.largest_cluster_size, 1000);
  assert.equal(set.confidence_band, 'unscored');
  assert.equal('decision_lane' in set, false);
});

test('unknown independence is unknown, not a singleton', () => {
  const records = makeSyntheticSignals({ count: 4, operatorGroups: null });
  const operator = byDimension(summarizeIndependence(records), 'operator');
  assert.equal(operator.known_cluster_count, 0);
  assert.equal(operator.unknown_count, 4);
});
```

Add tests for: 20 reports with source/operator correlation, same-detector correlation across operators, copied-source lineage, direct observation plus contradiction, stale evidence, duplicate rejection, max-8 samples, and input-order-invariant `corroboration_digest`.

- [ ] **Step 2: Verify RED**

```bash
cd mesh
node --test test/immune-corroboration.test.mjs
```

- [ ] **Step 3: Add compact correlation vectors**

`mesh/fixtures/cooperative-immune/correlation-v0.vectors.json` contains synthetic-only vectors named:

```text
honest-three-domain-corroboration
one-operator-many-nodes
same-detector-different-operators
copied-source-many-peers
unknown-operator-independence
mixed-corroboration-and-contradiction
stale-replay
```

Each vector stores only synthetic seeds/group counts and expected summary counts.

- [ ] **Step 4: Implement verified evidence-record handling**

In `mesh/src/lib/immune-corroboration.mjs`, define:

```js
function verifyEvidenceRecord(record) {
  if (record?.schema === IMMUNE_SIGNAL_SCHEMA) return verifyImmuneSignal(record);
  if (record?.schema === IMMUNE_ATTESTATION_SCHEMA) return verifyImmuneAttestation(record);
  throw new ValidationError('unsupported cooperative immune evidence record');
}

function recordDigest(record) {
  return record.signal_digest ?? record.attestation_digest;
}

function flattenIndependenceClaims(records) {
  return records.map(verifyEvidenceRecord).flatMap(record =>
    record.independence_claims.map(claim => ({ record_digest: recordDigest(record), claim }))
  );
}
```

Both exported summary helpers must therefore validate their inputs even when called outside `buildCorroborationSet`.

- [ ] **Step 5: Implement deterministic clusters**

`buildCorrelationClusters(records)` groups only non-null correlation keys by `dimension + correlation_key_digest`. For every group:

```text
memberDigests = all member record digests, sorted
membership_digest = sha256 canonical digest of the complete memberDigests array
member_sample_digests = first 8 memberDigests
member_count = complete memberDigests length
claim_basis_values = sorted unique claim bases
```

Sort the resulting clusters by `dimension`, then `correlation_key_digest`.

`summarizeIndependence(records)` returns all nine dimensions in fixed `INDEPENDENCE_DIMENSIONS` order with:

```text
known_cluster_count
unknown_count
singleton_cluster_count
largest_cluster_size
```

A missing claim or null correlation key increments `unknown_count`; it never creates a singleton cluster.

- [ ] **Step 6: Implement `buildCorroborationSet` with no scoring**

Define these private helpers exactly in the same module:

```text
assertUniqueObjectDigests(records, field)
  Set-based duplicate detection; throw ValidationError on duplicate.

assertAttestationSubjectsPresent(signals, attestations)
  Every attestation.subject_signal_digest must match an included signal.signal_digest.

sortedDigests(records, field)
  Ascending lexicographic digests.

countDirectObservations(signals)
  Count signal.observation_kind === 'direct_local_observation'.

countReproductions(signals, attestations)
  Count bounded_lab_reproduction signals plus reproduced attestations.

staleDigests(records, computedAt)
  Sorted record digests with expires_or_review_at <= computedAt.

unresolvedQuestions(records, computedAt)
  Sorted unique tokens: contradictory_evidence_present,
  unknown_or_insufficient_evidence_present,
  unknown_independence:<dimension>, stale_evidence_present, as applicable.
```

Then construct and verify:

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

- [ ] **Step 7: Run Task 2 tests and commit**

```bash
cd mesh
node --test test/cooperative-immune-contracts.test.mjs test/immune-corroboration.test.mjs
cd ..
git add mesh/src/lib/immune-corroboration.mjs \
  mesh/fixtures/cooperative-immune/correlation-v0.vectors.json \
  mesh/test/immune-corroboration.test.mjs
git commit -m "feat: summarize immune evidence independence"
```

---

### Task 3: Add deterministic adversarial multi-node simulation

**Files:**
- Create: `mesh/src/lib/cooperative-immune-simulator.mjs`
- Create: `mesh/fixtures/cooperative-immune/adversarial-v0.scenarios.json`
- Test: `mesh/test/cooperative-immune-simulation.test.mjs`

**Interfaces:**
- Consumes: Task 1 contracts, Task 2 `buildCorroborationSet`, `digestObject`, `contractDigest`.
- Produces:
  - `expandSyntheticScenario(spec)` -> `{ signals, attestations }`
  - `runSyntheticImmuneScenario(spec)` -> verified `CorroborationSet`
- No I/O or external effects.

- [ ] **Step 1: Write failing simulation tests**

Use JSON import attributes and these local helpers:

```js
function scenario(id) {
  const value = scenarios.find(item => item.id === id);
  assert.ok(value, `missing scenario ${id}`);
  return value;
}

function dimension(set, name) {
  return set.independence_dimensions.find(item => item.dimension === name);
}

function assertNoAuthorityKeys(value) {
  const forbidden = new Set([
    'authorize', 'execute', 'allow', 'deny', 'quarantine', 'revoke', 'recover',
    'policy_patch', 'capability', 'credential', 'retaliation_target',
    'reputation_score', 'decision_lane'
  ]);
  if (Array.isArray(value)) return value.forEach(assertNoAuthorityKeys);
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      assert.equal(forbidden.has(key), false, `forbidden authority key ${key}`);
      assertNoAuthorityKeys(child);
    }
  }
}
```

Required tests include:

```js
test('Sybil majority cannot manufacture operator independence', () => {
  const set = runSyntheticImmuneScenario(scenario('sybil-majority-1000'));
  assert.equal(set.signal_digests.length, 1000);
  assert.equal(dimension(set, 'operator').known_cluster_count, 1);
  assert.equal(dimension(set, 'operator').largest_cluster_size, 1000);
  assert.equal(set.confidence_band, 'unscored');
  assertNoAuthorityKeys(set);
});

test('same-model false positive remains correlated', () => {
  const set = runSyntheticImmuneScenario(scenario('same-model-correlated-false-positive'));
  assert.ok(dimension(set, 'operator').known_cluster_count > 1);
  assert.equal(dimension(set, 'detector').known_cluster_count, 1);
});

test('malicious contradiction cannot erase direct evidence', () => {
  const set = runSyntheticImmuneScenario(scenario('malicious-contradiction'));
  assert.ok(set.direct_observation_count >= 1);
  assert.ok(set.contradiction_count >= 1);
  assert.ok(set.unresolved_questions.includes('contradictory_evidence_present'));
});
```

Also run every scenario twice and assert identical `corroboration_digest`.

- [ ] **Step 2: Verify RED**

```bash
cd mesh
node --test test/cooperative-immune-simulation.test.mjs
```

- [ ] **Step 3: Add compact synthetic scenario fixtures**

`mesh/fixtures/cooperative-immune/adversarial-v0.scenarios.json` must contain:

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

Exact scenario shape:

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

Use the same `subject_seed` for `version-config-applicable` and `version-config-not-applicable` so they represent the same threat family under different local applicability scopes. A null group count means unknown independence. Total attestations across all result buckets must be <= 1,024.

- [ ] **Step 4: Implement strict scenario validation**

In `mesh/src/lib/cooperative-immune-simulator.mjs`, define exact key sets:

```js
const SCENARIO_FIELDS = new Set([
  'id', 'subject_seed', 'population', 'observation_kind', 'threat_class',
  'correlation_groups', 'attestations', 'stale_signals', 'applicability_scope'
]);
const GROUP_FIELDS = new Set(INDEPENDENCE_DIMENSIONS);
const ATTESTATION_FIELDS = new Set(['corroborates', 'contradicts', 'reproduced', 'unknown']);
```

Define `assertExactKeys(object, allowed, name)` and use it for the scenario and both nested objects. `validateScenarioSpec(spec)` must enforce population 1..1024, each non-null group count 1..population, `stale_signals` 0..population, each attestation bucket 0..1024, and the sum of all attestation buckets <=1024.

- [ ] **Step 5: Implement deterministic generation with valid stale timing**

Use fixed times:

```js
const OBSERVED_AT = '2026-09-13T21:00:00.000Z';
const STALE_EXPIRY = '2026-09-13T22:30:00.000Z';
const COMPUTED_AT = '2026-09-13T23:00:00.000Z';
const FUTURE_EXPIRY = '2026-09-14T23:00:00.000Z';
```

This ordering is mandatory:

```text
OBSERVED_AT < STALE_EXPIRY <= COMPUTED_AT < FUTURE_EXPIRY
```

Define these private helpers in the same file:

```text
groupDigest(spec, dimension, index)
  null when group count is null; otherwise digest of scenario/dimension/(index % groupCount).

independenceClaims(spec, index)
  all nine dimensions; null keys use claim_basis 'unknown' and null evidence_binding.

makeSyntheticSignal(spec, index)
  builds and verifies an ImmuneSignal; first stale_signals entries use STALE_EXPIRY,
  remaining entries use FUTURE_EXPIRY; observed_at and last_observed_at use OBSERVED_AT.

makeSyntheticAttestation(spec, signals, result, index)
  round-robin target signal; deterministic synthetic evidence; expires at FUTURE_EXPIRY.

makeSyntheticAttestations(spec, signals)
  expands the four count buckets in fixed order: corroborates, contradicts, reproduced, unknown.
```

Public functions:

```js
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
    subjectDigest: `sha256:${digestObject({ scenario: spec.subject_seed })}`,
    signals,
    attestations,
    applicabilityScope: spec.applicability_scope,
    computedAt: COMPUTED_AT,
    reviewAt: FUTURE_EXPIRY
  });
}
```

No helper may read files, open sockets, spawn processes, call providers, consult wall-clock time, or mutate external state.

- [ ] **Step 6: Assert every required adversarial property**

- honest independent corroboration -> multiple independent operator/node/source clusters;
- 1000-Sybil majority -> one operator cluster, no authority output;
- one operator many agents -> many origins do not imply operator independence;
- same model/detector -> one detector cluster across multiple operators;
- copied upstream feed -> one source cluster;
- conflicting evidence -> contradiction preserved;
- stale replay -> stale digests explicit without timestamp refresh;
- compromised previously reliable peer -> no historical-reputation field or special authority;
- benign novelty -> remains unscored, not declared hostile;
- malicious contradiction -> cannot erase direct observation;
- quarantine DoS attempt -> produces no quarantine/action field;
- applicable/not-applicable pair -> same subject digest, different local applicability scope;
- missing metadata -> null correlation keys count as unknown, not singleton independence.

- [ ] **Step 7: Run repeated simulation and combined regressions**

```bash
cd mesh
for i in 1 2 3; do
  node --test test/cooperative-immune-simulation.test.mjs || exit 1
done
node --test \
  test/cooperative-immune-contracts.test.mjs \
  test/immune-corroboration.test.mjs \
  test/cooperative-immune-simulation.test.mjs \
  test/threat-intelligence-contracts.test.mjs \
  test/threat-intelligence-authority-boundary.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd ..
git add mesh/src/lib/cooperative-immune-simulator.mjs \
  mesh/fixtures/cooperative-immune/adversarial-v0.scenarios.json \
  mesh/test/cooperative-immune-simulation.test.mjs
git commit -m "test: simulate adversarial immune corroboration"
```

---

### Task 4: Add threat model, executable backlog, and documentation registration

**Files:**
- Create: `docs/security/COOPERATIVE-IMMUNE-FABRIC-THREAT-MODEL.md`
- Create: `docs/MASTER-TODO-COOPERATIVE-IMMUNE-FABRIC.md`
- Modify: `docs/README.md`
- Modify: `mesh/src/check-docs.mjs`
- Modify: this plan only if the repository workflow records completed checkboxes.

**Interfaces:**
- Consumes: approved Stage 5B design and H1/H2 evidence.
- Produces: canonical non-claims, later H3-H6 backlog, and doc-verifier coverage.

- [ ] **Step 1: Create the threat model with exact sections**

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

The non-claims section explicitly states that H1/H2 provide no live federation, automatic containment, reputation system, credential revocation, policy mutation, or retaliation capability.

- [ ] **Step 2: Create the master backlog with exact sections**

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

H3-H6 remain explicitly unimplemented/future.

- [ ] **Step 3: Register the spec, plan, threat model, and backlog in `docs/README.md`**

Register:

```text
docs/superpowers/specs/2026-09-13-cooperative-immune-fabric-stage5b-design.md
docs/superpowers/plans/2026-09-13-cooperative-immune-fabric-h1-h2.md
docs/security/COOPERATIVE-IMMUNE-FABRIC-THREAT-MODEL.md
docs/MASTER-TODO-COOPERATIVE-IMMUNE-FABRIC.md
```

Do not promote capability or production claims.

- [ ] **Step 4: Register canonical-document checks**

Add all four paths above to `CANONICAL_DOCUMENTS` in `mesh/src/check-docs.mjs`, plus required-content checks:

```js
'docs/superpowers/specs/2026-09-13-cooperative-immune-fabric-stage5b-design.md': [
  'The swarm may increase knowledge. It must not increase authority.',
  'No one-agent-one-vote security semantics.',
  'No autonomous retaliation.'
],
'docs/superpowers/plans/2026-09-13-cooperative-immune-fabric-h1-h2.md': [
  '## Exact changed-file envelope',
  '### Task 1: Add closed inert Cooperative Immune Fabric contracts',
  '### Task 3: Add deterministic adversarial multi-node simulation'
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

- [ ] **Step 5: Verify documentation and commit**

```bash
cd mesh
node src/check-docs.mjs
cd ..
git add docs/security/COOPERATIVE-IMMUNE-FABRIC-THREAT-MODEL.md \
  docs/MASTER-TODO-COOPERATIVE-IMMUNE-FABRIC.md \
  docs/README.md mesh/src/check-docs.mjs \
  docs/superpowers/plans/2026-09-13-cooperative-immune-fabric-h1-h2.md
git commit -m "docs: register cooperative immune H1 H2 boundary"
```

Expected: doc check PASS before commit.

---

### Task 5: Final authority, scope, and release verification

**Files:** none unless a failure exposes a defect inside the exact changed-file envelope.

- [ ] **Step 1: Patch sanity**

```bash
git diff --check main...HEAD
```

Expected: no output.

- [ ] **Step 2: Prove forbidden paths did not change**

```bash
if git diff --name-only main...HEAD | grep -E '^(mesh/config/capabilities\.json|mesh/src/(gateway|hypervisor|sandbox|grid)|.*credential|.*network|.*relay)'; then
  echo "Forbidden H1/H2 scope expansion detected" >&2
  exit 1
fi
```

Expected: no matches.

- [ ] **Step 3: Prove H1/H2 source contains no live I/O primitive**

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

- [ ] **Step 4: Run focused H0+H1+H2 verification**

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
cd ..
```

Expected: PASS.

- [ ] **Step 5: Run repository-required verification from repository root**

```bash
npm run check
npm run release:verify
```

Expected: PASS. If unrelated pre-existing failures occur, record them exactly and do not call the branch fully green.

- [ ] **Step 6: Final claim-integrity inspection**

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

Confirm:

- no output object carries authority;
- the 1000-Sybil scenario has one operator cluster when configured that way;
- contradictory and stale evidence remain explicit;
- `confidence_band` remains `unscored`;
- no live transport or containment implementation exists;
- H3-H6 remain future work.

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

## Self-review record

- **Spec coverage:** H1 contracts, independence/correlation, Sybil/correlation resistance, contradiction, staleness, inert privacy-oriented evidence, and all required H2 adversarial scenarios map to Tasks 1-3. Threat model, later H3-H6 backlog, canonical documentation, and non-claims map to Task 4. Authority/no-retaliation and scope enforcement are rechecked in Task 5.
- **Deliberate exclusions:** live exchange, signed portable-package verification, real containment, credential revocation, policy mutation, live adaptive-memory propagation, BFT/shared finality, and retaliation are H3+ work requiring later gates.
- **Type consistency:** all tasks use the exact `ImmuneSignal`, `ImmuneAttestation`, `CorroborationSet`, independence-dimension, and correlation-cluster names defined in Task 1.
- **Helper completeness:** exported correlation helpers validate their inputs; every private helper referenced by Task 2 or Task 3 has an exact signature/behavior in this plan.
- **Timing consistency:** synthetic stale evidence is observed before it expires, and expires before/equal to corroboration time.
- **Cardinality consistency:** scenario validation caps total attestations at 1,024, matching the contract.
- **No hidden score:** `confidence_band` is fixed to `unscored`.
- **No unresolved placeholders:** tasks contain exact files, interfaces, tests, commands, expected outcomes, and stop conditions.
