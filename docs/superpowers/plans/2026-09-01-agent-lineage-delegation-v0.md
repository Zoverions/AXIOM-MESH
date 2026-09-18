# Agent Lineage Delegation v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a non-production-reachable laboratory primitive that proves machine-child authority attenuation, bounded recursive lineage metadata, and signed provenance without weakening `axiom-machine-principal.v1` or authorizing spawning.

**Architecture:** Add one focused library module beside the existing machine-principal and agent-trust primitives. The module normalizes a strict spawn proposal, checks parent→child attenuation, signs/verifies a lineage attestation with Ed25519, and verifies descendant chain links. No Gateway route, runtime adapter, identity issuance, capability-registry promotion, or production effect path is added.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, `node:crypto` Ed25519, existing canonicalization/digest helpers, existing machine-principal normalization.

**Spec:** `docs/rebuild/AGENT-LINEAGE-AND-RECURSIVE-IMPROVEMENT.md`

## Global Constraints

- Preserve `axiom-machine-principal.v1` unchanged, including `delegation.allowed=false` and `max_depth=0`.
- Child principal must retain the same human sponsor as parent in this slice.
- No wildcard scopes, administrator role, or authority widening may be introduced.
- New lineage artifacts are evidence-only and must have `authority_effect=none` and `delegation_effect=none`.
- No Gateway route, supported effect path, runtime spawning path, or capability-registry promotion in v0.
- Fail closed on unknown fields, digest mismatch, signature failure, malformed canonical timestamps, and non-attenuated authority/resource ceilings.
- Node engine support remains the repository's existing `>=22.23.2 <23 || >=24.14.0 <25` range.
- Naming remains substrate-neutral; no provisional rebrand is introduced.

---

### Task 1: Specify and threat-model the laboratory boundary

**Files:**
- Create: `docs/rebuild/AGENT-LINEAGE-AND-RECURSIVE-IMPROVEMENT.md`
- Create: `agent-commons/agent-lineage-delegation-threat-model.json`

**Interfaces:**
- Consumes: current `axiom-machine-principal.v1` semantics.
- Produces: exact invariants and non-claims used by tests and implementation.

- [x] **Step 1: Write the design baseline**

Document human-sponsor continuity, set/budget attenuation, bounded depth, signed provenance, and the explicit non-authorizing boundary.

- [ ] **Step 2: Add the machine-readable threat model**

Cover authority amplification, budget laundering, lineage forgery, parent substitution, replay/currentness confusion, sponsor substitution, expiry widening, recursive-depth bypass, signature/key substitution, trust inheritance, and capability-promotion confusion.

- [ ] **Step 3: Validate JSON syntax**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('agent-commons/agent-lineage-delegation-threat-model.json','utf8')); console.log('ok')"
```

Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add docs/rebuild/AGENT-LINEAGE-AND-RECURSIVE-IMPROVEMENT.md agent-commons/agent-lineage-delegation-threat-model.json
git commit -m "docs: define bounded agent lineage substrate"
```

### Task 2: Write failing attenuation tests

**Files:**
- Create: `mesh/test/agent-lineage-delegation.test.mjs`
- Create later: `mesh/src/lib/agent-lineage-delegation.mjs`

**Interfaces:**
- Consumes: `normalizeMachinePrincipalDefinition()` from `mesh/src/lib/machine-principal.mjs`.
- Produces expected API:
  - `normalizeAgentSpawnProposal(raw, options)`
  - `createAgentLineageAttestation(args)`
  - `verifyAgentLineageAttestation(raw, options)`
  - `verifyAgentLineageLink(args)`
  - `AGENT_SPAWN_PROPOSAL_SCHEMA`
  - `AGENT_LINEAGE_ATTESTATION_SCHEMA`

- [ ] **Step 1: Write the failing happy-path test**

The test creates a parent v1 principal and a strictly narrower ephemeral child, then calls `normalizeAgentSpawnProposal()` and asserts:

```js
assert.equal(proposal.schema, 'axiom-agent-spawn-proposal.v1');
assert.equal(proposal.root_sponsor, 'owner.alice');
assert.equal(proposal.parent.id, 'agent.coordinator.1');
assert.equal(proposal.child.id, 'agent.researcher.1');
assert.equal(proposal.semantics.spawn_authorized, false);
assert.equal(proposal.semantics.trust_inherited, false);
assert.match(proposal.proposal_digest, /^[a-f0-9]{64}$/);
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run:

```bash
cd mesh && node --test test/agent-lineage-delegation.test.mjs
```

Expected: FAIL because `../src/lib/agent-lineage-delegation.mjs` does not exist.

- [ ] **Step 3: Commit the red test**

```bash
git add mesh/test/agent-lineage-delegation.test.mjs
git commit -m "test: define agent lineage attenuation contract"
```

### Task 3: Implement spawn-proposal normalization and authority attenuation

**Files:**
- Create: `mesh/src/lib/agent-lineage-delegation.mjs`
- Test: `mesh/test/agent-lineage-delegation.test.mjs`

**Interfaces:**
- Consumes: `ValidationError`, `assertPlainObject`, `assertString`, `canonicalJson`, `digestObject`, `sha256`; `normalizeMachinePrincipalDefinition`.
- Produces: `normalizeAgentSpawnProposal(raw, { knownHumanPrincipals, now })`.

- [ ] **Step 1: Add RED tests for every authority dimension**

For each dimension, construct a child that exceeds the parent and assert rejection with a dimension-specific error:

```js
assert.throws(() => normalizeAgentSpawnProposal(proposalWith({ child: childWithExtraAction })), /actions exceed parent ceiling/);
assert.throws(() => normalizeAgentSpawnProposal(proposalWith({ child: childWithExtraPurpose })), /purposes exceed parent ceiling/);
assert.throws(() => normalizeAgentSpawnProposal(proposalWith({ child: childWithExtraDestination })), /destinations exceed parent ceiling/);
assert.throws(() => normalizeAgentSpawnProposal(proposalWith({ child: childWithExtraScope })), /scopes exceed parent ceiling/);
assert.throws(() => normalizeAgentSpawnProposal(proposalWith({ child: childWithExtraRole })), /roles exceed parent ceiling/);
```

- [ ] **Step 2: Add RED tests for budgets and lifetime**

Assert rejection for each machine budget increase, changed sponsor, parent-ID reuse, persistent child, child expiry after non-persistent parent, proposal expiry after child, task purpose absent from child purposes, and proposal lifetime already expired.

- [ ] **Step 3: Run targeted tests and verify RED**

Run:

```bash
cd mesh && node --test test/agent-lineage-delegation.test.mjs
```

Expected: FAIL on missing behavior.

- [ ] **Step 4: Implement strict normalization**

Implementation requirements:

```js
export const AGENT_SPAWN_PROPOSAL_SCHEMA = 'axiom-agent-spawn-proposal.v1';

