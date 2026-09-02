# Blank Egg Open Entity Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a sterile, provider-neutral Blank Egg foundation and deterministic optional-layer composition without embedding a worldview, personality, private corpus, runtime activation, or authority.

**Architecture:** Add three inert exact-shape contracts—foundation, layer, and layer stack—plus a pure blankness verifier. Integrate these with the separate Capability Surface Registry as `specified` concepts while leaving `mesh/config/capabilities.json` unchanged. Private grounding remains outside the public repository and composes later through vault/pack mechanisms.

**Tech Stack:** Node.js ESM, built-in `node:test`/`node:assert`, JSON Schema Draft 2020-12, repository-native `canonical.mjs` digest helper, zero third-party dependencies.

**Spec:** `docs/superpowers/specs/2026-09-01-blank-egg-open-entity-foundation-design.md`

## Global Constraints

- Human working term is `Blank Egg`; durable machine IDs remain branding-neutral.
- Public core contains no private court/legal/personal corpus or hidden founder profile.
- `authority_effect` is exactly `none` in all v0 Blank Egg contracts.
- `network_effect` is exactly `none` in all v0 Blank Egg contracts.
- `runtime_activation` is exactly `false` in all v0 Blank Egg contracts.
- Optional layers cannot override Mesh authority/privacy/resource constraints.
- Foundation/layer/stack records contain no credentials or raw private content.
- Capability discovery or layer installation grants no authority.
- No Gateway route or executable capability-registry promotion is introduced.
- Use TDD: watch every behavior fail before implementing it.

---

### Task 1: Entity Foundation v0

**Files:**
- Create: `mesh/src/lib/entity-foundation.mjs`
- Create: `mesh/test/entity-foundation.test.mjs`
- Create: `docs/architecture/contracts/entity-foundation.v0.schema.json`
- Create: `mesh/test/entity-foundation-schema.test.mjs`

**Interfaces:**
- Produces: `ENTITY_FOUNDATION_SCHEMA = 'axiom-entity-foundation.v0'`
- Produces: `validateEntityFoundation(document) -> frozen validation summary`
- Produces: `entityFoundationDigest(document) -> lowercase SHA-256 hex digest`

Foundation exact fields:

```js
{
  schema,
  version,
  status,
  foundation_id,
  entity_id,
  lineage_root_id,
  profile,
  core_contract_refs,
  recovery_policy_ref,
  privacy_policy_ref,
  personal_grounding_present,
  worldview_layers_present,
  disposition_layers_present,
  provider_binding_present,
  created_at,
  authority_effect,
  network_effect,
  runtime_activation
}
```

`profile` is exactly `blank-egg`. Presence flags are exactly `false` for a valid v0 Blank Egg. `core_contract_refs` is a unique non-empty array of stable identifiers with a bounded maximum of 32.

- [ ] **Step 1: Write failing semantic tests** for a valid blank foundation, deterministic digest, unknown-field rejection, non-blank flags, provider binding, invalid core refs, and activation-boundary violations.
- [ ] **Step 2: Run** `node --test mesh/test/entity-foundation.test.mjs` and confirm missing-module RED.
- [ ] **Step 3: Implement minimal strict validator/digest** using only `./canonical.mjs`.
- [ ] **Step 4: Re-run focused semantic tests** and require all pass.
- [ ] **Step 5: Write failing schema-parity test** requiring exact constants, `additionalProperties:false`, and fixed blankness/authority fields.
- [ ] **Step 6: Run schema test** and confirm missing-schema RED.
- [ ] **Step 7: Add JSON Schema** mirroring the semantic contract.
- [ ] **Step 8: Re-run semantic + schema tests**.

### Task 2: Entity Layer v0

**Files:**
- Create: `mesh/src/lib/entity-layer.mjs`
- Create: `mesh/test/entity-layer.test.mjs`
- Create: `docs/architecture/contracts/entity-layer.v0.schema.json`
- Create: `mesh/test/entity-layer-schema.test.mjs`

