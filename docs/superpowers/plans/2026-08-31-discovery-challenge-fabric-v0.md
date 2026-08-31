# Discovery & Challenge Fabric v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repository-local, zero-authority Discovery & Challenge Fabric v0 that validates provenance-aware research findings, preserves contradiction and negative evidence, records explicit blindspots and architecture impacts, and requires a separate review disposition before any follow-on work can be proposed.

**Architecture:** Implement one dependency-free ESM contract module backed by five closed JSON Schema 2020-12 mirrors and deterministic repository-local fixtures. DCF objects are descriptive and proposal-only: they may reference existing AXIOM requirements and paths but cannot browse, invoke models, write memory, mutate GitHub, alter policy, promote capabilities, or enter the Gateway -> Hypervisor -> Sandbox -> Grid authority path. A non-canonical sample Blindspot Register demonstrates the lifecycle without becoming a new source of truth.

**Tech Stack:** Node.js ESM, Node built-in `node:test`, existing `canonical.mjs` / `ValidationError` helpers, JSON Schema 2020-12, repository-local JSON fixtures, existing documentation checks.

**Spec:** `docs/superpowers/specs/2026-08-31-discovery-challenge-fabric-v0-design.md`

## Global Constraints

- Node compatibility remains `>=22.23.2 <23 || >=24.14.0 <25`.
- `mesh/config/capabilities.json` remains authoritative; this slice MUST NOT change runnable capability status.
- No DCF production module may import filesystem, network, subprocess, Grid, Gateway, Hypervisor, Sandbox, credential, wallet, token, secret, browser, MCP, A2A, runtime-supervisor, or provider invocation surfaces.
- `authority_effect` MUST equal `none` for every DCF object.
- `runtime_effect` MUST equal `none` for Source Envelope, Insight Candidate, Blindspot Record, and Architecture Impact Record.
- `capability_promotion` MUST equal `false` for Source Envelope, Insight Candidate, Blindspot Record, and Architecture Impact Record.
- `canonical_truth_effect` MUST equal `none` for Source Envelope, Insight Candidate, Blindspot Record, and Architecture Impact Record.
- `mutation_effect` MUST equal `none` for Source Envelope, Insight Candidate, Blindspot Record, and Architecture Impact Record.
- `implementation_status` MUST equal `not-authorized` for Architecture Impact Record v0.
- Discovery, evidence strength, claim confidence, novelty, source class, and review state MUST remain separate dimensions.
- Raw source count MUST NOT be substituted for independent source-lineage count.
- Negative evidence and contradictions MUST remain representable without conversion into success or failure claims.
- Unresolved architecture references MUST remain explicitly unresolved; they MUST NOT be treated as valid authority, valid implementation, or successful coverage.
- `private-security` sources MUST NOT be emitted into the public sample register or any public-facing fixture.
- Review Disposition records a governance decision only; it MUST NOT itself create an issue, branch, test, RFC, PR, capability, or runtime effect.
- No network watcher, scheduled job, source connector, model call, native UI, autonomous GitHub mutation, or live Composition Authority is part of v0.

## File Structure

**Create contracts**
- `docs/architecture/contracts/discovery-source-envelope.v0.schema.json` — Source Envelope closed schema.
- `docs/architecture/contracts/discovery-insight-candidate.v0.schema.json` — Insight Candidate closed schema.
- `docs/architecture/contracts/blindspot-record.v0.schema.json` — Blindspot Record closed schema.
- `docs/architecture/contracts/architecture-impact-record.v0.schema.json` — Architecture Impact Record closed schema.
- `docs/architecture/contracts/discovery-review-disposition.v0.schema.json` — Review Disposition closed schema.

**Create implementation**
- `mesh/src/lib/discovery-challenge-fabric.mjs` — all v0 deterministic validation, cross-record reference checks, lineage-count verification, and frozen comparison summaries.

