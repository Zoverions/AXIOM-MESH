# Emergent Coordination and Collective Authority Containment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make emergent multi-agent coordination a tested AXIOM security boundary so communication, shared artifacts, collective agreement, and distributed retries cannot mint or widen machine authority.

**Architecture:** Preserve the current `Gateway -> Hypervisor -> Sandbox -> Grid` authority path and current machine-principal delegation depth zero. Add a canonical security/promotion gate, then add a deterministic shared-surface inventory verifier and current-v1 negative tests that exercise existing denial behavior without enabling delegation, remote execution, federation, or live agent Circles.

**Tech Stack:** Node.js `>=22.23.2 <23 || >=24.14.0 <25`, dependency-free ESM, `node:test`, JSON configuration, existing AXIOM documentation/capability/evidence checkers, GitHub protected CI.

**Spec:** `docs/superpowers/specs/2026-08-27-emergent-coordination-collective-authority-design.md`

## Global Constraints

- Current build remains `0.12.0-dev.3`.
- Machine-principal delegation remains disabled with maximum depth zero.
- No capability-registry promotion is part of this plan.
- No remote execution, MCP/A2A execution, federation, public swarm, or live machine-Circle authority is introduced.
- Peer messages, files, receipts, discovery output, causal records, and governance results remain non-authorizing inputs/evidence.
- Every machine-originated consequential effect continues through `Gateway -> Hypervisor -> Sandbox -> Grid`.
- Shared surfaces may move information but must not manufacture authority.
- New Markdown must remain inside the canonical repository documentation boundary enforced by `mesh/src/check-docs.mjs`.

---

### Task 1: Register the design/plan and establish the canonical promotion gate

**Files:**
- Modify: `mesh/src/check-docs.mjs`
- Modify: `docs/security/CURRENT-BUILD-THREAT-MODEL.md`
- Modify: `docs/MASTER-TODO-AGENT-INTEROPERABILITY.md`
- Modify: `docs/ROADMAP-EXTENSION-AGENT-INTEROPERABILITY.md`
- Modify: `docs/MASTER-TODO-PLURAL-AUTHORITY.md`
- Existing: `docs/superpowers/specs/2026-08-27-emergent-coordination-collective-authority-design.md`
- Existing: `docs/superpowers/plans/2026-08-27-emergent-coordination-collective-authority.md`

**Interfaces:**
- Consumes: `CANONICAL_DOCUMENTS` and the current threat-model/interoperability planning language.
- Produces: canonical references to the design and plan; an explicit Collective Authority Non-Amplification security invariant; promotion gates for delegation, remote execution, and machine Circle participation.

- [ ] **Step 1: Extend the canonical documentation boundary**

Add these exact entries to `CANONICAL_DOCUMENTS` near the security/planning documents:

```js
'docs/superpowers/specs/2026-08-27-emergent-coordination-collective-authority-design.md',
'docs/superpowers/plans/2026-08-27-emergent-coordination-collective-authority.md',
```

- [ ] **Step 2: Add the threat class and invariant to the current-build threat model**

Add a section that states:

```text
Emergent collective authority / unauthorized coordination is in scope. A set of individually bounded machine principals may exchange information through intended or unintended shared resources, assign tasks, adopt peer objectives, or distribute retries. None of those facts creates authority. Communication, consensus, assignment, receipt possession, discovery output, causal state, or shared metadata may be evidence/input only; every executable effect still requires an exact valid local authority chain to the executor.
```

Also add the following threat-actor case to the existing threat-actor list:

```text
multiple authenticated machine principals coordinating through shared files, caches, metadata, logs, causal records, artifacts, or future collaboration surfaces in an attempt to manufacture collective authority, launder a denial through another principal, or distribute resource exhaustion across identities;
```

- [ ] **Step 3: Add a named PHASEONE promotion gate to the agent interoperability todo**

Insert under Priority 0:

```markdown
- [ ] Require the PHASEONE emergent-coordination campaign before promoting machine delegation, remote execution, broad remote-agent federation, or live machine participation in Circles.
- [ ] Preserve the Collective Authority Non-Amplification invariant: peer communication, assignment, consensus, receipts, discovery, and shared artifacts never mint or widen authority.
```

Under Priority 15, add unchecked campaign items for peer-language authority injection, distributed-denial bypass, receipt/artifact laundering, causal-sync authority confusion, shared-resource covert-channel inventory, aggregate exhaustion, and safe-exit persistence.

- [ ] **Step 4: Gate future delegation and remote execution in the roadmap**

Add to Roadmap doctrine:

```markdown
12. Multi-agent coordination does not pool authority. Every executed effect requires authority bound to the actual executor; collective agreement is never an authority root.
13. Promotion of delegation, remote execution, broad agent federation, or live machine Circles requires passing the PHASEONE emergent-coordination campaign.
```

