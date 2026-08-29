# Extensible Agent Provider Substrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a deterministic, zero-authority Agent Provider Profile v0 contract that describes replaceable memory, knowledge-projection, agent-interoperability, attestation, provenance, and settlement providers without activating them or granting authority.

**Architecture:** Add one exact JSON Schema, one pure semantic validator/digest module, and a small set of inert laboratory example profiles. Reuse `mesh/src/lib/canonical.mjs` for deterministic digests and validation errors. No Gateway, Hypervisor, Sandbox, Grid, principal, credential, policy, capability-registry, network, or settlement execution path changes.

**Tech Stack:** Node.js ESM, built-in `node:test`/`node:assert`, JSON Schema Draft 2020-12, existing canonical helpers, zero new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-29-extensible-agent-provider-substrate-design.md`

## Global Constraints

- Provider declaration is descriptive, not activating.
- Provider identity, discovery, evidence, cryptographic signatures, hardware evidence, reputation, or payment capability do not grant AXIOM authority.
- Privileged effects remain on `Gateway -> Hypervisor -> Sandbox -> Grid`.
- Unknown fields fail closed.
- Secret-bearing generic configuration is not representable.
- Validation is pure, local, deterministic, and non-mutating.
- No provider process is started and no network call is performed.
- No capability in `mesh/config/capabilities.json` is promoted or modified.
- Node support remains `>=22.23.2 <23 || >=24.14.0 <25`.

---

## File Structure

- Create `mesh/config/agent-provider-profile-v0.schema.json` — exact machine-readable contract.
- Create `mesh/src/lib/agent-provider-profile.mjs` — pure semantic validation and deterministic digest.
- Create `mesh/test/agent-provider-profile-schema.test.mjs` — schema boundary tests.
- Create `mesh/test/agent-provider-profile.test.mjs` — semantic validator and negative tests.
- Create six `agent-commons/provider-lab/*.json` profiles — inert ecosystem mappings.
- Create `mesh/test/agent-provider-lab.test.mjs` — validates all laboratory profiles and hard non-claims.
- Modify no authority or capability-registry file.

### Task 1: Machine-readable Provider Profile v0

**Files:**
- Create: `mesh/test/agent-provider-profile-schema.test.mjs`
- Create: `mesh/config/agent-provider-profile-v0.schema.json`

**Interfaces:**
- Consumes: JSON parsing only.
- Produces: schema identity `axiom-agent-provider-profile.v0` and exact closed-world fields used by the semantic validator.

- [ ] **Step 1: Write the failing schema test**

The test reads `../config/agent-provider-profile-v0.schema.json` and asserts:

```js
assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.equal(schema.properties.schema.const, 'axiom-agent-provider-profile.v0');
assert.equal(schema.properties.version.const, 0);
assert.equal(schema.properties.status.const, 'inert-provider-laboratory');
assert.deepEqual(schema.properties.provider_class.enum, [
  'memory',
  'knowledge-projection',
  'agent-interop',
  'attestation',
  'provenance',
  'settlement'
]);
assert.equal(schema.properties.authority_effect.const, 'none');
assert.equal(schema.properties.trust_effect.const, 'evidence-only');
assert.equal(schema.properties.credential_visibility.const, 'none');
assert.equal(schema.properties.network_effect.const, 'none');
assert.equal(schema.properties.runtime_activation.const, false);
assert.equal(schema.properties.settlement_activation.const, false);
assert.equal(schema.additionalProperties, false);
assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/agent-provider-profile.mjs');
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `node --test mesh/test/agent-provider-profile-schema.test.mjs`

Expected: FAIL because `mesh/config/agent-provider-profile-v0.schema.json` does not exist.

- [ ] **Step 3: Add the exact Draft 2020-12 schema**

Required top-level fields:

```text
schema, version, status, provider_id, provider_class,
implementation, profile_ref, capabilities, evidence_classes,
assurance_ceiling, created_at, updated_at,
authority_effect, trust_effect, credential_visibility,
network_effect, runtime_activation, settlement_activation
```

`implementation` is an exact object containing:

```text
artifact_ref, artifact_digest, source_kind, upstream_ref
```

with `source_kind = local | external | fork | adapter` and nullable `upstream_ref`.

Identifiers use `/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/`; digests use `/^[a-f0-9]{64}$/`. `capabilities` contains 1-32 unique identifier strings. `evidence_classes` contains 1-16 unique values from the spec. Set `additionalProperties: false` on every object.

- [ ] **Step 4: Run the targeted test and verify GREEN**

Run: `node --test mesh/test/agent-provider-profile-schema.test.mjs`

Expected: PASS.

### Task 2: Pure semantic validator and digest

**Files:**
- Create: `mesh/test/agent-provider-profile.test.mjs`
- Create: `mesh/src/lib/agent-provider-profile.mjs`

**Interfaces:**
- Consumes: `digestObject` and `ValidationError` from `mesh/src/lib/canonical.mjs`.
- Produces:
  - `AGENT_PROVIDER_PROFILE_SCHEMA = 'axiom-agent-provider-profile.v0'`
  - `validateAgentProviderProfile(profile) -> frozen summary`
  - `agentProviderProfileDigest(profile) -> 64-character lowercase SHA-256 digest`

- [ ] **Step 1: Write failing semantic tests**

Use a complete fixture and test:

```js
const DIGEST = 'a'.repeat(64);

function validProfile() {
  return {
    schema: 'axiom-agent-provider-profile.v0',
    version: 0,
    status: 'inert-provider-laboratory',
    provider_id: 'provider.memory.example',
    provider_class: 'memory',
    implementation: {
      artifact_ref: 'artifact.memory.example.v1',
      artifact_digest: DIGEST,
      source_kind: 'external',
      upstream_ref: 'upstream.memory.example'
    },
    profile_ref: 'profile.memory.example.v1',
    capabilities: ['memory.semantic', 'memory.episodic'],
    evidence_classes: ['deterministic-derivation'],
    assurance_ceiling: 'none',
    created_at: '2026-08-29T12:00:00.000Z',
    updated_at: '2026-08-29T12:00:00.000Z',
    authority_effect: 'none',
    trust_effect: 'evidence-only',
    credential_visibility: 'none',
    network_effect: 'none',
    runtime_activation: false,
    settlement_activation: false
  };
}
```

Required tests:

- validates each of the six provider classes;
- returns a frozen non-authoritative summary;
- digest is deterministic across top-level key order;
- unknown/secret-bearing fields such as `api_key`, `cookie`, or `payment_token` fail closed;
- invalid evidence classes/source kinds/assurance ceilings fail closed;
- duplicate capabilities/evidence classes fail closed;
- arrays over limits fail closed;
- malformed identifiers/digests fail closed;
- `updated_at` cannot precede `created_at`;
- any hard-boundary field change fails closed;
- validation does not mutate a deeply frozen profile.

- [ ] **Step 2: Run targeted test and verify RED**

Run: `node --test mesh/test/agent-provider-profile.test.mjs`

Expected: FAIL because `mesh/src/lib/agent-provider-profile.mjs` does not exist.

- [ ] **Step 3: Implement the minimal pure validator**

Follow the exact-object, identifier, digest, timestamp, bounded-array, and duplicate-detection patterns already used by `mesh/src/lib/agent-composition.mjs`. Do not import filesystem, network, process-execution, credential, policy, or Gateway modules.

Return:

```js
Object.freeze({
  valid: true,
  schema: profile.schema,
  provider_id: profile.provider_id,
  provider_class: profile.provider_class,
  profile_ref: profile.profile_ref,
  provider_digest: digestObject(profile),
  assurance_ceiling: profile.assurance_ceiling,
  authority_effect: 'none',
  trust_effect: 'evidence-only',
  network_effect: 'none',
  runtime_activation: false,
  settlement_activation: false
});
```

- [ ] **Step 4: Run targeted test and verify GREEN**

Run: `node --test mesh/test/agent-provider-profile.test.mjs`

Expected: PASS.

### Task 3: Inert ecosystem laboratory profiles

**Files:**
- Create: `agent-commons/provider-lab/memory-os.v0.json`
- Create: `agent-commons/provider-lab/graft.v0.json`
- Create: `agent-commons/provider-lab/beacon.v0.json`
- Create: `agent-commons/provider-lab/rustchain-physical-attestation.v0.json`
- Create: `agent-commons/provider-lab/avap.v0.json`
- Create: `agent-commons/provider-lab/x402.v0.json`
- Create: `mesh/test/agent-provider-lab.test.mjs`

**Interfaces:**
- Consumes: `validateAgentProviderProfile`.
- Produces: six inert examples proving the provider classes can describe external architectures without importing their authority assumptions.

- [ ] **Step 1: Write the failing lab test**

The test reads all six JSON files, validates each profile, and asserts the class mapping:

```text
memory-os -> memory
graft -> knowledge-projection
beacon -> agent-interop
rustchain-physical-attestation -> attestation
avap -> provenance
x402 -> settlement
```

For every result assert:

```js
assert.equal(result.authority_effect, 'none');
assert.equal(result.trust_effect, 'evidence-only');
assert.equal(result.network_effect, 'none');
assert.equal(result.runtime_activation, false);
assert.equal(result.settlement_activation, false);
```

Also assert the RustChain-style profile uses `assurance_ceiling: 'behavioral'` plus `behavioral-fingerprint`, not `hardware-rooted-attestation`; Beacon uses cryptographic signed/replay-protected envelope evidence; AVAP uses signed-envelope/content-digest/transformation-lineage/external-anchor; x402 uses payment-proof but settlement remains inactive.

- [ ] **Step 2: Run targeted test and verify RED**

Run: `node --test mesh/test/agent-provider-lab.test.mjs`

Expected: FAIL because the laboratory profiles do not exist.

- [ ] **Step 3: Add the six exact inert profiles**

Use stable placeholder artifact digests (`sha256`-format test commitments) and identifier-only upstream references. Do not include URLs, credentials, endpoints, headers, wallets, token values, or executable configuration.

- [ ] **Step 4: Run targeted test and verify GREEN**

Run: `node --test mesh/test/agent-provider-lab.test.mjs`

Expected: PASS.

### Task 4: Full verification and review

**Files:** no additional production files required.

- [ ] **Step 1: Run targeted provider tests**

Run:

```bash
node --test mesh/test/agent-provider-profile-schema.test.mjs mesh/test/agent-provider-profile.test.mjs mesh/test/agent-provider-lab.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run complete kernel tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Run supported repository checks**

Run: `npm run check`

Expected: PASS.

- [ ] **Step 4: Confirm scope boundary**

Verify the diff does not modify:

```text
mesh/config/capabilities.json
Gateway/Hypervisor/Sandbox/Grid authority code
principal or credential stores
network policy
production promotion state
```

- [ ] **Step 5: Open a draft PR**

The PR must state the explicit non-claims: no provider execution, no external interoperability claim, no hardware-root proof, no settlement activation, no authority grant, and no capability promotion.

### Task 5: Beacon observation to Entity Assurance provenance normalization

**Files:**
- Create: `mesh/test/beacon-entity-assurance-evidence.test.mjs`
- Create: `mesh/src/lib/beacon-entity-assurance-evidence.mjs`
- Modify: `mesh/test/agent-provider-boundary-static.test.mjs`
- Modify: `docs/superpowers/specs/2026-08-29-extensible-agent-provider-substrate-design.md`

**Interfaces:**
- Consumes:
  - `validateAgentProviderProfile(profile)`
  - `agentProviderProfileDigest(profile)`
  - `verifyBeaconObservationEnvelope(envelope, options)`
  - `digestObject(value)`
  - `normalizeEntityAssuranceEvidence(raw)`
- Produces:
  - `beaconEntityAssuranceSubjectId(senderKeyFingerprint)`
  - `normalizeBeaconObservationEntityAssuranceEvidence({ envelope, provider_profile, now, seen_replay_keys })`

- [ ] **Step 1: Define the failing normalization contract**

Write tests first that require the new module and prove the exported evidence artifact is fixed to:

```text
subject_id = external.beacon.key.<verified-key-fingerprint>
dimension = provenance
result = pass
strength = moderate
evidence_class = measured
issuer_id = null
binding_scope = pseudonymous
non_authorizing = true
evidence_digest = <canonical digest>
```

The exported artifact must remain valid input to `evaluateEntityAssurance()`. Therefore derived decision/presentation fields such as `authority_granted` are not part of the evidence artifact. Tests must also prove deterministic output, tamper/replay rejection, provider-class/evidence/assurance-ceiling enforcement, and rejection of a caller-supplied `subject_id`.

- [ ] **Step 2: Verify RED**

Run the targeted Node test before creating the module. Expected: `ERR_MODULE_NOT_FOUND` for `mesh/src/lib/beacon-entity-assurance-evidence.mjs`.

- [ ] **Step 3: Implement the minimal bridge**

The input object contains exactly:

```text
envelope
provider_profile
now
seen_replay_keys
```

The bridge validates the provider profile, requires `provider_class = agent-interop`, requires `signed-envelope` and `replay-protected-envelope`, requires assurance ceiling `cryptographic | hardware-rooted`, and then re-runs `verifyBeaconObservationEnvelope()` itself.

Derive:

```js
const subjectId = `external.beacon.key.${verification.sender_key_fingerprint}`;
const basisDigest = digestObject({
  provider_profile_digest: agentProviderProfileDigest(provider_profile),
  observation_digest: verification.observation_digest,
  sender_key_fingerprint: verification.sender_key_fingerprint,
  replay_key: verification.replay_key
});
```

Delegate validation/canonical digesting to `normalizeEntityAssuranceEvidence()` with fixed moderate measured provenance semantics, then export only the schema-valid evidence artifact fields plus `evidence_digest`. Do not export the normalizer's derived `authority_granted` presentation field, and do not accept a verification receipt or caller-selected subject.

- [ ] **Step 4: Prove Entity Assurance integration remains non-authorizing**

Pass the exported evidence artifact directly to `evaluateEntityAssurance()` with a policy requiring moderate measured provenance. The decision may be satisfied, but tests must assert:

```js
assert.equal(decision.authority_granted, false);
assert.equal(decision.delegation_granted, false);
```

- [ ] **Step 5: Extend the static zero-effect guard**

Scan `mesh/src/lib/beacon-entity-assurance-evidence.mjs` with the existing provider boundary test and reject network, filesystem, subprocess, Grid, credential, wallet, token, or secret runtime imports/effects.

- [ ] **Step 6: Keep canonical documentation disciplined**

Integrate the normalization design and implementation record into this existing canonical provider spec/plan rather than proliferating parallel canonical documents. Preserve intermediate design/plan commits in branch history, but keep the supported documentation tree exact.

- [ ] **Step 7: Run protected verification on the exact final head**

Require Clean Kernel, Node 22, container deny-egress/isolation, Windows, macOS ARM, macOS Intel, and CodeQL changed-code analysis to pass. Confirm no capability registry, authority-path, principal/credential-store, network-policy, or production-promotion change.
