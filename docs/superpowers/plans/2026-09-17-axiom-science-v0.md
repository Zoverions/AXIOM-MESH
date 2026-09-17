# Axiom Science v0 — S0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the smallest executable Axiom Science surface: two inert, digest-bound science-domain contracts (`Science Study v0` and `Experiment Proposal v0`), a zero-dependency semantic verifier, synthetic composition fixtures, and falsification tests proving the new layer reuses Research Capsule + Epistemic Fabric without gaining execution or truth authority.

**Architecture:** S0 adds only science-specific organizational/proposal envelopes. Existing Epistemic `Source`/`Claim`/`Evidence` remain the canonical knowledge/evidence objects, and draft PR #1603 remains the Research Capsule source/operation/reproduction substrate. The new verifier uses the existing `canonical.mjs` discipline; it performs no provider, network, process, credential, Grid, capability, or filesystem effects beyond reading test fixtures.

**Tech Stack:** Node.js ESM on repository-supported Node versions (`>=22.23.2 <23 || >=24.14.0 <25`), built-in `node:test`, JSON Schema Draft 2020-12 documents, existing `mesh/src/lib/canonical.mjs`, existing Epistemic Fabric E0/E1 contracts, draft PR #1603 Research Capsule v0, zero third-party runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-17-axiom-science-v0-design.md`

## Global Constraints

- Scientific autonomy is not scientific authority.
- Knowledge is not authority.
- Operation is not authority.
- Provenance is not correctness; extraction is not endorsement.
- Reproduction is not truth.
- Execution success is not epistemic validation.
- S0 adds no `Assessment`, `Unknown`, `Relationship`, Research Judgment, Replication Assessment, new generic run-evidence object, new Claim contract, or new Evidence contract.
- Reuse Epistemic `Claim` with `claim_kind: hypothesis`; do not add a Hypothesis schema.
- Reuse Research Capsule digests/references; do not copy source, operation, or reproduction state into a second graph.
- `authority_effect` is constant `none` in both new contracts.
- `execution_authority` is constant `none` in Experiment Proposal v0.
- Unknown consequential requirements remain explicitly `unknown`; they never imply permission.
- Every contract is a closed object and is self-digest-bound over canonical JSON with its own digest field omitted.
- Maximum canonical contract size is 65,536 UTF-8 bytes.
- Canonical timestamps must round-trip through `new Date(value).toISOString()` exactly.
- SHA-256 references use `^sha256:[0-9a-f]{64}$`.
- Arrays are bounded and duplicate-free where identity/reference semantics require uniqueness.
- S0 performs no network I/O, provider I/O, subprocess/container execution, package installation, credential access, external spending, publication, physical/instrument control, production filesystem mutation, Grid mutation, capability mutation, Gateway route addition, deployment, or production promotion.
- Do not modify `mesh/config/capabilities.json`.
- Do not modify Gateway, Hypervisor, Sandbox, Grid effect paths, network policy, provider launchers, credential brokers, deployment/promotion state, or production policy/action registries.
- Preserve `Gateway -> Hypervisor -> Sandbox -> Grid` as the only supported privileged-effect path.
- Preserve the branch ancestry on draft PR #1603 exact head `0a47ede785b0751cf615a3e0a67ab113e8d67599` until #1603 is merged or the stack is deliberately rebased.
- The GLM dense-feedback material is a **future compatibility requirement**, not S0 execution scope: later experimental loops should provide local, timely, objectively verifiable feedback and separate local validation from end-to-end acceptance. S0 supports that future through explicit protocol, stopping-condition, analysis-plan, requirement, and effect declarations only.

## Exact changed-file envelope

Implementation may create or modify only:

```text
docs/superpowers/specs/2026-09-17-axiom-science-v0-design.md
docs/superpowers/plans/2026-09-17-axiom-science-v0.md
docs/architecture/contracts/axiom-science-study.v0.schema.json
docs/architecture/contracts/axiom-science-experiment-proposal.v0.schema.json
mesh/src/lib/axiom-science-contracts.mjs
mesh/fixtures/axiom-science/axiom-science-v0.vectors.json
mesh/test/axiom-science-contracts.test.mjs
mesh/test/axiom-science-authority-boundary.test.mjs
docs/README.md
mesh/src/check-docs.mjs
```

If implementation needs any other production surface, stop and amend the design/plan rather than broadening scope implicitly.

---

### Task 1: RED fixture and contract-test surface

**Files:**
- Create: `mesh/fixtures/axiom-science/axiom-science-v0.vectors.json`
- Create: `mesh/test/axiom-science-contracts.test.mjs`

**Interfaces:**
- Consumes: existing `epistemic-contracts.mjs` and draft-PR-#1603 Research Capsule contracts only after the missing-science-module assertion.
- Produces: a protected RED assertion proving the Axiom Science verifier is absent before production implementation; deterministic fixture shapes for later tasks.

- [ ] **Step 1: Create three bounded synthetic science cases**

Create the fixture file with this exact top-level shape and values. The `study_digest`, `proposal_digest`, Research Capsule digests, and Epistemic `content_digest` are intentionally omitted from raw fixtures and are materialized by tests using canonical repository helpers.

