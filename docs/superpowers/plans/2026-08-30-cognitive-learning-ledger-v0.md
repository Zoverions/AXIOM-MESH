# Cognitive Learning Ledger v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an inert, deterministic Cognitive Learning Ledger v0 contract that records provenance-linked candidate learning, explicit resource-cost observations, separate policy-utility descriptors, promotion state, and zero-authority boundaries.

**Architecture:** Follow the existing AXIOM inert-contract pattern: one strict Node.js semantic validator/digest library, one JSON Schema 2020-12 mirror, focused `node:test` behavioral/schema tests, then canonical documentation registration. The ledger records evidence only; it cannot train, activate, route, fetch, authorize spend, or widen authority.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, JSON Schema 2020-12, existing `mesh/src/lib/canonical.mjs` primitives.

**Spec:** `docs/superpowers/specs/2026-08-30-cognitive-continuity-learning-economics-design.md`

## Global Constraints

- Schema identifier is exactly `axiom-cognitive-learning-ledger.v0`.
- Version is exactly `0`; status is exactly `inert-contract-laboratory`.
- A record is evidence, not execution authority.
- Learning classes are exactly `episodic | semantic | procedural | personal | context | adapter | base-model | developmental`.
- Representation classes are exactly `exact-retained | lossy | mixed`.
- Learning tiers are integer `0..6`.
- Promotion states are exactly `observed | candidate | evaluated | accepted | rejected | superseded | rolled-back`.
- Source evidence and derived artifacts are separate arrays and remain distinguishable.
- A lossy record requires at least one source-evidence reference; it cannot claim to be the exact retained source.
- Resource costs use explicit units and remain distinct from policy utility.
- Cost kinds are exactly `create | validate | store | maintain | migrate | per-use | risk-resource`.
- Cost units are bounded opaque identifiers such as `USD`, `CAD`, `tokens`, `gpu-second`, `joule`, `byte-month`, `request`, or another identifier; the validator does not convert units.
- Policy utility dimensions are exactly `reuse | quality | latency | privacy | sovereignty | resilience | portability | reversibility` and use qualitative values `negative | neutral | positive | strong-positive | unknown`.
- Identity-tier target `5` requires at least one evaluation reference.
- Base-model target `6` requires at least one evaluation reference and cannot be promotion state `accepted` in v0.
- Every record carries deterministic lineage references for predecessor/successor relationships where present.
- `contains_secret_material` is exactly `false`.
- `authority_effect`, `network_effect`, `training_effect`, `spend_authorization`, and `runtime_activation` are exactly no-effect constants.
- Unknown fields fail closed at every object level.
- No Gateway, Hypervisor, Sandbox, Grid, provider transport, model loading, model training, credential, or capability-registry behavior changes.

---

### Task 1: Semantic validator and deterministic digest

**Files:**
- Create: `mesh/test/cognitive-learning-ledger.test.mjs`
- Create: `mesh/src/lib/cognitive-learning-ledger.mjs`

**Interfaces:**
- Consumes: `digestObject`, `ValidationError` from `./canonical.mjs`.
- Produces: `COGNITIVE_LEARNING_LEDGER_SCHEMA`, `validateCognitiveLearningLedger(document)`, `cognitiveLearningLedgerDigest(document)`.
- Validation returns a frozen summary only.

- [ ] **Step 1: Write the failing behavioral test**

Create `mesh/test/cognitive-learning-ledger.test.mjs` with a valid fixture and prove:

1. valid records validate and produce deterministic 64-hex digests;
2. object-key order does not alter the digest;
3. unknown fields and credential-like injections fail closed;
4. malformed identifiers/digests/timestamps/enums and tier values fail closed;
5. duplicate source/evaluation/lineage references fail closed;
6. `lossy` requires source evidence;
7. identity-tier target `5` requires evaluation evidence;
8. base-model target `6` requires evaluation evidence and rejects `accepted`;
9. resource-cost amounts are finite non-negative numbers or explicit `unknown`, always with a unit and kind;
10. unlike cost units remain separate records and are never summed by the validator;
11. policy utility dimensions are unique and restricted to the exact qualitative domain;
12. `updated_at` cannot precede `created_at`;
13. validation does not mutate deeply frozen input;
14. module imports only `./canonical.mjs`;
15. zero-authority/no-secret/no-network/no-training/no-spend/no-runtime constants are enforced.

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
cd mesh && node --test test/cognitive-learning-ledger.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` because `../src/lib/cognitive-learning-ledger.mjs` does not exist.

- [ ] **Step 3: Implement minimal strict validator/digest**

Create `mesh/src/lib/cognitive-learning-ledger.mjs` with exact-object validation and these top-level fields:

```text
schema
version
status
record_id
principal_ref
composition_ref
learning_class
representation_class
current_tier
proposed_target_tier
proposal_reason
source_evidence
derived_artifacts
expected_reuse
resource_costs
policy_utility
evaluation_refs
promotion_state
predecessor_refs
successor_refs
created_at
updated_at
contains_secret_material
authority_effect
network_effect
training_effect
spend_authorization
runtime_activation
```

Nested exact fields:

```text
source_evidence[]: ref, digest