**Create tests and fixtures**
- `mesh/test/discovery-challenge-fabric.test.mjs` — semantic contract and cross-record tests.
- `mesh/test/discovery-challenge-fabric-schema.test.mjs` — JSON Schema mirrors and hard-boundary tests.
- `mesh/test/discovery-challenge-fabric-boundary-static.test.mjs` — no-I/O/no-authority import and source-surface checks.
- `mesh/test/fixtures/discovery-challenge-fabric/source-formal.json`
- `mesh/test/fixtures/discovery-challenge-fabric/source-empirical.json`
- `mesh/test/fixtures/discovery-challenge-fabric/source-derivative.json`
- `mesh/test/fixtures/discovery-challenge-fabric/candidate-memory-laundering.json`
- `mesh/test/fixtures/discovery-challenge-fabric/candidate-negative-result.json`
- `mesh/test/fixtures/discovery-challenge-fabric/blindspot-unowned-boundary.json`
- `mesh/test/fixtures/discovery-challenge-fabric/impact-memory-authority.json`
- `mesh/test/fixtures/discovery-challenge-fabric/review-create-test.json`
- `mesh/test/fixtures/discovery-challenge-fabric/invalid-instances.json`

**Create non-canonical example registry**
- `docs/architecture/blindspots/BLINDSPOT-REGISTER.v0.json` — reviewed public examples only; explicitly non-authoritative.
- `docs/architecture/blindspots/README.md` — precedence/non-claim boundary for the sample register.

**Modify normative/documentation surfaces**
- `docs/rebuild/REQUIREMENTS.md` — add `DISC-01` through `DISC-08` requirements and acceptance evidence.
- `docs/README.md` — add a narrow link to the approved DCF design and non-canonical sample register.

---

### Task 1: Lock the five DCF contracts with failing schema and semantic tests

**Files:**
- Create: `mesh/test/discovery-challenge-fabric-schema.test.mjs`
- Create: `mesh/test/discovery-challenge-fabric.test.mjs`
- Create later after RED: all five `docs/architecture/contracts/*discovery*.schema.json` / blindspot / impact schema files.
- Create later after RED: `mesh/src/lib/discovery-challenge-fabric.mjs`.

**Interfaces:**
- Produces constants:
  - `DISCOVERY_SOURCE_ENVELOPE_SCHEMA = 'axiom-discovery-source-envelope.v0'`
  - `DISCOVERY_INSIGHT_CANDIDATE_SCHEMA = 'axiom-discovery-insight-candidate.v0'`
  - `BLINDSPOT_RECORD_SCHEMA = 'axiom-blindspot-record.v0'`
  - `ARCHITECTURE_IMPACT_RECORD_SCHEMA = 'axiom-architecture-impact-record.v0'`
  - `DISCOVERY_REVIEW_DISPOSITION_SCHEMA = 'axiom-discovery-review-disposition.v0'`
- Produces validators:
  - `validateDiscoverySourceEnvelope(source)`
  - `validateDiscoveryInsightCandidate(candidate)`
  - `validateBlindspotRecord(record)`
  - `validateArchitectureImpactRecord(record)`
  - `validateDiscoveryReviewDisposition(disposition)`
- Consumes only `ValidationError` and, where digesting is required later, `digestObject` / `canonicalJson` from `./canonical.mjs`.

- [ ] **Step 1: Write the missing-surface RED tests**

Start `mesh/test/discovery-challenge-fabric.test.mjs` with imports that do not yet exist:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DISCOVERY_SOURCE_ENVELOPE_SCHEMA,
  DISCOVERY_INSIGHT_CANDIDATE_SCHEMA,
  BLINDSPOT_RECORD_SCHEMA,
  ARCHITECTURE_IMPACT_RECORD_SCHEMA,
  DISCOVERY_REVIEW_DISPOSITION_SCHEMA,
  validateDiscoverySourceEnvelope,
  validateDiscoveryInsightCandidate,
  validateBlindspotRecord,
  validateArchitectureImpactRecord,
  validateDiscoveryReviewDisposition
} from '../src/lib/discovery-challenge-fabric.mjs';