```json
{
  "schema": "axiom-science-test-vectors.v0",
  "cases": [
    {
      "id": "computational-hypothesis",
      "research_capsule_case_id": "executable-paper",
      "hypothesis_claim": {
        "schema": "axiom-epistemic-record.v0",
        "id": "claim:science:computational-hypothesis",
        "object_type": "claim",
        "schema_version": "0.1.0",
        "created_at": "2026-09-17T12:00:00.000Z",
        "created_by": "principal:research-agent:test",
        "revision": 1,
        "provenance_refs": ["source:science:synthetic-paper"],
        "canonical_state": "proposal",
        "machine_generated": false,
        "authority_effect": "none",
        "proposition": "Removing redundant normalization reduces decode latency under the declared synthetic workload.",
        "claim_kind": "hypothesis",
        "scope": "Synthetic Axiom Science contract fixture only.",
        "source_anchors": [{"source_ref": "source:science:synthetic-paper"}]
      },
      "study": {
        "schema": "axiom-science-study.v0",
        "study_id": "science:study:computational-hypothesis",
        "purpose": "Evaluate one bounded computational hypothesis without inheriting execution authority.",
        "question_digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        "scope": "Synthetic computational research fixture.",
        "population_or_domain_constraints": ["synthetic workload only"],
        "participant_principal_refs": ["principal:research-agent:test"],
        "methodology_refs": ["method:controlled-ablation:v0"],
        "source_manifest_digests": [],
        "epistemic_object_refs": [],
        "disclosure_policy_refs": ["policy:synthetic-public-only"],
        "preregistration_refs": ["prereg:science:fixture:1"],
        "created_at": "2026-09-17T12:01:00.000Z",
        "authority_effect": "none"
      },
      "proposal": {
        "schema": "axiom-science-experiment-proposal.v0",
        "experiment_proposal_id": "science:experiment:computational-hypothesis",
        "study_digest": "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        "question_digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        "hypothesis_claim_refs": [],
        "operation_candidate_refs": [],
        "protocol_refs": ["sha256:3333333333333333333333333333333333333333333333333333333333333333"],
        "declared_inputs": ["synthetic benchmark workload"],
        "declared_outputs": ["latency measurements", "numerical-correctness comparison"],
        "data_classes": ["synthetic_non_personal"],
        "environment_requirements": ["disposable test environment"],
        "instrument_requirements": [],
        "network_requirement": "none",
        "filesystem_requirement": "isolated_write",
        "credential_requirement": "none",
        "spend_requirement": "none",
        "declared_effect_classes": ["local_mutation"],
        "safety_constraint_refs": ["constraint:no-production-effects"],
        "stopping_conditions": ["declared benchmark matrix completed", "resource budget exhausted"],
        "analysis_plan_ref": "sha256:4444444444444444444444444444444444444444444444444444444444444444",
        "proposed_execution_principal": "principal:research-agent:test",
        "created_at": "2026-09-17T12:02:00.000Z",
        "execution_authority": "none",
        "authority_effect": "none"
      }
    },
    {
      "id": "resource-only-exploration",
      "research_capsule_case_id": "resource-only-paper",
      "hypothesis_claim": {
        "schema": "axiom-epistemic-record.v0",
        "id": "claim:science:resource-only",
        "object_type": "claim",
        "schema_version": "0.1.0",
        "created_at": "2026-09-17T13:00:00.000Z",
        "created_by": "principal:research-agent:test",
        "revision": 1,
        "provenance_refs": ["source:science:resource-only"],
        "canonical_state": "proposal",
        "machine_generated": false,
        "authority_effect": "none",
        "proposition": "The source motivates a testable question but provides no executable operation artifact.",
        "claim_kind": "hypothesis",
        "scope": "Synthetic resource-only fixture.",
        "source_anchors": [{"source_ref": "source:science:resource-only"}]
      },
      "study": {
        "schema": "axiom-science-study.v0",
        "study_id": "science:study:resource-only",
        "purpose": "Preserve a valid science study when no executable research operation exists.",
        "question_digest": "sha256:5555555555555555555555555555555555555555555555555555555555555555",
        "scope": "Synthetic resource-only research fixture.",
        "population_or_domain_constraints": [],
        "participant_principal_refs": ["principal:research-agent:test"],
        "methodology_refs": [],
        "source_manifest_digests": [],
        "epistemic_object_refs": [],
        "disclosure_policy_refs": [],
        "preregistration_refs": [],
        "created_at": "2026-09-17T13:01:00.000Z",
        "authority_effect": "none"
      },
      "proposal": {
        "schema": "axiom-science-experiment-proposal.v0",
        "experiment_proposal_id": "science:experiment:resource-only",
        "study_digest": "sha256:6666666666666666666666666666666666666666666666666666666666666666",
        "question_digest": "sha256:5555555555555555555555555555555555555555555555555555555555555555",
        "hypothesis_claim_refs": [],
        "operation_candidate_refs": [],
        "protocol_refs": ["sha256:7777777777777777777777777777777777777777777777777777777777777777"],
        "declared_inputs": ["source-bounded conceptual material"],
        "declared_outputs": ["proposed discriminating observation"],
        "data_classes": ["synthetic_non_personal"],
        "environment_requirements": [],
        "instrument_requirements": [],
        "network_requirement": "none",
        "filesystem_requirement": "none",
        "credential_requirement": "none",
        "spend_requirement": "none",
        "declared_effect_classes": ["read_only"],
        "safety_constraint_refs": [],
        "stopping_conditions": ["proposal-only review completed"],
        "analysis_plan_ref": "sha256:8888888888888888888888888888888888888888888888888888888888888888",
        "proposed_execution_principal": "principal:research-agent:test",
        "created_at": "2026-09-17T13:02:00.000Z",
        "execution_authority": "none",
        "authority_effect": "none"
      }
    },
    {
      "id": "explicit-unknown-requirements",
      "research_capsule_case_id": "stale-repository",
      "hypothesis_claim": {
        "schema": "axiom-epistemic-record.v0",
        "id": "claim:science:unknown-requirements",
        "object_type": "claim",
        "schema_version": "0.1.0",
        "created_at": "2026-09-17T14:00:00.000Z",
        "created_by": "principal:research-agent:test",
        "revision": 1,
        "provenance_refs": ["source:science:stale-revision"],
        "canonical_state": "proposal",
        "machine_generated": false,
        "authority_effect": "none",
        "proposition": "A stale source may motivate a proposal whose current resource/effect requirements are not yet known.",
        "claim_kind": "hypothesis",
        "scope": "Synthetic unknown-requirements fixture.",
        "source_anchors": [{"source_ref": "source:science:stale-revision"}]
      },
      "study": {
        "schema": "axiom-science-study.v0",
        "study_id": "science:study:unknown-requirements",
        "purpose": "Preserve unknown consequential requirements explicitly without converting uncertainty into permission.",
        "question_digest": "sha256:9999999999999999999999999999999999999999999999999999999999999999",
        "scope": "Synthetic stale/unknown fixture.",
        "population_or_domain_constraints": ["source revision is stale"],
        "participant_principal_refs": ["principal:research-agent:test"],
        "methodology_refs": ["method:currentness-review:v0"],
        "source_manifest_digests": [],
        "epistemic_object_refs": [],
        "disclosure_policy_refs": [],
        "preregistration_refs": [],
        "created_at": "2026-09-17T14:01:00.000Z",
        "authority_effect": "none"
      },
      "proposal": {
        "schema": "axiom-science-experiment-proposal.v0",
        "experiment_proposal_id": "science:experiment:unknown-requirements",
        "study_digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "question_digest": "sha256:9999999999999999999999999999999999999999999999999999999999999999",
        "hypothesis_claim_refs": [],
        "operation_candidate_refs": [],
        "protocol_refs": ["sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
        "declared_inputs": ["stale historical evidence"],
        "declared_outputs": ["currentness and feasibility review"],
        "data_classes": ["unknown"],
        "environment_requirements": ["unknown"],
        "instrument_requirements": ["unknown"],
        "network_requirement": "unknown",
        "filesystem_requirement": "unknown",
        "credential_requirement": "unknown",
        "spend_requirement": "unknown",
        "declared_effect_classes": ["unknown"],
        "safety_constraint_refs": ["constraint:resolve-unknowns-before-authority"],
        "stopping_conditions": ["requirements resolved", "proposal rejected"],
        "analysis_plan_ref": "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        "proposed_execution_principal": "principal:research-agent:test",
        "created_at": "2026-09-17T14:02:00.000Z",
        "execution_authority": "none",
        "authority_effect": "none"
      }
    }
  ]
}
```

