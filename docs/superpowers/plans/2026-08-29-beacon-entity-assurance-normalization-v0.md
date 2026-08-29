# Beacon Entity Assurance Normalization v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert a locally verified Beacon-style external observation into bounded, non-authorizing Entity Assurance provenance evidence for a deterministic key-derived pseudonymous subject.

**Architecture:** Add one pure bridge module and focused tests. The bridge re-runs the existing Beacon verifier, validates the existing Agent Provider Profile, derives the subject from the verified Ed25519 key fingerprint, binds the evidence basis to the exact provider and observation digests, and delegates final evidence shaping to the existing Entity Assurance normalizer. No schema version is changed and no authority/network/runtime path is touched.

**Tech Stack:** Node.js ESM, built-in `node:test`/`node:assert`, built-in `node:crypto`, existing `canonical.mjs`, `agent-provider-profile.mjs`, `beacon-observation-candidate.mjs`, and `entity-assurance.mjs`; zero new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-29-beacon-entity-assurance-normalization-design.md`

## Global Constraints

- Node support remains `>=22.23.2 <23 || >=24.14.0 <25`.
- The bridge is local, pure, deterministic, and non-mutating.
- It performs no network, filesystem, subprocess, Grid, Gateway, credential, wallet, token, or secret operation.
- It re-verifies the Beacon envelope rather than trusting a caller-supplied verification receipt.
- The caller cannot choose an arbitrary Entity Assurance subject.
- The Entity Assurance subject is derived from the verified sender-key fingerprint.
- Output is fixed to `provenance`, `measured`, `moderate`, `pseudonymous`, `non_authorizing: true`.
- No capability in `mesh/config/capabilities.json` is promoted or modified.
- No production-promotion state is changed.

---

### Task 1: Failing normalization contract tests

**Files:**
- Create: `mesh/test/beacon-entity-assurance-evidence.test.mjs`

**Interfaces:**
- Consumes: existing Beacon envelope signing pattern and provider profile contract.
- Produces: desired API names `beaconEntityAssuranceSubjectId()` and `normalizeBeaconObservationEntityAssuranceEvidence()`.

- [ ] **Step 1: Write the failing test file**

The test imports the not-yet-created module:

```js
import {
  beaconEntityAssuranceSubjectId,
  normalizeBeaconObservationEntityAssuranceEvidence
} from '../src/lib/beacon-entity-assurance-evidence.mjs';
```

Create helpers matching `beacon-observation-candidate.test.mjs` to generate Ed25519 keys and sign a canonical observation envelope. Create a valid agent-interop provider profile fixture with:

```js
provider_id: 'provider.interop.beacon'
provider_class: 'agent-interop'
profile_ref: 'profile.interop.beacon.v0'
evidence_classes: ['signed-envelope', 'replay-protected-envelope']
assurance_ceiling: 'cryptographic'
```

Add tests proving:

```js
const evidence = normalizeBeaconObservationEntityAssuranceEvidence({
  envelope,
  provider_profile: profile,
  now: '2026-08-29T19:01:00.000Z',
  seen_replay_keys: []
});

assert.equal(evidence.dimension, 'provenance');
assert.equal(evidence.result, 'pass');
assert.equal(evidence.strength, 'moderate');
assert.equal(evidence.evidence_class, 'measured');
assert.equal(evidence.binding_scope, 'pseudonymous');
assert.equal(evidence.non_authorizing, true);
assert.equal(evidence.authority_granted, false);
assert.equal(evidence.observed_at, envelope.issued_at);
assert.equal(evidence.expires_at, envelope.expires_at);
assert.match(evidence.subject_id, /^external\.beacon\.key\.[a-f0-9]{64}$/);
assert.match(evidence.basis_digest, /^[a-f0-9]{64}$/);
assert.match(evidence.evidence_digest, /^[a-f0-9]{64}$/);
```

Also assert:

```js
assert.equal(
  evidence.subject_id,
  beaconEntityAssuranceSubjectId(
    verifyBeaconObservationEnvelope(envelope, options).sender_key_fingerprint
  )
);
```

- [ ] **Step 2: Add fail-closed cases**

Add separate tests for:

```text
- tampered signed envelope -> throws
- replay snapshot containing the envelope replay key -> throws
- provider_class != agent-interop -> throws
- missing signed-envelope -> throws
- missing replay-protected-envelope -> throws
- assurance_ceiling = behavioral -> throws
- input contains subject_id -> throws unknown field
```

- [ ] **Step 3: Add Entity Assurance integration proof**

Create an `axiom-entity-assurance-policy.v1` fixture requiring:

```js
{
  dimension: 'provenance',
  minimum_strength: 'moderate',
  accepted_evidence_classes: ['measured']
}
```

Evaluate:

```js
const decision = evaluateEntityAssurance({
  policy,
  evidence: [evidence],
  subjectId: evidence.subject_id,
  now: '2026-08-29T19:01:00.000Z'
});