test('DCF v0 exports five zero-authority contract surfaces', () => {
  assert.equal(DISCOVERY_SOURCE_ENVELOPE_SCHEMA, 'axiom-discovery-source-envelope.v0');
  assert.equal(DISCOVERY_INSIGHT_CANDIDATE_SCHEMA, 'axiom-discovery-insight-candidate.v0');
  assert.equal(BLINDSPOT_RECORD_SCHEMA, 'axiom-blindspot-record.v0');
  assert.equal(ARCHITECTURE_IMPACT_RECORD_SCHEMA, 'axiom-architecture-impact-record.v0');
  assert.equal(DISCOVERY_REVIEW_DISPOSITION_SCHEMA, 'axiom-discovery-review-disposition.v0');
});
```

- [ ] **Step 2: Write schema-mirror RED tests**

In `mesh/test/discovery-challenge-fabric-schema.test.mjs`, load each future schema with `readFileSync` and assert:

```js
assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.equal(schema.additionalProperties, false);
assert.equal(schema.properties.authority_effect.const, 'none');
```

For the four non-disposition schemas also assert:

```js
assert.equal(schema.properties.runtime_effect.const, 'none');
assert.equal(schema.properties.capability_promotion.const, false);
assert.equal(schema.properties.canonical_truth_effect.const, 'none');
assert.equal(schema.properties.mutation_effect.const, 'none');
```

For `architecture-impact-record.v0.schema.json` additionally assert:

```js
assert.equal(schema.properties.implementation_status.const, 'not-authorized');
```

For Review Disposition assert the exact decision enum from the spec and `authority_effect.const === 'none'`.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
cd mesh
node --test --test-reporter=spec \
  test/discovery-challenge-fabric.test.mjs \
  test/discovery-challenge-fabric-schema.test.mjs
```

Expected: FAIL because the module and schema files do not exist. Existing unrelated tests must not be modified to manufacture RED.

- [ ] **Step 4: Implement minimal strict validator primitives**

Create `mesh/src/lib/discovery-challenge-fabric.mjs` with small internal helpers following existing contract modules:

```js
import { canonicalJson, digestObject, ValidationError } from './canonical.mjs';

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,191}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;

function requirePlain(value, name) {
  if (
    value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) throw new ValidationError(`${name} must be a plain object`);
}

function rejectUnknown(value, allowed, name) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new ValidationError(`${name} contains unsupported field ${key}`);
    }
  }
}

function requireBoundary(value, name) {
  if (value !== 'none') throw new ValidationError(`${name} must remain none`);
}
```

Keep helpers local to this module; do not refactor unrelated validators in this slice.

- [ ] **Step 5: Implement Source Envelope validation**

Use exact required fields from the spec. Enforce closed source classes:

```js
const SOURCE_CLASSES = Object.freeze([
  'formal', 'empirical', 'frontier', 'expert-hypothesis',
  'practitioner', 'community', 'adjacent-domain'
]);
const EVIDENCE_STATUSES = Object.freeze([
  'observed', 'fetched', 'reproduced', 'independently-verified', 'unverified'
]);
const SENSITIVITIES = Object.freeze(['public', 'restricted', 'private-security']);
```

`content_digest` is nullable or lowercase SHA-256. `upstream_refs` is duplicate-free. `published_at` is nullable; non-null values must parse as timestamps. Return `true` and never mutate input.

- [ ] **Step 6: Implement Insight Candidate validation**

Use exact enums from the spec. Require at least one `source_ref`. Require `independent_lineage_count` to be an integer `>= 1` and `<= source_refs.length`. Reject self-reference in `counterevidence_refs` when a candidate references its own `candidate_id`. Preserve `negative-result` as a valid `candidate_type`; do not infer confidence from source class.

- [ ] **Step 7: Implement Blindspot, Architecture Impact, and Review Disposition validation**

Blindspot Record must preserve nullable `known_owner` and exact urgency/review-state enums. Architecture Impact must require at least one `impact_class`, duplicate-free values, `implementation_status: 'not-authorized'`, and descriptive-only paths/requirement IDs. Review Disposition must require `authority_effect: 'none'` and allow `next_locator: null`.

- [ ] **Step 8: Create five JSON Schema mirrors**

Each schema must:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false
}
```

Mirror closed enum vocabularies and fixed hard boundaries. Add a non-normative extension field only at schema root if the repo's existing schema convention already supports it; otherwise keep schemas standard-only and test semantic behavior in the ESM validator.

- [ ] **Step 9: Verify GREEN for Task 1**

Run the same focused command. Expected: all Task 1 tests PASS.

- [ ] **Step 10: Commit Task 1**

```bash
git add \
  mesh/src/lib/discovery-challenge-fabric.mjs \
  mesh/test/discovery-challenge-fabric.test.mjs \
  mesh/test/discovery-challenge-fabric-schema.test.mjs \
  docs/architecture/contracts/discovery-source-envelope.v0.schema.json \
  docs/architecture/contracts/discovery-insight-candidate.v0.schema.json \
  docs/architecture/contracts/blindspot-record.v0.schema.json \
  docs/architecture/contracts/architecture-impact-record.v0.schema.json \
  docs/architecture/contracts/discovery-review-disposition.v0.schema.json