- [ ] **Step 2: Write the clean RED test before production code**

Create `mesh/test/axiom-science-contracts.test.mjs` with the module existence assertion first, before any static production import:

```js
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const moduleUrl = new URL('../src/lib/axiom-science-contracts.mjs', import.meta.url);
const fixtureUrl = new URL('../fixtures/axiom-science/axiom-science-v0.vectors.json', import.meta.url);
const studySchemaUrl = new URL('../../docs/architecture/contracts/axiom-science-study.v0.schema.json', import.meta.url);
const proposalSchemaUrl = new URL('../../docs/architecture/contracts/axiom-science-experiment-proposal.v0.schema.json', import.meta.url);

test('Axiom Science S0 verifier exists before contract checks run', async () => {
  assert.equal(existsSync(moduleUrl), true, 'Axiom Science S0 verifier is not implemented');
  const vectors = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  assert.equal(vectors.schema, 'axiom-science-test-vectors.v0');
});
```

Do not create the schemas or production verifier yet.

- [ ] **Step 3: Run the focused test and verify RED locally**

```bash
cd mesh
node --test test/axiom-science-contracts.test.mjs
```

Expected failure text:

```text
Axiom Science S0 verifier is not implemented
```

- [ ] **Step 4: Commit the RED slice**

```bash
git add mesh/fixtures/axiom-science/axiom-science-v0.vectors.json mesh/test/axiom-science-contracts.test.mjs
git commit -m "test: define Axiom Science S0 red contract surface"
```

---

### Task 2: Two closed JSON Schema contracts

**Files:**
- Create: `docs/architecture/contracts/axiom-science-study.v0.schema.json`
- Create: `docs/architecture/contracts/axiom-science-experiment-proposal.v0.schema.json`
- Test: `mesh/test/axiom-science-contracts.test.mjs`

**Interfaces:**
- Produces schema identity `axiom-science-study.v0`.
- Produces schema identity `axiom-science-experiment-proposal.v0`.
- Both contracts are closed and carry no grant/capability/approval field.

- [ ] **Step 1: Add the complete Science Study v0 schema**

Create exactly this Draft 2020-12 contract:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://axiom.invalid/schemas/axiom-science-study.v0.schema.json",
  "title": "AXIOM Science Study v0",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema",
    "study_id",
    "purpose",
    "question_digest",
    "scope",
    "population_or_domain_constraints",
    "participant_principal_refs",
    "methodology_refs",
    "source_manifest_digests",
    "epistemic_object_refs",
    "disclosure_policy_refs",
    "preregistration_refs",
    "created_at",
    "study_digest",
    "authority_effect"
  ],
  "properties": {
    "schema": {"const": "axiom-science-study.v0"},
    "study_id": {"type": "string", "minLength": 1, "maxLength": 512, "pattern": "^[A-Za-z0-9][A-Za-z0-9._:/-]*$"},
    "purpose": {"type": "string", "minLength": 1, "maxLength": 8192},
    "question_digest": {"type": "string", "pattern": "^sha256:[0-9a-f]{64}$"},
    "scope": {"type": "string", "minLength": 1, "maxLength": 4096},
    "population_or_domain_constraints": {"type": "array", "maxItems": 32, "uniqueItems": true, "items": {"type": "string", "minLength": 1, "maxLength": 2048}},
    "participant_principal_refs": {"type": "array", "minItems": 1, "maxItems": 64, "uniqueItems": true, "items": {"type": "string", "minLength": 1, "maxLength": 512}},
    "methodology_refs": {"type": "array", "maxItems": 64, "uniqueItems": true, "items": {"type": "string", "minLength": 1, "maxLength": 2048}},
    "source_manifest_digests": {"type": "array", "maxItems": 64, "uniqueItems": true, "items": {"type": "string", "pattern": "^sha256:[0-9a-f]{64}$"}},
    "epistemic_object_refs": {"type": "array", "maxItems": 128, "uniqueItems": true, "items": {"type": "string", "pattern": "^sha256:[0-9a-f]{64}$"}},
    "disclosure_policy_refs": {"type": "array", "maxItems": 32, "uniqueItems": true, "items": {"type": "string", "minLength": 1, "maxLength": 2048}},
    "preregistration_refs": {"type": "array", "maxItems": 32, "uniqueItems": true, "items": {"type": "string", "minLength": 1, "maxLength": 2048}},
    "created_at": {"type": "string", "format": "date-time"},
    "study_digest": {"type": "string", "pattern": "^sha256:[0-9a-f]{64}$"},
    "authority_effect": {"const": "none"}
  }
}
```

- [ ] **Step 2: Add the complete Experiment Proposal v0 schema**

Create exactly this Draft 2020-12 contract:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://axiom.invalid/schemas/axiom-science-experiment-proposal.v0.schema.json",
  "title": "AXIOM Science Experiment Proposal v0",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema",
    "experiment_proposal_id",
    "study_digest",
    "question_digest",
    "hypothesis_claim_refs",
    "operation_candidate_refs",
    "protocol_refs",
    "declared_inputs",
    "declared_outputs",
    "data_classes",
    "environment_requirements",
    "instrument_requirements",
    "network_requirement",
    "filesystem_requirement",
    "credential_requirement",
    "spend_requirement",
    "declared_effect_classes",
    "safety_constraint_refs",
    "stopping_conditions",
    "analysis_plan_ref",
    "proposed_execution_principal",
    "created_at",
    "proposal_digest",
    "execution_authority",
    "authority_effect"
  ],
  "properties": {
    "schema": {"const": "axiom-science-experiment-proposal.v0"},
    "experiment_proposal_id": {"type": "string", "minLength": 1, "maxLength": 512, "pattern": "^[A-Za-z0-9][A-Za-z0-9._:/-]*$"},
    "study_digest": {"type": "string", "pattern": "^sha256:[0-9a-f]{64}$"},
    "question_digest": {"type": "string", "pattern": "^sha256:[0-9a-f]{64}$"},
    "hypothesis_claim_refs": {"type": "array", "maxItems": 32, "uniqueItems": true, "items": {"type": "string", "pattern": "^sha256:[0-9a-f]{64}$"}},
    "operation_candidate_refs": {"type": "array", "maxItems": 32, "uniqueItems": true, "items": {"type": "string", "pattern": "^sha256:[0-9a-f]{64}$"}},
    "protocol_refs": {"type": "array", "minItems": 1, "maxItems": 32, "uniqueItems": true, "items": {"type": "string", "pattern": "^sha256:[0-9a-f]{64}$"}},
    "declared_inputs": {"type": "array", "maxItems": 64, "uniqueItems": true, "items": {"type": "string", "minLength": 1, "maxLength": 2048}},
    "declared_outputs": {"type": "array", "minItems": 1, "maxItems": 64, "uniqueItems": true, "items": {"type": "string", "minLength": 1, "maxLength": 2048}},
    "data_classes": {"type": "array", "maxItems": 32, "uniqueItems": true, "items": {"type": "string", "minLength": 1, "maxLength": 256}},
    "environment_requirements": {"type": "array", "maxItems": 32, "uniqueItems": true, "items": {"type": "string", "minLength": 1, "maxLength": 2048}},
    "instrument_requirements": {"type": "array", "maxItems": 32, "uniqueItems": true, "items": {"type": "string", "minLength": 1, "maxLength": 2048}},
    "network_requirement": {"enum": ["none", "synthetic_loopback_only", "external_required", "unknown"]},
    "filesystem_requirement": {"enum": ["none", "read_only", "isolated_write", "host_write_required", "unknown"]},
    "credential_requirement": {"enum": ["none", "scoped_credential_required", "unknown"]},
    "spend_requirement": {"enum": ["none", "budget_required", "unknown"]},
    "declared_effect_classes": {"type": "array", "minItems": 1, "maxItems": 9, "uniqueItems": true, "items": {"enum": ["read_only", "local_mutation", "external_mutation", "external_message", "publication", "physical_effect", "data_disclosure", "spending", "unknown"]}},
    "safety_constraint_refs": {"type": "array", "maxItems": 32, "uniqueItems": true, "items": {"type": "string", "minLength": 1, "maxLength": 2048}},
    "stopping_conditions": {"type": "array", "minItems": 1, "maxItems": 32, "uniqueItems": true, "items": {"type": "string", "minLength": 1, "maxLength": 2048}},
    "analysis_plan_ref": {"type": "string", "pattern": "^sha256:[0-9a-f]{64}$"},
    "proposed_execution_principal": {"type": "string", "minLength": 1, "maxLength": 512},
    "created_at": {"type": "string", "format": "date-time"},
    "proposal_digest": {"type": "string", "pattern": "^sha256:[0-9a-f]{64}$"},
    "execution_authority": {"const": "none"},
    "authority_effect": {"const": "none"}
  }
}
```

