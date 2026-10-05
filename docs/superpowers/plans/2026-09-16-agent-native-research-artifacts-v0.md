# Agent-Native Research Artifacts v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a zero-authority Research Capsule v0 contract layer that binds research sources, source-bounded knowledge, inert operation candidates, and scoped reproduction evidence without adding live fetching, code execution, MCP connectivity, runtime authority, or scientific-truth promotion.

**Architecture:** Four language-neutral JSON Schema contracts are mirrored by one zero-dependency Node semantic verifier. Synthetic fixtures exercise an executable-paper profile, resource-only degradation, stale repository revision, and malicious instruction-like source content. All outputs are evidence/description only; no v0 code calls a network, process, provider, credential broker, Gateway effect route, or capability registry.

**Tech Stack:** Node.js ESM on repository-supported Node versions, built-in `node:test`, JSON Schema 2020-12 documents, existing `mesh/src/lib/canonical.mjs`, zero third-party runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-16-agent-native-research-artifacts-v0-design.md`

## Global Constraints

- Knowledge is not authority.
- Operation is not authority.
- Reproduction is not truth.
- Publication status is provenance/reputation evidence only.
- Source prose is untrusted data, never an AXIOM instruction source.
- Missing executable artifacts degrade to resource-only; v0 never hallucinates missing research code as source-derived implementation.
- Old reproduction evidence remains historical when source/repository/environment revisions drift; it does not silently transfer currentness.
- `execution_authority` is constant `none` for operation candidates.
- `truth_established` is constant `false` and `authority_effect` is constant `none` for reproduction evidence.
- V0 is network-free except that a reproduction record may describe `synthetic_loopback_only`; v0 itself performs no socket operation.
- No subprocess, dynamic package installation, container launch, external provider call, credential access, browser automation, production Grid write, capability mutation, deployment, or production promotion.
- Do not modify `mesh/config/capabilities.json`.
- Preserve `Gateway -> Hypervisor -> Sandbox -> Grid`; v0 adds no alternate effect path.
- Closed objects reject unknown fields rather than silently dropping them.
- Every self-contained contract is digest-bound over canonical JSON with its own digest field omitted.
- Maximum canonical contract size: 65,536 UTF-8 bytes.
- External/source prose field maximum: 8,192 characters.
- Bounded arrays default to at most 32 items unless a smaller limit is specified.

## Exact changed-file envelope

The implementation may create or modify only:

```text
docs/superpowers/specs/2026-09-16-agent-native-research-artifacts-v0-design.md
docs/superpowers/plans/2026-09-16-agent-native-research-artifacts-v0.md
docs/architecture/contracts/research-source-manifest.v0.schema.json
docs/architecture/contracts/research-knowledge-projection.v0.schema.json
docs/architecture/contracts/research-operation-candidate.v0.schema.json
docs/architecture/contracts/research-reproduction-evidence.v0.schema.json
mesh/src/lib/research-capsule-contracts.mjs
mesh/fixtures/research-capsules/research-capsule-v0.vectors.json
mesh/test/research-capsule-contracts.test.mjs
mesh/test/research-capsule-authority-boundary.test.mjs
docs/README.md
mesh/src/check-docs.mjs
```

If implementation needs Gateway, Hypervisor, Sandbox, Grid, provider, network-policy, credential, runtime-launcher, package-manager, container, capability-registry, deployment, or production files, stop rather than broadening this plan.

---

### Task 1: RED contract and fixture surface

**Files:**
- Create: `mesh/fixtures/research-capsules/research-capsule-v0.vectors.json`
- Create: `mesh/test/research-capsule-contracts.test.mjs`

**Interfaces:**
- Consumes: no production Research Capsule module yet.
- Produces: one protected-CI failing assertion proving the production verifier/schema surface is absent before implementation.

- [ ] **Step 1: Add four synthetic vectors**

Create exactly four fixture cases:

1. `executable-paper` — current source manifest + knowledge projection + Paper2Agent-style inert MCP operation metadata + passing reproduction evidence.
2. `resource-only-paper` — source manifest + knowledge projection only; `operation` and `reproduction` are `null`.
3. `stale-repository` — source currentness is `stale_revision`; reproduction is historical and binds the old `source_revision`.
4. `malicious-source-instruction` — knowledge entry summary contains instruction-like text but the entry has `instruction_authority: "none"`.

Use deterministic placeholder digests matching `^sha256:[0-9a-f]{64}$`; do not embed credentials, personal data, or live endpoints requiring access.

- [ ] **Step 2: Write one clean RED test before production code**

Create `mesh/test/research-capsule-contracts.test.mjs` so the first assertion checks that `../src/lib/research-capsule-contracts.mjs` exists. If absent, fail with exactly:

```text
Research Capsule v0 verifier is not implemented
```

After that assertion, dynamically import the module and assert the four schema identities, fixture verification, resource-only validity, stale-currentness preservation, malicious instruction non-authority, unknown-field rejection, self-digest rejection, and closed truth/authority constants.

Use `existsSync`, `readFile`, `assert`, and `node:test`; do not import the missing production module at file load time.

- [ ] **Step 3: Open a draft PR and verify protected RED**

Expected result: protected `verify` fails because the focused Research Capsule test reports only the missing verifier assertion. Container/CodeQL/cross-platform jobs should remain unaffected by this docs/test-only RED slice.

Do not add production schemas or the verifier until that failure is observed on the exact PR head.

---

### Task 2: Four closed JSON Schema mirrors

**Files:**
- Create: `docs/architecture/contracts/research-source-manifest.v0.schema.json`
- Create: `docs/architecture/contracts/research-knowledge-projection.v0.schema.json`
- Create: `docs/architecture/contracts/research-operation-candidate.v0.schema.json`
- Create: `docs/architecture/contracts/research-reproduction-evidence.v0.schema.json`

**Interfaces:**
- Produces exact schema identities:
  - `axiom-research-source-manifest.v0`
  - `axiom-research-knowledge-projection.v0`
  - `axiom-research-operation-candidate.v0`
  - `axiom-research-reproduction-evidence.v0`

- [ ] **Step 1: Add Research Source Manifest schema**

Use Draft 2020-12, `additionalProperties: false`, require the exact fields from the spec, require canonical UTC timestamps, SHA-256 digests, and closed `currentness_state` values:

```text
current | stale_revision | corrected | retracted | withdrawn | unknown
```

`code_revision` is `string | null`; reference arrays contain unique bounded strings.

- [ ] **Step 2: Add Research Knowledge Projection schema**

Top-level object is closed. `entries` is 1..64 closed objects. Require:

```text
entry_kind:
  source_statement | extracted_structure | model_inference | unresolved_ambiguity