git commit -m "feat: add discovery challenge contracts"
```

### Task 2: Add cross-record lineage and architecture-reference verification

**Files:**
- Modify: `mesh/src/lib/discovery-challenge-fabric.mjs`
- Modify: `mesh/test/discovery-challenge-fabric.test.mjs`
- Create: `mesh/test/fixtures/discovery-challenge-fabric/*.json` listed in File Structure.

**Interfaces:**
- Produces:
  - `discoverySourceDigest(source)` -> lowercase SHA-256 string.
  - `validateDiscoveryBundle(bundle, repositoryIndex = null)` -> deeply frozen deterministic summary.
  - `countIndependentSourceLineages(sources)` -> integer computed only from explicit lineage refs.
- Consumes validated v0 objects only.
- `repositoryIndex` is nullable and read-only; when absent, architecture refs remain explicitly unresolved rather than failing the whole source/candidate validation.

- [ ] **Step 1: Write lineage RED tests with exact fixtures**

Create three sources:

`source-formal.json`:

```json
{
  "schema": "axiom-discovery-source-envelope.v0",
  "source_id": "source:formal:memory-origin",
  "captured_at": "2026-08-31T15:00:00.000Z",
  "source_class": "formal",
  "title": "Origin-bound memory authority paper",
  "locator": "https://example.invalid/paper/memory-origin",
  "publisher_or_origin": "example-research-group",
  "published_at": "2026-08-30T12:00:00.000Z",
  "content_digest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "upstream_refs": [],
  "evidence_status": "fetched",
  "sensitivity": "public",
  "notes": "public fixture only",
  "authority_effect": "none",
  "runtime_effect": "none",
  "capability_promotion": false,
  "canonical_truth_effect": "none",
  "mutation_effect": "none"
}
```

`source-derivative.json` must point its `upstream_refs` to `source:formal:memory-origin`. `source-empirical.json` must have no shared upstream ref.

Test:

```js
assert.equal(countIndependentSourceLineages([formal, derivative]), 1);
assert.equal(countIndependentSourceLineages([formal, derivative, empirical]), 2);
```

- [ ] **Step 2: Write hypothesis/negative-evidence RED tests**

Create `candidate-memory-laundering.json` as `candidate_type: 'hypothesis'`, with `source_refs` for formal + empirical and `independent_lineage_count: 2`.

Create `candidate-negative-result.json` as `candidate_type: 'negative-result'` with `claim_confidence: 'medium'` and explicit uncertainty. Test that validation preserves these exact fields; no helper may upgrade `hypothesis` to `finding` or convert `negative-result` into a rejection.

- [ ] **Step 3: Write bundle reference-integrity RED tests**

Define bundle shape in the test only:

```js
{
  sources: [formal, derivative, empirical],
  candidates: [candidate],
  blindspots: [blindspot],
  impacts: [impact],
  dispositions: [disposition]
}
```

Require:
- every `source_ref` resolves to exactly one source;
- every `candidate_ref` resolves to exactly one candidate;
- every `blindspot_ref` resolves to exactly one blindspot;
- every `impact_ref` resolves to exactly one impact;
- duplicate IDs fail closed;
- a candidate's declared `independent_lineage_count` equals the deterministic explicit-lineage count of its referenced sources;
- unresolved refs throw `ValidationError` with stable message fragments.

- [ ] **Step 4: Implement `discoverySourceDigest` and explicit lineage grouping**

`discoverySourceDigest` validates then calls `digestObject(source)`.

`countIndependentSourceLineages` must not use publisher names, URL domains, textual similarity, model inference, or source reputation. For v0, construct connected components only from explicit `source_id`/`upstream_refs` relations among supplied sources. Unknown upstream refs remain external roots and must not be silently merged.

- [ ] **Step 5: Implement `validateDiscoveryBundle`**

Return a deeply frozen summary with only deterministic evidence:

```js
{
  valid: true,
  source_count,
  candidate_count,
  blindspot_count,
  impact_count,
  disposition_count,
  unresolved_architecture_refs,
  authority_effect: 'none',
  runtime_effect: 'none',
  capability_promoted: false,
  repository_mutated: false
}
```

Do not return a recommendation, score, trust level, or execution decision.

- [ ] **Step 6: Add `repositoryIndex` reference checking without mutation**

Use a simple caller-supplied shape:

```js
{
  requirement_ids: ['GRID-05', 'AI-05'],
  paths: ['docs/architecture/SOVEREIGN-VAULTS-AND-CONTEXT-BROKER.md']
}
```

For each Architecture Impact Record, list unmatched `affected_requirements` and `affected_paths` in `unresolved_architecture_refs`. Do not reject an otherwise valid research bundle merely because an architecture ref is unresolved; the explicit unresolved result is the fail-safe state required by the spec.

- [ ] **Step 7: Add `invalid-instances.json` adversarial fixture matrix**

Include named mutations for:
- unsupported top-level field;
- missing provenance/title/locator;
- `authority_effect: 'proposal-authority'`;
- `runtime_effect: 'execute'`;
- `capability_promotion: true`;
- `canonical_truth_effect: 'accepted'`;
- `mutation_effect: 'write'`;
- source self-upstream reference;
- duplicate source refs;
- candidate self-counterevidence;
- claimed lineage count larger than referenced sources;
- `implementation_status: 'approved'`;
- disposition `authority_effect: 'create-issue'`;
- unresolved candidate/blindspot/impact refs.

Each fixture carries an `expected_error` regex fragment used by one looped negative test.

- [ ] **Step 8: Verify GREEN for Task 2**

Run:

```bash
cd mesh
node --test --test-reporter=spec test/discovery-challenge-fabric.test.mjs
```

Expected: PASS with all positive and adversarial cases.

- [ ] **Step 9: Commit Task 2**

```bash
git add mesh/src/lib/discovery-challenge-fabric.mjs mesh/test/discovery-challenge-fabric.test.mjs mesh/test/fixtures/discovery-challenge-fabric
git commit -m "test: enforce discovery lineage and references"
```

### Task 3: Prove the no-authority/no-I/O boundary statically

**Files:**
- Create: `mesh/test/discovery-challenge-fabric-boundary-static.test.mjs`
- Inspect: `mesh/src/lib/discovery-challenge-fabric.mjs`

**Interfaces:**
- Static test reads the DCF module source only; it does not exercise runtime capabilities.

- [ ] **Step 1: Write the boundary test**

The test should load module source and reject forbidden imports/tokens with explicit patterns:

```js
const forbidden = [
  "node:fs", "node:http", "node:https", "node:net", "node:tls", "node:dns",
  "node:child_process", "node:worker_threads", "fetch(", "Grid", "Gateway",
  "Hypervisor", "Sandbox", "credential", "wallet", "token", "secret",
  "mcp", "a2a", "provider-supervisor", "runtime-supervisor"
];
for (const needle of forbidden) {
  assert.equal(source.includes(needle), false, `forbidden DCF boundary token: ${needle}`);
}
```

Then parse import lines and permit only `./canonical.mjs`.

- [ ] **Step 2: Add semantic non-effect assertions**

For a valid bundle summary assert:

```js
assert.equal(summary.authority_effect, 'none');
assert.equal(summary.runtime_effect, 'none');
assert.equal(summary.capability_promoted, false);
assert.equal(summary.repository_mutated, false);
```

- [ ] **Step 3: Run focused boundary test**

```bash
cd mesh
node --test --test-reporter=spec test/discovery-challenge-fabric-boundary-static.test.mjs
```

Expected: PASS. A pass proves only the local source boundary; it is not a full system-security claim.

- [ ] **Step 4: Commit Task 3**

```bash
git add mesh/test/discovery-challenge-fabric-boundary-static.test.mjs
git commit -m "test: prove discovery fabric zero-authority boundary"
```

### Task 4: Add the non-canonical Blindspot Register and normative DCF requirements

**Files:**
- Create: `docs/architecture/blindspots/README.md`
- Create: `docs/architecture/blindspots/BLINDSPOT-REGISTER.v0.json`
- Modify: `docs/rebuild/REQUIREMENTS.md`
- Modify: `docs/README.md`
- Modify: `mesh/test/discovery-challenge-fabric.test.mjs`

**Interfaces:**
- The sample register is consumed by `validateDiscoveryBundle` in tests only.
- New normative requirements are IDs `DISC-01` through `DISC-08`.

- [ ] **Step 1: Create `docs/architecture/blindspots/README.md` with explicit precedence**

The opening must state:

```markdown
# AXIOM-MESH Blindspot Register v0

This directory contains reviewed, non-canonical Discovery & Challenge Fabric examples.
It is not a capability registry, requirement registry, threat-model authority, issue tracker,
memory authority plane, or implementation queue. Entries may propose review but cannot
change runnable state, policy, requirements, or repository content by their existence.
```

Also state that `private-security` material does not belong in this public register.

- [ ] **Step 2: Create a public-safe sample register**

`BLINDSPOT-REGISTER.v0.json` must be one complete DCF bundle using public-safe fixtures conceptually equivalent to:
- memory authority laundering -> `unmodelled-threat` -> `GRID-05` / Sovereign Vault path -> `test` + `research-needed`;
- protocol composition -> `unowned-boundary` -> Agent Commons / Runtime Connector Fabric paths -> `test` + `contract`;
- trusted-domain download confusion -> `missing-ui` -> `UX-02`, `UX-03`, `UX-06` -> `ui` + `threat-model`;
- one negative or `NOT_REPRODUCED` example proving contrary evidence remains first-class.

Every impact must keep `implementation_status: 'not-authorized'`. Every disposition must have `authority_effect: 'none'` and may only point to a future locator if that locator already exists through ordinary repository governance.

- [ ] **Step 3: Add a test that the sample register validates and contains no private-security source**

```js
const register = load(BLINDSPOT_REGISTER_URL);
const summary = validateDiscoveryBundle(register, repositoryIndex);
assert.equal(summary.valid, true);
assert.ok(register.sources.every(source => source.sensitivity !== 'private-security'));
```

- [ ] **Step 4: Add `DISC-01` through `DISC-08` to `docs/rebuild/REQUIREMENTS.md`**

Use this exact requirement intent:

| ID | Requirement | Acceptance evidence |
|---|---|---|
| DISC-01 | External research, incidents, standards, expert hypotheses, and community observations MUST enter DCF as non-authoritative provenance-bearing records before they can influence architecture review. | Contract/schema and source-provenance negative tests. |
| DISC-02 | Source class, evidence strength, claim confidence, novelty, review state, and architecture impact MUST remain separately represented; no field may silently imply another. | Cross-field mutation/property tests. |
| DISC-03 | Corroboration MUST be lineage-aware and raw source count MUST NOT be treated as independent confirmation. | Derivative-source and explicit-lineage tests. |
| DISC-04 | Contradiction, uncertainty, negative results, and `NOT_REPRODUCED` evidence MUST remain first-class and MUST NOT be suppressed or converted into positive findings. | Negative-evidence fixtures and regression tests. |
| DISC-05 | DCF architecture refs MAY identify exact requirements, paths, invariants, tests, or UI surfaces, but those refs MUST remain descriptive and MUST NOT grant write, execution, policy, or capability authority. | Unresolved-ref and zero-authority boundary tests. |
| DISC-06 | A DCF finding MUST pass an explicit Review Disposition before any test/RFC/threat-model/UI/implementation proposal is considered, and the disposition itself MUST NOT perform the consequential repository effect. | Disposition validation and no-GitHub-mutation tests. |
| DISC-07 | Discovery tooling MUST NOT autonomously browse, invoke models/providers, access credentials, write memory, mutate repositories, or promote capabilities unless each future effect is separately designed, authorized, evidenced, and promoted through ordinary AXIOM controls. | Static boundary tests and capability-registry parity check. |
| DISC-08 | Public Blindspot Register outputs MUST exclude private-security material and clearly state that DCF records do not override capability, requirement, status, or readiness sources of truth. | Documentation/static-content and public-fixture tests. |

- [ ] **Step 5: Add `docs/README.md` links without overstating runtime support**

Link to:
- approved DCF design;
- sample Blindspot Register;
- the five contract schemas.

Use wording such as `approved zero-authority research/proposal substrate` and explicitly avoid `live research service`, `autonomous radar`, or `production capability`.

- [ ] **Step 6: Run docs and DCF tests**

```bash
cd mesh
node src/check-docs.mjs
node --test --test-reporter=spec \
  test/discovery-challenge-fabric.test.mjs \
  test/discovery-challenge-fabric-schema.test.mjs \
  test/discovery-challenge-fabric-boundary-static.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add \
  docs/architecture/blindspots \
  docs/rebuild/REQUIREMENTS.md \
  docs/README.md \
  mesh/test/discovery-challenge-fabric.test.mjs
git commit -m "docs: register discovery blindspot governance"
```

### Task 5: Full regression verification, scope review, and pull request

**Files:**
- No new production files unless verification exposes a DCF defect.
- Review every changed path against the approved design and this plan.

**Interfaces:**
- Uses repository `npm test`, `npm run check`, and protected GitHub Actions evidence.

- [ ] **Step 1: Run the complete local-supported checks where execution environment is available**

```bash
npm test
npm run check
```

If implementation is performed only through repository writes with no local runtime, use the PR's protected CI as the execution evidence instead of claiming local verification.

- [ ] **Step 2: Confirm capability-registry parity**

Compare `mesh/config/capabilities.json` with the branch base. Expected: no DCF-related runnable capability addition and no status promotion.

- [ ] **Step 3: Review changed-file scope**

Expected implementation scope is limited to:
- approved DCF spec + implementation plan;
- five schemas;
- one DCF contract module;
- three DCF test files;
- DCF fixtures;
- sample Blindspot Register + README;
- `docs/rebuild/REQUIREMENTS.md`;
- `docs/README.md`.

Any unrelated runtime, policy, gateway, provider, credential, network, UI implementation, or capability-registry change is a stop-and-review condition.

- [ ] **Step 4: Create a draft PR from `design/discovery-challenge-fabric-v0` to `main`**

PR title:

```text
Add zero-authority Discovery & Challenge Fabric v0
```

PR body must include:
- design and plan paths;
- exact non-claims: no watcher, model call, network ingestion, credentials, UI activation, GitHub automation, Grid mutation, or capability promotion;
- test/CI evidence available at submission time;
- statement that sample Blindspot Register is non-canonical.

- [ ] **Step 5: Inspect protected CI rather than assuming success**

Require the repository's normal clean-kernel and compatibility checks to run on the exact PR head. If a job fails, inspect the failed step/log, add a regression test for any code defect, fix only the causal issue, and verify a fresh head.

- [ ] **Step 6: Run final semantic review against the design**

Confirm all 23 design sections that impose v0 behavior are either implemented or explicitly deferred exactly where the spec says future phase. Specifically verify:
- five-object lifecycle exists;
- Review Disposition is mandatory as governance boundary;
- source/evidence/confidence separation exists;
- explicit lineage handling exists;
- negative evidence exists;
- unowned boundary exists;
- unresolved refs remain explicit;
- memory-authority consequence is represented as blindspot/impact only, not live memory change;
- Trust Center/Radar remains documentation only;
- Wildcard Lane remains future policy only;
- Incident Backpropagator remains future work;
- no capability registry promotion occurred.

- [ ] **Step 7: Merge only after fresh green verification**

Use the repository's normal merge mechanism with an expected-head guard when available. Do not claim DCF implementation complete until the merged `main` SHA is known and its post-merge verification state is checked.

---

## Deferred Follow-ons Requiring Separate Approval

These are explicitly outside this plan and must not be smuggled into v0 implementation:

1. Repository-local architecture index beyond the caller-supplied test index.
2. Read-only source connectors or network ingestion.
3. Model-assisted extraction or architecture comparison.
4. Incident Backpropagator that drafts tests.
5. Axiom One Trust Center / Radar UI.
6. Composition Lab for MCP + A2A + OAuth/provider/device combinations.
7. Memory Authority Kernel changes to Grid/Sovereign Vault semantics.
8. Continuous runtime attestation / TPM / TEE integration.
9. Automated issue, branch, RFC, or PR creation.
10. Any new `mesh/config/capabilities.json` entry or promotion.

The v0 success condition is intentionally narrower: **AXIOM can represent, validate, challenge, and review a blindspot without allowing the discovery machinery to become an authority system.**