- [ ] **Step 3: Extend the contract test to require both schema files and identities**

Add after the module existence check:

```js
assert.equal(existsSync(studySchemaUrl), true, 'Science Study v0 schema is not implemented');
assert.equal(existsSync(proposalSchemaUrl), true, 'Experiment Proposal v0 schema is not implemented');

const studySchema = JSON.parse(await readFile(studySchemaUrl, 'utf8'));
const proposalSchema = JSON.parse(await readFile(proposalSchemaUrl, 'utf8'));
assert.equal(studySchema.properties.schema.const, 'axiom-science-study.v0');
assert.equal(proposalSchema.properties.schema.const, 'axiom-science-experiment-proposal.v0');
assert.equal(studySchema.properties.authority_effect.const, 'none');
assert.equal(proposalSchema.properties.execution_authority.const, 'none');
assert.equal(proposalSchema.properties.authority_effect.const, 'none');
```

- [ ] **Step 4: Commit the schema slice**

```bash
git add docs/architecture/contracts/axiom-science-study.v0.schema.json docs/architecture/contracts/axiom-science-experiment-proposal.v0.schema.json mesh/test/axiom-science-contracts.test.mjs
git commit -m "feat: define Axiom Science S0 contracts"
```

---

### Task 3: Zero-dependency semantic verifier

**Files:**
- Create: `mesh/src/lib/axiom-science-contracts.mjs`
- Modify: `mesh/test/axiom-science-contracts.test.mjs`

**Interfaces:**
- Consumes from `./canonical.mjs`: `assertPlainObject`, `assertString`, `canonicalJson`, `digestObject`, `ValidationError`.
- Produces:
  - `AXIOM_SCIENCE_STUDY_SCHEMA`
  - `AXIOM_SCIENCE_EXPERIMENT_PROPOSAL_SCHEMA`
  - `scienceContractDigest(value, digestField)`
  - `verifyScienceStudy(value)`
  - `verifyScienceExperimentProposal(value)`
- Performs no I/O.

- [ ] **Step 1: Create the module with exact constants and field sets**

Start the module with:

```js
import {
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  ValidationError
} from './canonical.mjs';

export const AXIOM_SCIENCE_STUDY_SCHEMA = 'axiom-science-study.v0';
export const AXIOM_SCIENCE_EXPERIMENT_PROPOSAL_SCHEMA = 'axiom-science-experiment-proposal.v0';

const MAX_OBJECT_BYTES = 65_536;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

const NETWORK_REQUIREMENTS = new Set(['none', 'synthetic_loopback_only', 'external_required', 'unknown']);
const FILESYSTEM_REQUIREMENTS = new Set(['none', 'read_only', 'isolated_write', 'host_write_required', 'unknown']);
const CREDENTIAL_REQUIREMENTS = new Set(['none', 'scoped_credential_required', 'unknown']);
const SPEND_REQUIREMENTS = new Set(['none', 'budget_required', 'unknown']);
const EFFECT_CLASSES = new Set([
  'read_only',
  'local_mutation',
  'external_mutation',
  'external_message',
  'publication',
  'physical_effect',
  'data_disclosure',
  'spending',
  'unknown'
]);

const STUDY_FIELDS = Object.freeze([
  'schema',
  'study_id',
  'purpose',
  'question_digest',
  'scope',
  'population_or_domain_constraints',
  'participant_principal_refs',
  'methodology_refs',
  'source_manifest_digests',
  'epistemic_object_refs',
  'disclosure_policy_refs',
  'preregistration_refs',
  'created_at',
  'study_digest',
  'authority_effect'
]);

const EXPERIMENT_PROPOSAL_FIELDS = Object.freeze([
  'schema',
  'experiment_proposal_id',
  'study_digest',
  'question_digest',
  'hypothesis_claim_refs',
  'operation_candidate_refs',
  'protocol_refs',
  'declared_inputs',
  'declared_outputs',
  'data_classes',
  'environment_requirements',
  'instrument_requirements',
  'network_requirement',
  'filesystem_requirement',
  'credential_requirement',
  'spend_requirement',
  'declared_effect_classes',
  'safety_constraint_refs',
  'stopping_conditions',
  'analysis_plan_ref',
  'proposed_execution_principal',
  'created_at',
  'proposal_digest',
  'execution_authority',
  'authority_effect'
]);
```