assert.equal(decision.satisfied, true);
assert.equal(decision.authority_granted, false);
assert.equal(decision.delegation_granted, false);
```

- [ ] **Step 4: Open a draft PR and verify RED**

Expected full-suite failure: `ERR_MODULE_NOT_FOUND` for `mesh/src/lib/beacon-entity-assurance-evidence.mjs`.

---

### Task 2: Minimal Beacon-to-Entity-Assurance bridge

**Files:**
- Create: `mesh/src/lib/beacon-entity-assurance-evidence.mjs`
- Test: `mesh/test/beacon-entity-assurance-evidence.test.mjs`

**Interfaces:**
- Consumes:
  - `validateAgentProviderProfile(profile)`
  - `agentProviderProfileDigest(profile)`
  - `verifyBeaconObservationEnvelope(envelope, options)`
  - `digestObject(value)`
  - `normalizeEntityAssuranceEvidence(raw)`
- Produces:
  - `beaconEntityAssuranceSubjectId(senderKeyFingerprint)`
  - `normalizeBeaconObservationEntityAssuranceEvidence(input)`

- [ ] **Step 1: Implement exact input validation**

The bridge input must be a plain object containing exactly:

```text
envelope
provider_profile
now
seen_replay_keys
```

Any other key, including `subject_id`, fails closed.

- [ ] **Step 2: Validate provider semantics**

Call `validateAgentProviderProfile(provider_profile)` and require:

```js
provider_class === 'agent-interop'
evidence_classes includes 'signed-envelope'
evidence_classes includes 'replay-protected-envelope'
assurance_ceiling in new Set(['cryptographic', 'hardware-rooted'])
```

Do not infer trust or authority from these declarations.

- [ ] **Step 3: Re-run Beacon verification**

Call:

```js
const verification = verifyBeaconObservationEnvelope(envelope, {
  now,
  seen_replay_keys
});
```

Do not accept a verification receipt as input.

- [ ] **Step 4: Derive the pseudonymous subject**

Validate the 64-lower-hex sender-key fingerprint and return:

```js
`external.beacon.key.${senderKeyFingerprint}`
```

No caller override is permitted.

- [ ] **Step 5: Construct deterministic evidence**

Compute:

```js
const basisDigest = digestObject({
  provider_profile_digest: agentProviderProfileDigest(provider_profile),
  observation_digest: verification.observation_digest,
  sender_key_fingerprint: verification.sender_key_fingerprint,
  replay_key: verification.replay_key
});
```

Then call `normalizeEntityAssuranceEvidence()` with:

```js
{
  schema: 'axiom-entity-assurance-evidence.v1',
  evidence_id: `evidence.beacon.provenance.${verification.observation_digest}`,
  subject_id: beaconEntityAssuranceSubjectId(verification.sender_key_fingerprint),
  dimension: 'provenance',
  result: 'pass',
  strength: 'moderate',
  evidence_class: 'measured',
  basis_digest: basisDigest,
  issuer_id: null,
  binding_scope: 'pseudonymous',
  observed_at: envelope.issued_at,
  expires_at: envelope.expires_at,
  non_authorizing: true
}
```

Return the normalized evidence object directly.

- [ ] **Step 6: Verify GREEN**

Run the full protected test workflow. Expected: new normalization tests pass and no existing test regresses.

---

### Task 3: Static zero-effect regression

**Files:**
- Modify: `mesh/test/agent-provider-boundary-static.test.mjs`

**Interfaces:**
- Consumes: source text of the new bridge module.
- Produces: regression proof that the bridge cannot silently grow an execution/secret/network surface.

- [ ] **Step 1: Write the failing static assertion before any broadening**

Extend the existing source-surface test so `beacon-entity-assurance-evidence.mjs` is scanned alongside the provider binding and Beacon verifier.

The assertion must reject imports/references for:

```text
node:http
node:https
node:net
node:tls
node:dgram
node:fs
node:child_process
Gateway
Hypervisor
Sandbox
Grid
credential
wallet
token
secret
```

Allow only the expected local libraries and existing pure verifier/profile/assurance dependencies.

- [ ] **Step 2: Run the targeted/static and full tests**

Expected: GREEN with no new runtime surface.

---

### Task 4: Canonical documentation registration and architecture status

**Files:**
- Modify: `mesh/src/check-docs.mjs`
- Modify: `docs/superpowers/specs/2026-08-29-extensible-agent-provider-substrate-design.md`
- Existing new docs:
  - `docs/superpowers/specs/2026-08-29-beacon-entity-assurance-normalization-design.md`
  - `docs/superpowers/plans/2026-08-29-beacon-entity-assurance-normalization-v0.md`

**Interfaces:**
- Consumes: exact canonical-document list.
- Produces: docs checker recognition and an accurate provider-substrate status record.

- [ ] **Step 1: Add a failing canonical-doc registration regression or run `check-docs`**

Expected: RED because the two new Markdown files are not yet in `CANONICAL_DOCUMENTS`.

- [ ] **Step 2: Register exactly the two new docs**

Add only the two paths to `CANONICAL_DOCUMENTS`.

- [ ] **Step 3: Update the parent provider design**

Record that the normalization slice now:

```text
- re-verifies Beacon observations locally;
- binds evidence to a key-derived pseudonymous subject;
- emits only moderate measured provenance evidence;
- remains non-authorizing;
- does not bind the key to an AXIOM principal.
```

Do not claim live Beacon compatibility, durable replay, identity enrollment, or authorization.

- [ ] **Step 4: Verify docs GREEN**

Run the canonical docs check and full test suite.

---

### Task 5: Protected verification and PR review gate

**Files:** none unless verification exposes a defect.

- [ ] **Step 1: Review diff scope**

Confirm no modification to:

```text
mesh/config/capabilities.json
Gateway/Hypervisor/Sandbox/Grid authority code
principal or credential stores
network policy
production-promotion state
```

- [ ] **Step 2: Run protected CI on the exact final head**

Require:

```text
Clean Kernel = success
Node 22 compatibility = success
container deny-egress/isolation = success
Windows compatibility = success
macOS ARM = success
macOS Intel = success
CodeQL changed-code analysis = success / no new alerts
```

- [ ] **Step 3: Update PR body with exact claims and non-claims**

State that Entity Assurance satisfaction remains non-authorizing and that this bridge creates evidence only for a key-derived pseudonymous subject.

- [ ] **Step 4: Leave merge as a separate protected integration action**

Do not bypass branch protection or merge a failing/uncertain head.