**Interfaces:**
- Produces: `ENTITY_LAYER_SCHEMA = 'axiom-entity-layer.v0'`
- Produces: `validateEntityLayer(document)`
- Produces: `entityLayerDigest(document)`

Exact layer classes:

```text
constitution|worldview|judgment|disposition|culture|domain|skill|relationship|personal-grounding|presentation|self-authored
```

Exact endorsement modes:

```text
none|human|entity|joint|governance
```

Exact privacy classes:

```text
public|shared|private|sealed
```

Exact mutability modes:

```text
immutable|replaceable|evolvable|ephemeral
```

Exact influence scopes:

```text
reasoning-guidance|judgment-heuristic|conversation-disposition|retrieval-preference|presentation|domain-workflow|relationship-expectation
```

Every layer binds an artifact digest, authors, adopter, provenance refs, timestamps, dependencies/conflicts, and zero-authority semantics. Private/sealed layer metadata may use opaque artifact refs but may never embed raw content.

- [ ] **Step 1:** Write failing tests for each enum family, unique authors/scopes, dependency/conflict overlap, secret-bearing unknown fields, timestamp ordering, and zero-authority semantics.
- [ ] **Step 2:** Verify RED by running `node --test mesh/test/entity-layer.test.mjs`.
- [ ] **Step 3:** Implement minimal validator/digest.
- [ ] **Step 4:** Verify GREEN.
- [ ] **Step 5:** Add schema-parity RED test.
- [ ] **Step 6:** Add exact JSON Schema and verify GREEN.

### Task 3: Entity Layer Stack v0

**Files:**
- Create: `mesh/src/lib/entity-layer-stack.mjs`
- Create: `mesh/test/entity-layer-stack.test.mjs`
- Create: `docs/architecture/contracts/entity-layer-stack.v0.schema.json`
- Create: `mesh/test/entity-layer-stack-schema.test.mjs`

**Interfaces:**
- Produces: `ENTITY_LAYER_STACK_SCHEMA = 'axiom-entity-layer-stack.v0'`
- Produces: `validateEntityLayerStack(document)`
- Produces: `entityLayerStackDigest(document)`
- Produces: `resolveEntityLayerStack(stack, foundation, layers) -> frozen resolved summary`

The stack binds exact foundation ID/digest and ordered active layer refs. Each active item includes `layer_id`, `layer_digest`, and integer `precedence`. IDs and precedence values are unique. Suspended/superseded IDs cannot also be active. `resolveEntityLayerStack` validates every referenced layer/digest and fails if two active layers declare direct incompatibility or a required dependency is absent.

- [ ] **Step 1:** Write failing tests for empty Blank Egg stack, deterministic ordering, digest mismatch, missing dependency, explicit conflict, duplicate precedence, suspended/active collision, and authority invariance.
- [ ] **Step 2:** Verify RED.
- [ ] **Step 3:** Implement validator/digest/resolver with no I/O.
- [ ] **Step 4:** Verify GREEN.
- [ ] **Step 5:** Add schema-parity RED test, then schema, then GREEN.

### Task 4: Blankness verifier

**Files:**
- Create: `mesh/src/lib/entity-blankness.mjs`
- Create: `mesh/test/entity-blankness.test.mjs`

**Interfaces:**
- Produces: `verifyEntityBlankness(foundation, stack, layers = [])`

Return a frozen result:

```js
{
  valid: true,
  claim: 'blank-at-axiom-composition-layer',
  foundation_id,
  entity_id,
  foundation_digest,
  stack_digest,
  optional_layer_count: 0,
  personal_grounding_present: false,
  worldview_layers_present: false,
  disposition_layers_present: false,
  provider_binding_present: false,
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false,
  non_claims: [
    'does-not-prove-model-weight-neutrality',
    'does-not-prove-consciousness-status',
    'does-not-prove-environmental-neutrality'
  ]
}
```