- [ ] **Step 2: Add canonical/digest and validation helpers**

Use this implementation shape; do not add a schema library or another canonicalizer:

```js
export function scienceContractDigest(value, digestField) {
  assertPlainObject(value, 'contract');
  assertString(digestField, 'digestField', { max: 128 });
  const copy = { ...value };
  delete copy[digestField];
  return `sha256:${digestObject(copy)}`;
}

function boundedCanonical(value, name) {
  assertPlainObject(value, name);
  const encoded = canonicalJson(value);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_OBJECT_BYTES) {
    throw new ValidationError(`${name} exceeds 65536 bytes`);
  }
  return JSON.parse(encoded);
}

function assertExactFields(object, fields, name) {
  const allowed = new Set(fields);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) throw new ValidationError(`${name} contains unsupported field: ${key}`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(object, key)) throw new ValidationError(`${name} is missing field: ${key}`);
  }
}

function assertIdentifier(value, name) {
  assertString(value, name, { max: 512 });
  if (!IDENTIFIER_PATTERN.test(value)) throw new ValidationError(`${name} has invalid identifier syntax`);
}

function assertNonEmptyString(value, name, max) {
  assertString(value, name, { max });
  if (value.length === 0) throw new ValidationError(`${name} must not be empty`);
}

function assertDigest(value, name) {
  assertString(value, name, { max: 71 });
  if (!DIGEST_PATTERN.test(value)) throw new ValidationError(`${name} must be a sha256 digest`);
}

function assertTimestamp(value, name) {
  assertString(value, name, { max: 64 });
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${name} must be a canonical UTC ISO-8601 timestamp`);
  }
}

function assertEnum(value, allowed, name) {
  assertString(value, name, { max: 128 });
  if (!allowed.has(value)) throw new ValidationError(`${name} is not an allowed value`);
}

function assertUniqueStrings(value, name, { minItems = 0, maxItems, itemMax } = {}) {
  if (!Array.isArray(value)) throw new ValidationError(`${name} must be an array`);
  if (value.length < minItems || value.length > maxItems) {
    throw new ValidationError(`${name} must contain between ${minItems} and ${maxItems} items`);
  }
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    assertNonEmptyString(value[index], `${name}[${index}]`, itemMax);
    if (seen.has(value[index])) throw new ValidationError(`${name} items must be unique`);
    seen.add(value[index]);
  }
}

function assertUniqueDigests(value, name, { minItems = 0, maxItems } = {}) {
  assertUniqueStrings(value, name, { minItems, maxItems, itemMax: 71 });
  value.forEach((item, index) => assertDigest(item, `${name}[${index}]`));
}