derived_artifacts[]: ref, digest, representation_class

expected_reuse: class, estimated_uses
  class = one-off | occasional | recurring | high-frequency | unknown
  estimated_uses = null or integer 0..1000000000

resource_costs[]: kind, amount, unit, basis
  amount = non-negative finite number or "unknown"
  basis = observed | estimated | unknown

policy_utility[]: dimension, value, rationale

evaluation_refs[]: ref, digest

predecessor_refs[] / successor_refs[]: ref, digest
```

Array bounds: source evidence `0..128`; derived artifacts `0..64`; resource costs `0..64`; policy utility `0..8`; evaluation refs `0..64`; predecessor/successor refs `0..64`.

- [ ] **Step 4: Run focused test and verify GREEN**

```bash
cd mesh && node --test test/cognitive-learning-ledger.test.mjs
```

Expected: zero failures.

- [ ] **Step 5: Commit Task 1**

```bash
git add mesh/test/cognitive-learning-ledger.test.mjs mesh/src/lib/cognitive-learning-ledger.mjs
git commit -m "feat: add cognitive learning ledger v0 validator"
```

---

### Task 2: JSON Schema parity

**Files:**
- Create: `mesh/test/cognitive-learning-ledger-schema.test.mjs`
- Create: `mesh/config/cognitive-learning-ledger-v0.schema.json`

**Interfaces:**
- Produces a JSON Schema 2020-12 structural mirror.
- Carries `x-axiom-semantic-validator: "mesh/src/lib/cognitive-learning-ledger.mjs"`.

- [ ] **Step 1: Write failing schema-parity test**

Assert schema/version/status constants, all zero-effect constants, array maximums, `additionalProperties:false` at every object level, enum domains, and semantic-rule/non-claim annotations covering identity/base-model evaluation gates, no cost-unit conversion, no authority grant, no training, no provider invocation, and no spend authorization.

- [ ] **Step 2: Run schema test and verify RED**

```bash
cd mesh && node --test test/cognitive-learning-ledger-schema.test.mjs
```

Expected: FAIL because the schema file does not exist.

- [ ] **Step 3: Add strict JSON Schema mirror**

Create `mesh/config/cognitive-learning-ledger-v0.schema.json` matching Task 1's exact fields and bounds. Cross-field semantic gates stay in the semantic validator and are listed under `x-axiom-semantic-rules`.

- [ ] **Step 4: Run schema + semantic tests**

```bash
cd mesh && node --test test/cognitive-learning-ledger-schema.test.mjs test/cognitive-learning-ledger.test.mjs
```

Expected: zero failures.

- [ ] **Step 5: Commit Task 2**

```bash
git add mesh/test/cognitive-learning-ledger-schema.test.mjs mesh/config/cognitive-learning-ledger-v0.schema.json
git commit -m "feat: add cognitive learning ledger v0 schema"
```

---

### Task 3: Canonical docs and full verification

**Files:**
- Modify: `mesh/src/check-docs.mjs`
- Existing design: `docs/superpowers/specs/2026-08-30-cognitive-continuity-learning-economics-design.md`
- New plan: `docs/superpowers/plans/2026-08-30-cognitive-learning-ledger-v0.md`

**Interfaces:**
- Registers the design and implementation plan in canonical-document integrity checking only.

- [ ] **Step 1: Run full verification before docs registration**

```bash
cd mesh && npm run check
```

Expected: any branch-attributable documentation-integrity failure should be limited to unregistered normative Markdown; focused ledger tests remain green.

- [ ] **Step 2: Add only the design and plan paths to `CANONICAL_DOCUMENTS`**

Do not modify capability status, production claims, runtime route lists, or effect-path code.

- [ ] **Step 3: Run focused tests**

```bash
cd mesh && node --test test/cognitive-learning-ledger.test.mjs test/cognitive-learning-ledger-schema.test.mjs
```

Expected: zero failures.

- [ ] **Step 4: Run full protected verification**

```bash
cd mesh && npm run check
```

Expected: zero failures attributable to this branch.

- [ ] **Step 5: Review diff against parent design branch**

Expected implementation paths only:

```text
docs/superpowers/plans/2026-08-30-cognitive-learning-ledger-v0.md
mesh/src/lib/cognitive-learning-ledger.mjs
mesh/config/cognitive-learning-ledger-v0.schema.json
mesh/test/cognitive-learning-ledger.test.mjs
mesh/test/cognitive-learning-ledger-schema.test.mjs
mesh/src/check-docs.mjs
```

Confirm no modifications to `mesh/config/capabilities.json`, effect-path services, credential stores, provider transports, or runtime activation code.

- [ ] **Step 6: Commit Task 3**

```bash
git add mesh/src/check-docs.mjs
git commit -m "chore: register cognitive learning ledger docs"
```

## Self-review result

- Spec coverage: the v0 ledger's mandatory invariants are mapped to behavioral or schema tests.
- Scope: evidence-only contract; no learning execution, cost optimizer, model adaptation, provider invocation, or UI work.
- Type consistency: field names/enums/bounds are identical across this plan's validator and schema targets.
- Placeholder scan: no implementation placeholders are required for this slice.