export function normalizeAgentSpawnProposal(raw, {
  knownHumanPrincipals = null,
  now = new Date()
} = {}) { /* strict validation and digest */ }
```

Use exact top-level key checking. Normalize parent and child through the existing v1 normalizer. Compare roles/scopes/actions/purposes/destinations with exact subset semantics. Compare all five existing machine budgets numerically. Reject persistent child. Require same sponsor and distinct principal IDs. Bind task `purpose` to a permitted child purpose. Require canonical UTC timestamps. Require `expires_at <= child.expires_at`; also require `child.expires_at <= parent.expires_at` when parent is non-persistent.

- [ ] **Step 5: Run targeted tests and verify GREEN**

Run:

```bash
cd mesh && node --test test/agent-lineage-delegation.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add mesh/src/lib/agent-lineage-delegation.mjs mesh/test/agent-lineage-delegation.test.mjs
git commit -m "feat: enforce attenuated agent spawn proposals"
```

### Task 4: Add signed lineage attestations

**Files:**
- Modify: `mesh/src/lib/agent-lineage-delegation.mjs`
- Modify: `mesh/test/agent-lineage-delegation.test.mjs`

**Interfaces:**
- Consumes normalized spawn proposals.
- Produces:
  - `createAgentLineageAttestation({ proposal, issuerId, issuerPrivateKey })`
  - `verifyAgentLineageAttestation(raw, { trustedIssuerPublicKey, expectedIssuerId, knownHumanPrincipals, now })`

- [ ] **Step 1: Write RED signature-roundtrip test**

Generate an Ed25519 keypair with `generateKeyPairSync('ed25519')`, create an attestation, verify it with the public key, and assert exact proposal/issuer bindings plus fixed non-authorizing semantics.

- [ ] **Step 2: Write RED tamper/key-substitution tests**

Assert verification rejects a modified proposal, modified proposal digest, modified attestation digest, modified signature, wrong issuer ID, and a different trusted public key.

- [ ] **Step 3: Run targeted tests and verify RED**

Run the targeted test file and observe failures for missing attestation functions.

- [ ] **Step 4: Implement Ed25519 envelope creation and verification**

Canonical signed material must include schema, issuer ID/key ID, normalized proposal, and proposal digest. Compute an attestation digest over the signed envelope plus signature. Do not expose private-key material. Fixed semantics remain inside the normalized proposal and must reproduce exactly during verification.

- [ ] **Step 5: Run targeted tests and verify GREEN**

Expected: all lineage tests PASS.

- [ ] **Step 6: Commit**

```bash
git add mesh/src/lib/agent-lineage-delegation.mjs mesh/test/agent-lineage-delegation.test.mjs
git commit -m "feat: sign agent lineage provenance"
```

### Task 5: Enforce recursive chain attenuation

**Files:**
- Modify: `mesh/src/lib/agent-lineage-delegation.mjs`
- Modify: `mesh/test/agent-lineage-delegation.test.mjs`

**Interfaces:**
- Consumes: verified parent lineage attestation and normalized child proposal.
- Produces: `verifyAgentLineageLink({ parentAttestation, childProposal })` returning an immutable summary on success.

- [ ] **Step 1: Write RED valid-chain test**

Create generation 1 coordinator→researcher, attest it, then generation 2 researcher→citation-checker. Require generation 2 `parent_attestation_digest` to equal the exact generation 1 attestation digest and `lineage_depth=2`.

- [ ] **Step 2: Write RED recursive-ceiling tests**

Assert rejection when generation 2 increases any of:

```text
max_children
max_total_descendants
max_depth
token_budget
storage_bytes
wall_clock_ms
```

Also reject depth skips, missing/wrong parent attestation digest, and a proposal whose parent-principal digest does not equal the previous attestation's child-principal digest.

- [ ] **Step 3: Run targeted tests and verify RED**

Expected: failures for missing chain enforcement.

- [ ] **Step 4: Implement link verification**

Require exact digest/depth/principal continuity and component-wise resource attenuation. Return only evidence facts; do not return an authorization decision.

- [ ] **Step 5: Run targeted tests and verify GREEN**

Expected: all lineage tests PASS.

- [ ] **Step 6: Commit**

```bash
git add mesh/src/lib/agent-lineage-delegation.mjs mesh/test/agent-lineage-delegation.test.mjs
git commit -m "feat: verify bounded recursive lineage links"
```

### Task 6: Repository-wide verification and non-promotion audit

**Files:**
- Modify only if required by verified repository checks: documentation index/traceability files.
- Do not add a supported capability-registry entry for the laboratory primitive.

**Interfaces:**
- Consumes all previous tasks.
- Produces a branch that passes existing checks without changing production reachability.

- [ ] **Step 1: Run targeted lineage test**

```bash
cd mesh && node --test test/agent-lineage-delegation.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run full Mesh test suite**

```bash
cd mesh && npm test
```

Expected: PASS.

- [ ] **Step 3: Run repository check**

```bash
cd mesh && npm run check
```

Expected: PASS.

- [ ] **Step 4: Run release verification**

```bash
cd mesh && npm run release:verify
```

Expected: PASS with no capability promotion caused solely by laboratory source/tests/docs.

- [ ] **Step 5: Audit diffs for prohibited widening**

Confirm:

```text
machine-principal.v1 unchanged
Gateway routes unchanged
runtime adapter routes unchanged
capability-registry supported-state unchanged
no provisional branding introduced
no authority_effect/delegation_effect elevation
```

- [ ] **Step 6: Commit any check-required documentation adjustments**

```bash
git add <only-files-required-by-checks>
git commit -m "docs: register agent lineage laboratory evidence"
```

- [ ] **Step 7: Open/refresh draft PR and inspect CI**

All required Linux and Windows checks must be green before describing the implementation as verified.