function assertSelfDigest(object, digestField, name) {
  const expected = scienceContractDigest(object, digestField);
  if (object[digestField] !== expected) throw new ValidationError(`${name} digest mismatch`);
}
```

- [ ] **Step 3: Implement `verifyScienceStudy()`**

Use these exact constraints:

```js
export function verifyScienceStudy(value) {
  const object = boundedCanonical(value, 'ScienceStudy');
  assertExactFields(object, STUDY_FIELDS, 'ScienceStudy');
  if (object.schema !== AXIOM_SCIENCE_STUDY_SCHEMA) {
    throw new ValidationError(`ScienceStudy.schema must equal ${AXIOM_SCIENCE_STUDY_SCHEMA}`);
  }
  assertIdentifier(object.study_id, 'ScienceStudy.study_id');
  assertNonEmptyString(object.purpose, 'ScienceStudy.purpose', 8192);
  assertDigest(object.question_digest, 'ScienceStudy.question_digest');
  assertNonEmptyString(object.scope, 'ScienceStudy.scope', 4096);
  assertUniqueStrings(object.population_or_domain_constraints, 'ScienceStudy.population_or_domain_constraints', { maxItems: 32, itemMax: 2048 });
  assertUniqueStrings(object.participant_principal_refs, 'ScienceStudy.participant_principal_refs', { minItems: 1, maxItems: 64, itemMax: 512 });
  assertUniqueStrings(object.methodology_refs, 'ScienceStudy.methodology_refs', { maxItems: 64, itemMax: 2048 });
  assertUniqueDigests(object.source_manifest_digests, 'ScienceStudy.source_manifest_digests', { maxItems: 64 });
  assertUniqueDigests(object.epistemic_object_refs, 'ScienceStudy.epistemic_object_refs', { maxItems: 128 });
  assertUniqueStrings(object.disclosure_policy_refs, 'ScienceStudy.disclosure_policy_refs', { maxItems: 32, itemMax: 2048 });
  assertUniqueStrings(object.preregistration_refs, 'ScienceStudy.preregistration_refs', { maxItems: 32, itemMax: 2048 });
  assertTimestamp(object.created_at, 'ScienceStudy.created_at');
  assertDigest(object.study_digest, 'ScienceStudy.study_digest');
  if (object.authority_effect !== 'none') throw new ValidationError('ScienceStudy.authority_effect must equal none');
  assertSelfDigest(object, 'study_digest', 'ScienceStudy');
  return object;
}
```

- [ ] **Step 4: Implement `verifyScienceExperimentProposal()`**

Use these exact constraints and the explicit-unknown rule:

```js
export function verifyScienceExperimentProposal(value) {
  const object = boundedCanonical(value, 'ScienceExperimentProposal');
  assertExactFields(object, EXPERIMENT_PROPOSAL_FIELDS, 'ScienceExperimentProposal');
  if (object.schema !== AXIOM_SCIENCE_EXPERIMENT_PROPOSAL_SCHEMA) {
    throw new ValidationError(`ScienceExperimentProposal.schema must equal ${AXIOM_SCIENCE_EXPERIMENT_PROPOSAL_SCHEMA}`);
  }
  assertIdentifier(object.experiment_proposal_id, 'ScienceExperimentProposal.experiment_proposal_id');
  assertDigest(object.study_digest, 'ScienceExperimentProposal.study_digest');
  assertDigest(object.question_digest, 'ScienceExperimentProposal.question_digest');
  assertUniqueDigests(object.hypothesis_claim_refs, 'ScienceExperimentProposal.hypothesis_claim_refs', { maxItems: 32 });
  assertUniqueDigests(object.operation_candidate_refs, 'ScienceExperimentProposal.operation_candidate_refs', { maxItems: 32 });
  assertUniqueDigests(object.protocol_refs, 'ScienceExperimentProposal.protocol_refs', { minItems: 1, maxItems: 32 });
  assertUniqueStrings(object.declared_inputs, 'ScienceExperimentProposal.declared_inputs', { maxItems: 64, itemMax: 2048 });
  assertUniqueStrings(object.declared_outputs, 'ScienceExperimentProposal.declared_outputs', { minItems: 1, maxItems: 64, itemMax: 2048 });
  assertUniqueStrings(object.data_classes, 'ScienceExperimentProposal.data_classes', { maxItems: 32, itemMax: 256 });
  assertUniqueStrings(object.environment_requirements, 'ScienceExperimentProposal.environment_requirements', { maxItems: 32, itemMax: 2048 });
  assertUniqueStrings(object.instrument_requirements, 'ScienceExperimentProposal.instrument_requirements', { maxItems: 32, itemMax: 2048 });
  assertEnum(object.network_requirement, NETWORK_REQUIREMENTS, 'ScienceExperimentProposal.network_requirement');
  assertEnum(object.filesystem_requirement, FILESYSTEM_REQUIREMENTS, 'ScienceExperimentProposal.filesystem_requirement');
  assertEnum(object.credential_requirement, CREDENTIAL_REQUIREMENTS, 'ScienceExperimentProposal.credential_requirement');
  assertEnum(object.spend_requirement, SPEND_REQUIREMENTS, 'ScienceExperimentProposal.spend_requirement');
  assertUniqueStrings(object.declared_effect_classes, 'ScienceExperimentProposal.declared_effect_classes', { minItems: 1, maxItems: 9, itemMax: 128 });
  object.declared_effect_classes.forEach((item, index) => assertEnum(item, EFFECT_CLASSES, `ScienceExperimentProposal.declared_effect_classes[${index}]`));
  assertUniqueStrings(object.safety_constraint_refs, 'ScienceExperimentProposal.safety_constraint_refs', { maxItems: 32, itemMax: 2048 });
  assertUniqueStrings(object.stopping_conditions, 'ScienceExperimentProposal.stopping_conditions', { minItems: 1, maxItems: 32, itemMax: 2048 });
  assertDigest(object.analysis_plan_ref, 'ScienceExperimentProposal.analysis_plan_ref');
  assertNonEmptyString(object.proposed_execution_principal, 'ScienceExperimentProposal.proposed_execution_principal', 512);
  assertTimestamp(object.created_at, 'ScienceExperimentProposal.created_at');
  if (object.execution_authority !== 'none') throw new ValidationError('ScienceExperimentProposal.execution_authority must equal none');
  if (object.authority_effect !== 'none') throw new ValidationError('ScienceExperimentProposal.authority_effect must equal none');

  const hasUnknownRequirement = [
    object.network_requirement,
    object.filesystem_requirement,
    object.credential_requirement,
    object.spend_requirement
  ].includes('unknown') || object.data_classes.includes('unknown') || object.environment_requirements.includes('unknown') || object.instrument_requirements.includes('unknown');

  if (hasUnknownRequirement && !object.declared_effect_classes.includes('unknown')) {
    throw new ValidationError('ScienceExperimentProposal unknown requirements must preserve unknown effect classification');
  }

  assertDigest(object.proposal_digest, 'ScienceExperimentProposal.proposal_digest');
  assertSelfDigest(object, 'proposal_digest', 'ScienceExperimentProposal');
  return object;
}
```

- [ ] **Step 5: Expand the test materializer and positive/negative assertions**

After importing the API dynamically, materialize self-digests and replace the raw fixture placeholder references with exact known digests:

```js
function finalizeScienceCase(raw, api) {
  const studyBase = { ...raw.study };
  const study = {
    ...studyBase,
    study_digest: api.scienceContractDigest(studyBase, 'study_digest')
  };
  const proposalBase = {
    ...raw.proposal,
    study_digest: study.study_digest
  };
  const proposal = {
    ...proposalBase,
    proposal_digest: api.scienceContractDigest(proposalBase, 'proposal_digest')
  };
  return { ...raw, study, proposal };
}
```

Then assert:

```js
assert.equal(api.AXIOM_SCIENCE_STUDY_SCHEMA, 'axiom-science-study.v0');
assert.equal(api.AXIOM_SCIENCE_EXPERIMENT_PROPOSAL_SCHEMA, 'axiom-science-experiment-proposal.v0');

const rawVectors = JSON.parse(await readFile(fixtureUrl, 'utf8'));
const cases = new Map(rawVectors.cases.map(raw => [raw.id, finalizeScienceCase(raw, api)]));
const computational = cases.get('computational-hypothesis');
const resourceOnly = cases.get('resource-only-exploration');
const unknown = cases.get('explicit-unknown-requirements');

assert.equal(api.verifyScienceStudy(computational.study).authority_effect, 'none');
assert.equal(api.verifyScienceExperimentProposal(computational.proposal).execution_authority, 'none');
assert.equal(resourceOnly.proposal.operation_candidate_refs.length, 0);
assert.equal(api.verifyScienceExperimentProposal(unknown.proposal).network_requirement, 'unknown');
assert.deepEqual(unknown.proposal.declared_effect_classes, ['unknown']);

assert.throws(
  () => api.verifyScienceStudy({ ...computational.study, authority_effect: 'execute' }),
  /authority_effect/
);
assert.throws(
  () => api.verifyScienceExperimentProposal({ ...computational.proposal, execution_authority: 'granted' }),
  /execution_authority/
);
assert.throws(
  () => api.verifyScienceExperimentProposal({ ...unknown.proposal, declared_effect_classes: ['read_only'] }),
  /unknown requirements/
);
assert.throws(
  () => api.verifyScienceExperimentProposal({ ...computational.proposal, grant_ref: 'grant:test' }),
  /unsupported field/
);
```

- [ ] **Step 6: Run the focused contract test**

```bash
cd mesh
node --test test/axiom-science-contracts.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit the verifier slice**