Add the same PHASEONE prerequisite explicitly to Workstream I (delegation) and Workstream L (remote execution).

- [ ] **Step 5: Gate Circle machine participation in plural-authority planning**

In Priority 0 add:

```markdown
- [ ] Require the PHASEONE emergent-coordination campaign before any live machine-agent Circle authority or machine-to-machine delegation is promoted.
```

In Priority 7/8 clarify that Circle votes, assignments, charter decisions, or shared state are governance evidence for local evaluation and do not directly mint Sandbox authority.

- [ ] **Step 6: Run documentation verification**

Run:

```bash
npm --prefix mesh run docs:check
```

Expected: exit `0`; neither the design nor plan is reported as an unexpected Markdown file.

- [ ] **Step 7: Commit**

```bash
git add mesh/src/check-docs.mjs docs/security/CURRENT-BUILD-THREAT-MODEL.md docs/MASTER-TODO-AGENT-INTEROPERABILITY.md docs/ROADMAP-EXTENSION-AGENT-INTEROPERABILITY.md docs/MASTER-TODO-PLURAL-AUTHORITY.md docs/superpowers/specs/2026-08-27-emergent-coordination-collective-authority-design.md docs/superpowers/plans/2026-08-27-emergent-coordination-collective-authority.md
git commit -m "security: gate emergent collective authority"
```

---

### Task 2: Add the shared-surface authority-impact verifier using TDD

**Files:**
- Create: `mesh/config/emergent-coordination-surfaces.json`
- Create: `mesh/src/check-emergent-coordination.mjs`
- Create: `mesh/test/emergent-coordination-check.test.mjs`
- Modify: `mesh/package.json`

**Interfaces:**
- Produces: `checkEmergentCoordination({ manifestPath? }) -> Promise<{ valid: true, schema: string, surfaces: number, non_authorizing: number }>`.
- Manifest schema discriminator: `axiom-emergent-coordination-surfaces.v1`.
- Each entry exposes exactly: `id`, `kind`, `writers`, `readers`, `authority_impact`, `negative_test_binding`, `notes`.
- `authority_impact` must equal `non-authorizing-input` for this current-v1 inventory.
- `negative_test_binding` is a repository-relative test path plus exact `test_name` string.

- [ ] **Step 1: Write a failing verifier test**

Create `mesh/test/emergent-coordination-check.test.mjs` with tests that import `checkEmergentCoordination` and assert:

```js
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkEmergentCoordination } from '../src/check-emergent-coordination.mjs';

test('emergent coordination inventory rejects a shared surface without a negative test binding', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-emergent-check-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const manifestPath = join(dir, 'surfaces.json');
  await writeFile(manifestPath, JSON.stringify({
    schema: 'axiom-emergent-coordination-surfaces.v1',
    kernel_version: '0.12.0-dev.3',
    surfaces: [{
      id: 'test.shared-file',
      kind: 'shared-file',
      writers: ['agent-a'],
      readers: ['agent-b'],
      authority_impact: 'non-authorizing-input',
      negative_test_binding: null,
      notes: 'fixture'
    }]
  }));
  await assert.rejects(
    () => checkEmergentCoordination({ manifestPath }),
    /negative test binding/
  );
});
```