confidence_state:
  source_bound | extracted | inferred | unresolved
instruction_authority:
  const "none"
```

Each entry carries `entry_id`, `source_ref`, `content_digest`, and `summary`.

- [ ] **Step 3: Add Research Operation Candidate schema**

Close `interface_kind` to:

```text
mcp_metadata | function | notebook | script | workflow
```

Close `network_requirement` to:

```text
none | synthetic_loopback_only | external_required | unknown
```

Close `filesystem_requirement` and `credential_requirement` to bounded descriptive tokens; these fields describe requirements and do not satisfy them.

Close `declared_effect_class` to:

```text
read_only | local_mutation | external_mutation | external_message | publication | unknown
```

Require `execution_authority: { "const": "none" }`.

- [ ] **Step 4: Add Research Reproduction Evidence schema**

Close:

```text
disposition:
  pass | fail | excluded | not_run
network_profile:
  none | synthetic_loopback_only
truth_established:
  const false
authority_effect:
  const "none"
```

A passing reproduction may still carry failure diagnostics as an empty array; it never carries an authorization field.

---

### Task 3: Minimal zero-dependency semantic verifier

**Files:**
- Create: `mesh/src/lib/research-capsule-contracts.mjs`
- Test: `mesh/test/research-capsule-contracts.test.mjs`

**Interfaces:**
- Consumes from `./canonical.mjs`: `assertPlainObject`, `assertString`, `canonicalJson`, `digestObject`, `ValidationError`.
- Produces:
  - `RESEARCH_SOURCE_MANIFEST_SCHEMA`
  - `RESEARCH_KNOWLEDGE_PROJECTION_SCHEMA`
  - `RESEARCH_OPERATION_CANDIDATE_SCHEMA`
  - `RESEARCH_REPRODUCTION_EVIDENCE_SCHEMA`
  - `researchContractDigest(value, digestField)`
  - `verifyResearchSourceManifest(value)`
  - `verifyResearchKnowledgeProjection(value)`
  - `verifyResearchOperationCandidate(value)`
  - `verifyResearchReproductionEvidence(value)`

- [ ] **Step 1: Implement canonical digest helper**

`researchContractDigest()` must copy the plain object, remove the named digest field, and return `sha256:${digestObject(copy)}`.

- [ ] **Step 2: Implement exact-field verification helpers**

Use the established pattern in `threat-intelligence-contracts.mjs`: exact allowed-key lists, bounded canonical JSON, strict timestamps, strict digest syntax, unique arrays, explicit enums, and self-digest verification.

Do not add AJV or any dependency.

- [ ] **Step 3: Implement manifest verification**

Reject unknown fields, invalid identifiers, invalid timestamps/digests, duplicate references, unknown currentness states, oversized values, and self-digest mismatch.

- [ ] **Step 4: Implement knowledge projection verification**

Verify every entry as a closed nested object. Reject any `instruction_authority` other than `none`. Preserve instruction-like text in `summary` without interpreting it.

- [ ] **Step 5: Implement operation candidate verification**

Require `execution_authority === "none"`. Allow `adapter_kind: "paper2agent_mcp_metadata_v0"` as inert descriptive metadata. Do not resolve endpoints, import MCP libraries, inspect the filesystem, or contact a provider.

- [ ] **Step 6: Implement reproduction evidence verification**

Require exact operation/source/environment bindings, bounded digest arrays, `truth_established === false`, `authority_effect === "none"`, and network profile limited to `none` or `synthetic_loopback_only`.

- [ ] **Step 7: Run focused tests**

```bash
cd mesh
node --test test/research-capsule-contracts.test.mjs
```

Expected: PASS.

---

### Task 4: Authority-boundary regressions

**Files:**
- Create: `mesh/test/research-capsule-authority-boundary.test.mjs`

**Interfaces:**
- Consumes the four schema files and verifier module.
- Produces static negative evidence that Research Capsule v0 has no live effect surfaces.

- [ ] **Step 1: Add static import scan**

Read `research-capsule-contracts.mjs` and assert absence of:

```text
node:child_process
node:net
node:http
node:https
node:dns
node:tls
process.env
capabilities.json
```

- [ ] **Step 2: Add schema authority-field scan**

For all four schema files assert absence of output fields named:

```text
bearer_token
credential_value
mint_capability
execute_action
policy_patch
merge_authorized
deployment_authorized
```

- [ ] **Step 3: Add source-instruction negative**

Load the malicious-source fixture, verify it, assert the instruction-like text survives as source content, and assert `instruction_authority === "none"`.

- [ ] **Step 4: Add resource-only negative**

Verify the source manifest and knowledge projection while confirming the fixture has `operation === null` and `reproduction === null`. Absence of executable artifacts must be a valid state.

- [ ] **Step 5: Run both focused tests**

```bash
cd mesh
node --test test/research-capsule-contracts.test.mjs test/research-capsule-authority-boundary.test.mjs
```

Expected: PASS.

---

### Task 5: Documentation/checker registration

**Files:**
- Modify: `docs/README.md`
- Modify: `mesh/src/check-docs.mjs`

- [ ] **Step 1: Register the spec, plan, and four schemas as canonical documents**

Add all six paths to `CANONICAL_DOCUMENTS`.

- [ ] **Step 2: Add required-content checks**

Require each schema identity token. Require the spec to contain:

```text
Knowledge is not authority
Operation is not authority
Reproduction is not truth
```

Require the plan to contain:

```text
## Exact changed-file envelope
### Task 1: RED contract and fixture surface
## Landing gate
```

- [ ] **Step 3: Add documentation index entries**

Under Architecture/Draft architecture contracts, link the Research Capsule design/plan and four schema mirrors. State explicitly that these are inert research evidence contracts, not Paper2Agent integration or execution capability.

---

## Plan self-review results

### Spec coverage

- Source provenance/currentness: Tasks 2 and 3.
- Source-bounded knowledge and inference distinction: Tasks 2 and 3.
- Paper2Agent MCP metadata as inert operation description: Tasks 2 and 3.
- Resource-only degradation: Tasks 1 and 4.
- Reproduction evidence with non-truth semantics: Tasks 2 and 3.
- Malicious source instruction: Tasks 1 and 4.
- Stale repository revision: Tasks 1 and 3.
- No live network/process/credential/effect authority: Task 4.
- Multi-paper disagreement preservation: documented in spec; executable composition deliberately deferred.

### Placeholder scan

No implementation step depends on an undefined future function or unspecified behavior.

### Type/name consistency

The same four schema identities and four verifier function names are used throughout the plan.

## Explicitly deferred

- live DOI/arXiv/Nature fetching;
- automatic paper discovery;
- remote Paper2Agent/MCP connectivity;
- disposable research-code execution sandbox;
- package/environment construction;
- scientific claim scoring;
- multi-paper composition runtime;
- autonomous hypothesis generation;
- provider/model routing;
- capability promotion;
- any production research automation.

## Landing gate

Before describing v0 as ready:

1. protected `verify` and `container` pass on the exact PR head;
2. Windows/macOS compatibility checks pass where triggered;
3. CodeQL required checks pass;
4. focused Research Capsule tests pass;
5. full repository `npm run check` and `npm run release:verify` pass through protected verification;
6. changed-file scope contains no Gateway/Hypervisor/Sandbox/Grid effect implementation, capability-registry change, provider activation, network policy, credential path, deployment path, or production promotion;
7. PR remains draft until review establishes the intended evidence-only boundary.