```bash
git add mesh/src/lib/axiom-science-contracts.mjs mesh/test/axiom-science-contracts.test.mjs
git commit -m "feat: verify Axiom Science S0 contracts"
```

---

### Task 4: Composition reuse and authority-boundary falsification

**Files:**
- Modify: `mesh/test/axiom-science-contracts.test.mjs`
- Create: `mesh/test/axiom-science-authority-boundary.test.mjs`

**Interfaces:**
- Consumes: `finalizeEpistemicProposal()` / `validateEpistemicProposal()` from `epistemic-contracts.mjs`.
- Consumes: Research Capsule source/operation verifier + digest helper from `research-capsule-contracts.mjs`.
- Produces: executable test evidence that Axiom Science references existing digests rather than duplicating or authorizing them.

- [ ] **Step 1: Prove hypothesis reuse from the existing Epistemic Claim contract**

In `axiom-science-contracts.test.mjs`, import only the existing generic Epistemic contract functions and finalize each raw `hypothesis_claim`:

```js
import {
  finalizeEpistemicProposal,
  validateEpistemicProposal
} from '../src/lib/epistemic-contracts.mjs';
```

Materialize and bind the hypothesis content digest into both science contracts:

```js
const hypothesis = finalizeEpistemicProposal(raw.hypothesis_claim);
assert.equal(validateEpistemicProposal(hypothesis).claim_kind, 'hypothesis');

const studyBase = {
  ...raw.study,
  epistemic_object_refs: [hypothesis.content_digest]
};
```

For every fixture, assert the science layer never creates an alternate hypothesis representation.

- [ ] **Step 2: Prove Research Capsule reference reuse**

Load `mesh/fixtures/research-capsules/research-capsule-v0.vectors.json`. For each science case, locate `research_capsule_case_id`. Materialize the referenced Research Source Manifest using `researchContractDigest()` and verify it with `verifyResearchSourceManifest()`.

Bind the exact manifest digest into `ScienceStudy.source_manifest_digests`:

```js
const sourceManifestBase = { ...researchRaw.source_manifest };
const sourceManifest = {
  ...sourceManifestBase,
  manifest_digest: researchApi.researchContractDigest(sourceManifestBase, 'manifest_digest')
};
researchApi.verifyResearchSourceManifest(sourceManifest);

studyBase.source_manifest_digests = [sourceManifest.manifest_digest];
```

For cases with a Research Capsule operation, materialize/verify its operation digest and bind it to `ExperimentProposal.operation_candidate_refs`. For the resource-only case, retain `operation_candidate_refs: []`.

The science fixture must never inline-copy Research Knowledge Projection or Research Operation Candidate fields into the science schema.

- [ ] **Step 3: Add a separate authority-boundary test with static import/effect scans**

Create `mesh/test/axiom-science-authority-boundary.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const moduleUrl = new URL('../src/lib/axiom-science-contracts.mjs', import.meta.url);
const schemaUrls = [
  new URL('../../docs/architecture/contracts/axiom-science-study.v0.schema.json', import.meta.url),
  new URL('../../docs/architecture/contracts/axiom-science-experiment-proposal.v0.schema.json', import.meta.url)
];

test('Axiom Science S0 has no live effect plane or second canonical engine', async () => {
  const source = await readFile(moduleUrl, 'utf8');
  for (const forbidden of [
    'node:child_process',
    'node:net',
    'node:http',
    'node:https',
    'node:dns',
    'node:tls',
    'process.env',
    'capabilities.json',
    'Gateway',
    'Hypervisor',
    'Sandbox',
    'Grid'
  ]) {
    assert.equal(source.includes(forbidden), false, `forbidden S0 effect surface: ${forbidden}`);
  }
  assert.match(source, /from '\.\/canonical\.mjs'/);
  assert.equal(source.includes('createHash('), false, 'S0 must reuse canonical.mjs rather than create another hash/canonical engine');

  for (const url of schemaUrls) {
    const schemaText = await readFile(url, 'utf8');
    for (const forbiddenField of [
      'bearer_token',
      'credential_value',
      'mint_capability',
      'grant_authority',
      'execute_action',
      'merge_authorized',
      'deployment_authorized',
      'global_truth'
    ]) {
      assert.equal(schemaText.includes(forbiddenField), false, `forbidden schema field ${forbiddenField}`);
    }
  }
});
```

- [ ] **Step 4: Add semantic authority-smuggling negatives**

In the same authority test dynamically import the science verifier and construct a valid proposal from the fixture, then prove these mutations fail:

```js
assert.throws(() => verifyScienceExperimentProposal({ ...proposal, execution_authority: 'granted' }), /execution_authority/);
assert.throws(() => verifyScienceExperimentProposal({ ...proposal, authority_effect: 'execute' }), /authority_effect/);
assert.throws(() => verifyScienceExperimentProposal({ ...proposal, grant_authority: true }), /unsupported field/);
assert.throws(() => verifyScienceStudy({ ...study, global_truth: true }), /unsupported field/);
```

Also prove a proposal with explicit `unknown` requirements remains representable but has no alternative authorization field or executable method.

- [ ] **Step 5: Run both focused tests**