- [ ] **Step 1:** Write failing tests proving only an empty optional-layer stack qualifies; any worldview/disposition/personal-grounding/provider declaration fails.
- [ ] **Step 2:** Verify RED.
- [ ] **Step 3:** Implement pure verifier using Tasks 1-3.
- [ ] **Step 4:** Verify GREEN and non-claims.

### Task 5: Capability Surface Registry v0

**Files:**
- Create: `mesh/src/lib/capability-surfaces.mjs`
- Create: `mesh/test/capability-surfaces.test.mjs`
- Create: `docs/architecture/contracts/capability-surfaces.v0.schema.json`
- Create: `mesh/config/capability-surfaces.v0.json`

**Interfaces:**
- Produces: `validateCapabilitySurfaceRegistry(document)` + deterministic digest.
- Registry is non-executable and does not replace `mesh/config/capabilities.json`.

Initial entries include:

```text
entity.foundation
entity.layer
entity.layer-stack
entity.blankness-proof
agency.provenance
sovereignty.human-direct
resource.governance
obligation.dormant
```

All Blank Egg entries begin at lifecycle `specified`. Every entry carries human product/section/label/description, schema IDs, authority boundary, evidence profile, and non-claims. Registry top-level requires `discovery_grants_authority=false`.

- [ ] **Step 1:** Write RED tests rejecting unknown lifecycle values, empty non-claims, runnable claims, and `discovery_grants_authority=true`.
- [ ] **Step 2:** Implement minimal validator/schema/sterile registry.
- [ ] **Step 3:** Run focused tests and document that executable registry remains unchanged.

### Task 6: Public-core/private-overlay compatibility

**Files:**
- Create: `docs/architecture/PUBLIC-CORE-PRIVATE-ENTITY-OVERLAYS.md`
- Modify only after full-file safe diff review: `docs/architecture/PERSONAL-AGENT-PACK-V2-AND-COMPANION-CONTINUITY.md`

**Interfaces:**
- Clarifies that Personal Agent Pack v2 is one owner-private continuity/overlay vehicle layered above Blank Egg, not the Blank Egg identity definition.

- [ ] **Step 1:** Document allowed public-core classes and prohibited private corpus classes.
- [ ] **Step 2:** Document overlay installation/recovery path using Sovereign Vaults and existing context contracts.
- [ ] **Step 3:** Add no personal examples or identifying fixtures.

### Task 7: Sterile Genesis proof

**Files:**
- Create: `mesh/test/blank-egg-genesis.test.mjs`

**Interfaces:**
- Uses Tasks 1-5 only; no runtime/Gateway/network I/O.

Proof:

```text
foundation -> empty stack -> blankness proof -> optional public judgment layer installed -> foundation identity unchanged -> layer suspended -> blankness restored
```

The proof also asserts that installing/suspending a layer never changes authority/network/runtime-activation fields.

- [ ] **Step 1:** Write end-to-end RED test.
- [ ] **Step 2:** Implement only glue necessary for GREEN.
- [ ] **Step 3:** Run all Blank Egg focused tests.
- [ ] **Step 4:** Run repository `npm test`, `npm run check`, and `npm run release:verify` from a supported checkout/CI before any completion claim.

### Task 8: Documentation and promotion gate

**Files:**
- Update canonical owners only from a full checkout with ordinary Git diff review.

- [ ] Link Blank Egg architecture from docs index/roadmap/product definition/requirements.
- [ ] Keep capability registry unchanged unless later executable promotion evidence exists.
- [ ] Threat-model malicious layers, dependency confusion, provenance spoofing, private-overlay leakage, and self-authored authority escalation.
- [ ] Search public repo for accidental personal/private fixtures.
- [ ] Keep PR draft until full CI, docs/release gates, and independent review are green.