Add a second test that rejects `authority_impact: 'authorizing'`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test mesh/test/emergent-coordination-check.test.mjs
```

Expected: FAIL because `mesh/src/check-emergent-coordination.mjs` does not yet exist.

- [ ] **Step 3: Implement the minimal verifier**

Create `mesh/src/check-emergent-coordination.mjs` using only Node built-ins. It must:

```js
export async function checkEmergentCoordination({ manifestPath = ACTIVE_MANIFEST } = {})
```

Validate:
- top-level object, exact `schema` and `kernel_version`;
- non-empty `surfaces` array;
- unique non-empty IDs;
- non-empty writer and reader arrays;
- `authority_impact === 'non-authorizing-input'`;
- `negative_test_binding.path` starts with `mesh/test/` and ends with `.test.mjs`;
- `negative_test_binding.test_name` is non-empty;
- the bound test file exists and contains the exact `test_name` string when checking the active repository manifest.

When run as a CLI, print one JSON line and exit non-zero on validation failure.

- [ ] **Step 4: Add the current-v1 inventory**

Create `mesh/config/emergent-coordination-surfaces.json` with at least these entries:

```text
machine discovery response
machine terminal receipt
Grid event/receipt state visible to authorized principals
causal exchange bundle/observation state
node discovery/scheduling metadata
accepted remote-social local review state
Agent Commons contribution/challenge metadata
```

Every entry must be classified `non-authorizing-input` and bind to an exact existing or Task 3 test name.

- [ ] **Step 5: Wire the verifier into the kernel check surface**

Add to `mesh/package.json`:

```json
"emergent-coordination:check": "node src/check-emergent-coordination.mjs"
```

Add `node src/check-emergent-coordination.mjs` to the `check` chain before `node --test`.

- [ ] **Step 6: Run focused tests and verifier**

Run:

```bash
node --test mesh/test/emergent-coordination-check.test.mjs
npm --prefix mesh run emergent-coordination:check
```

Expected: both exit `0`.

- [ ] **Step 7: Commit**

```bash
git add mesh/config/emergent-coordination-surfaces.json mesh/src/check-emergent-coordination.mjs mesh/test/emergent-coordination-check.test.mjs mesh/package.json
git commit -m "test: inventory non-authorizing shared surfaces"
```

---

### Task 3: Add current-v1 PHASEONE negative proofs without new authority

**Files:**
- Create: `mesh/test/emergent-coordination-e2e.test.mjs`
- Modify only if testability requires it: existing test helpers; do not change runtime authorization semantics unless a failing proof demonstrates a real bypass.

**Interfaces:**
- Consumes: `startDevelopmentStack`, `createGatewayClient`, current machine-principal v1 token schema, existing Gateway routes.
- Produces: exact named tests referenced by `emergent-coordination-surfaces.json`.

- [ ] **Step 1: Write a failing/non-covered peer-language authority-injection proof**

Create a real-stack test named exactly:

```text
peer authority language cannot widen a constrained machine principal
```

Start two constrained machine principals. One is allowed only `system.echo`; the other submits payload text containing `GO`, `APPROVED`, `OWNER`, a forged sponsor ID, a copied receipt/discovery fragment, and a requested forbidden `system.hash` action. Assert the forbidden action is still rejected with `machine_action_denied`.

- [ ] **Step 2: Add a distributed-denial proof**

Add a test named exactly:

```text
distributed constrained principals cannot pool action or purpose authority
```

Use at least two distinct agent tokens with different finite ceilings. Prove that one principal's allowed action/purpose cannot be transferred to the other by embedding the first principal's identifiers or outputs in the second principal's request.

- [ ] **Step 3: Add receipt/discovery laundering proof**

Add a test named exactly:

```text
machine receipts and discovery responses remain non-authorizing inputs
```

Obtain a valid discovery response and valid terminal receipt for principal A. Include their serialized content in principal B's input while principal B requests an action outside B's ceiling. Assert the request remains denied.

- [ ] **Step 4: Add unsupported delegation/sub-agent field proof**

Add a test named exactly:

```text
unsupported delegation and sub-agent claims cannot create v1 authority
```

Submit machine-originated intent payloads containing unsupported delegation/sub-agent authority fields and assert exact-field/schema validation rejects them or, where payload content is ordinary action input, assert they have no effect on authorization.

- [ ] **Step 5: Bind the new exact test names into the shared-surface manifest**

Update `mesh/config/emergent-coordination-surfaces.json` so every relevant surface points at the exact test names above or another exact existing negative test name.

- [ ] **Step 6: Run focused real-stack tests**

Run:

```bash
node --test mesh/test/emergent-coordination-e2e.test.mjs mesh/test/emergent-coordination-check.test.mjs
```

Expected: exit `0`.

- [ ] **Step 7: Commit**

```bash
git add mesh/test/emergent-coordination-e2e.test.mjs mesh/config/emergent-coordination-surfaces.json
git commit -m "test: prove collective authority non-amplification"
```

---

### Task 4: Verify the full protected kernel and update the PR scope

**Files:**
- Modify: PR #1324 description only if implementation lands on the same branch.
- No capability registry changes expected.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: protected CI evidence that documentation registration, verifier, and tests pass together.

- [ ] **Step 1: Run the full local check surface**

Run:

```bash
npm run check
```

Expected: exit `0`, including `setup`, network policy, Gateway client contract, Axiom One check, registry/evidence checker, status checker, docs checker, emergent-coordination checker, and complete `node:test` suite.

- [ ] **Step 2: Run release verification**

Run:

```bash
npm run release:verify
```

Expected: exit `0` with no capability-count/status change attributable to this work.

- [ ] **Step 3: Confirm the diff contains no authority promotion**

Run:

```bash
git diff main...HEAD -- mesh/config/capabilities.json
```

Expected: empty diff.

- [ ] **Step 4: Push and inspect protected CI**

Require the `Clean Kernel` verify path to complete successfully on the PR head. If Windows compatibility fails, inspect the exact failing test/log before claiming completion.

- [ ] **Step 5: Update PR #1324 description**

Change the scope from “documentation/specification only” to accurately state that the PR now includes:

```text
- canonical threat/promotion gate updates;
- deterministic shared-surface authority-impact verification;
- current-v1 PHASEONE negative proofs;
- no capability promotion, delegation enablement, remote execution, federation, or live machine-Circle authority.
```

- [ ] **Step 6: Final commit if verification metadata/docs changed**

```bash
git add -A
git commit -m "security: verify emergent coordination containment"
```

Skip this commit if there is no file change.