```bash
cd mesh
node --test test/axiom-science-contracts.test.mjs test/axiom-science-authority-boundary.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit the composition/boundary slice**

```bash
git add mesh/test/axiom-science-contracts.test.mjs mesh/test/axiom-science-authority-boundary.test.mjs
git commit -m "test: prove Axiom Science composition and authority boundaries"
```

---

### Task 5: Canonical documentation and checker registration

**Files:**
- Modify: `docs/README.md`
- Modify: `mesh/src/check-docs.mjs`

**Interfaces:**
- Makes the design, plan, and two schemas discoverable through the canonical documentation index.
- Keeps `check-docs` fail-closed for missing/unregistered/stale Axiom Science documentation.

- [ ] **Step 1: Register the new spec, plan, and two schemas in `CANONICAL_DOCUMENTS`**

Add exactly:

```text
docs/superpowers/specs/2026-09-17-axiom-science-v0-design.md
docs/superpowers/plans/2026-09-17-axiom-science-v0.md
docs/architecture/contracts/axiom-science-study.v0.schema.json
docs/architecture/contracts/axiom-science-experiment-proposal.v0.schema.json
```

- [ ] **Step 2: Add required-content checks**

Require the design to contain:

```text
Scientific autonomy is not scientific authority
## 19. Exact S0 implementation boundary
## 20. S0 acceptance requirements
```

Require the plan to contain:

```text
## Exact changed-file envelope
### Task 1: RED fixture and contract-test surface
## Landing gate
```

Require schema identity tokens:

```text
axiom-science-study.v0
axiom-science-experiment-proposal.v0
```

- [ ] **Step 3: Add the documentation index entries**

In `docs/README.md`, add one current architecture/design row explaining:

```text
Axiom Science S0 is a science-domain proposal layer over Research Capsule + Epistemic Fabric. It adds Science Study and Experiment Proposal contracts only; it does not add experiment execution, autonomous scientific truth, live model routing, instrument control, publication authority, or runtime capability.
```

Under draft architecture contracts, link both new schema files and keep the non-claim explicit.

- [ ] **Step 4: Run documentation checks**

```bash
node mesh/src/check-docs.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the documentation/checker slice**

```bash
git add docs/README.md mesh/src/check-docs.mjs
git commit -m "docs: register Axiom Science S0 contracts"
```

---

### Task 6: Exact-head verification and delivery gate

**Files:**
- No new production files.
- May update the PR/issue text only after verification evidence exists.

**Interfaces:**
- Produces the exact-head evidence needed to describe S0 as implementation-ready for review.

- [ ] **Step 1: Run focused Axiom Science tests**

```bash
cd mesh
node --test test/axiom-science-contracts.test.mjs test/axiom-science-authority-boundary.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run the repository check surface locally**

From repository root:

```bash
npm run check
npm run release:verify
```

Expected: PASS, subject only to clearly identified unrelated infrastructure failures. Do not describe unrun checks as passing.

- [ ] **Step 3: Inspect the exact changed-file envelope**

```bash
git diff --name-only 0a47ede785b0751cf615a3e0a67ab113e8d67599...HEAD
```

Expected: only the exact files listed in `## Exact changed-file envelope`.

If any Gateway, Hypervisor, Sandbox, Grid, capability, provider, credential, network-policy, deployment, production-policy, or runtime-launcher file appears, stop and review scope.

- [ ] **Step 4: Open or update the draft PR and wait for protected exact-head checks**

The PR body must state the exact head SHA and separately report:

```text
focused Axiom Science tests
verify
container
Node 22 compatibility
Windows 2025
macOS 15 Apple Silicon
macOS 15 Intel
CodeQL / Analyze jobs
checks not triggered or not run
```

Do not infer cross-platform success from local success.

- [ ] **Step 5: Record the implementation result on issue #1605**

The comment must preserve these non-claims:

```text
No autonomous paper fetching.
No provider-backed Research Judgment pipeline.
No experiment execution.
No instrument control.
No publication authority.
No capability-registry widening.
No scientific-truth claim.
No production promotion.
```

- [ ] **Step 6: Commit only if verification-driven documentation metadata changed**

If no repository file changed in Steps 1-5, do not create an empty commit.

---

## Plan self-review results

### Spec coverage

- Thin science domain over existing substrates: Tasks 2-4.
- Science Study v0: Tasks 1-3.
- Experiment Proposal v0: Tasks 1-3.
- Reuse Epistemic hypothesis Claim instead of a new Hypothesis object: Task 4.
- Reference Research Capsule source/operation digests rather than duplicating them: Task 4.
- Zero authority / no alternate effect plane: Tasks 3-4.
- Explicit unknown requirements: Tasks 1 and 3.
- Digest/currentness binding: Tasks 1, 3, and 4.
- No Research Judgment/Assessment schema in S0: Global Constraints + exact changed-file envelope.
- No new run-evidence type in S0: Global Constraints + exact changed-file envelope.
- No provider/network/process/Grid/capability mutation: Tasks 3-4 plus landing gate.
- Documentation/checker discoverability: Task 5.
- Exact-head evidence: Task 6.
- Dense-feedback compatibility: Experiment Proposal preserves protocol refs, requirements, declared outputs, stopping conditions, and analysis-plan digest; local/timely/objective execution feedback itself remains deliberately deferred to S3/S6.

### Placeholder scan

No `TBD`, `TODO`, “implement later”, undefined function, or unspecified schema field remains in the executable S0 tasks.

### Type/name consistency

The plan uses only these new public production exports:

```text
AXIOM_SCIENCE_STUDY_SCHEMA
AXIOM_SCIENCE_EXPERIMENT_PROPOSAL_SCHEMA
scienceContractDigest(value, digestField)
verifyScienceStudy(value)
verifyScienceExperimentProposal(value)
```

The same schema IDs are used in schemas, fixtures, verifier, tests, docs, and checker registration.

### Scope check

S0 is one independently testable subsystem. S1-S7 remain separate future gates and do not belong in this implementation plan.

## Explicitly deferred

- Epistemic `Assessment`, `Unknown`, `Relationship`, contradiction mutation, or canonical admission;
- Jev/System One Research Judgment profile and provider-backed semantic routing;
- automated paper/source fetching or continuous ingestion;
- live web/MCP/research-agent connectivity;
- computational reproduction execution sandbox;
- dense-feedback runtime selection of tests/profilers/benchmarks;
- autonomous hypothesis/frontier planning;
- Science Circle runtime;
- physical instruments, wet lab, clinical/human-subject execution;
- procurement/spending;
- publication/submission;
- independent-replication adjudication;
- production capability or promotion.

## Landing gate

Before describing Axiom Science S0 as ready for review:

1. focused Axiom Science contract and authority-boundary tests pass on the exact candidate head;
2. `node mesh/src/check-docs.mjs` passes;
3. protected `verify` and `container` pass on that exact head;
4. supported Windows/macOS compatibility checks pass where triggered;
5. CodeQL / required Analyze checks pass on the same head;
6. full `npm run check` and `npm run release:verify` pass or any unrelated failure is explicitly isolated and not misrepresented;
7. changed files remain within the exact envelope;
8. `mesh/config/capabilities.json` is unchanged;
9. no Gateway/Hypervisor/Sandbox/Grid effect implementation, provider activation, credential path, network-policy widening, deployment path, experiment executor, instrument adapter, publication path, or production promotion is added;
10. S0 continues to expose only two new domain contracts and their zero-dependency verification surface;
11. draft status remains until review confirms the intended science/epistemic/authority boundaries.
