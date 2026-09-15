# Axiom One Capability Parity v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live Mesh capability registry legible in Axiom One without turning discovery into authority or enabling any new browser mutation.

**Architecture:** Keep the authenticated Gateway as the only live source. Add a fail-closed policy contract for capability parity, then a small pure browser projection that converts registry entries into human-readable claims. The Overview consumes the projection while explicitly representing principal authority as `not-inferred-from-discovery`; execution continues to use the existing intent/authority path.

**Tech Stack:** Node.js 24 development baseline, browser ES modules, zero third-party runtime dependencies, `node:test`, authenticated Gateway client.

**Spec:** `docs/operations/AXIOM-ONE-LOCAL-PREVIEW.md`

## Global Constraints

- Capability discovery never grants authority.
- Only registry entries whose exact status is `implemented` are presented as runnable implementation claims.
- Current-principal authority is never inferred from `capabilities.list`.
- No new browser mutation, remote origin, federation, external AI provider, production promotion, or sharing capability is enabled.
- Axiom One remains loopback-only and uses the existing versioned Gateway client contract.
- Existing memory, human-explanation, service-worker, CSP, and no-persistent-secret boundaries remain unchanged.

---

### Task 1: Fail-Closed Capability Parity Policy

**Files:**
- Modify: `apps/axiom-one/app-policy.json`
- Modify: `mesh/src/check-axiom-one.mjs`
- Test: `mesh/test/axiom-one-capability-parity.test.mjs`

**Interfaces:**
- Consumes: existing `capabilities.list` Gateway route.
- Produces: `policy.capability_parity` with exact fields `status`, `capability_route`, `runnable_claim_statuses`, `principal_authority`, `discovery_grants_authority`, and `browser_mutation`.

- [x] **Step 1: Write the failing test**

```js
assert.deepEqual(policy.capability_parity, {
  status: 'experimental-read-only-projection',
  capability_route: 'capabilities.list',
  runnable_claim_statuses: ['implemented'],
  principal_authority: 'not-inferred-from-discovery',
  discovery_grants_authority: false,
  browser_mutation: false
});
```

- [x] **Step 2: Run the test in protected CI and verify RED**

Expected: FAIL because `policy.capability_parity` is absent before implementation.

- [x] **Step 3: Add the minimal policy and fail-closed validator**

The validator must use the existing exact-object style and reject any weakened value, including `discovery_grants_authority: true`, additional runnable statuses, or browser mutation.

- [ ] **Step 4: Run protected CI and verify GREEN**

Expected: the new test passes and the existing Clean Kernel verification remains green.

- [ ] **Step 5: Commit/retain the reviewed Task 1 revision**

Task 1 is complete only when protected CI proves the new contract and the pre-existing Axiom One checks both pass.

---

### Task 2: Pure Capability Projection

**Files:**
- Create: `apps/axiom-one/capability-parity.mjs`
- Create: `mesh/test/axiom-one-capability-projection.test.mjs`

**Interfaces:**
- Consumes: the decoded response from `capabilities.list` with `capabilities[]` entries containing `id`, `family`, `status`, `summary`, and evidence metadata.
- Produces: `projectCapabilityParity(response)` returning `{ source, authority, total, implemented, families, capabilities }` without mutating input.

- [ ] **Step 1: Write the failing projection tests**

```js
const result = projectCapabilityParity({
  capabilities: [
    { id: 'core.intent-loop', family: 'core', status: 'implemented', summary: 'Intent loop.' },
    { id: 'future.example', family: 'future', status: 'planned', summary: 'Not live.' }
  ]
});

assert.equal(result.source, 'capabilities.list');
assert.equal(result.authority, 'not-inferred-from-discovery');
assert.equal(result.total, 2);
assert.equal(result.implemented, 1);
assert.equal(result.capabilities[0].runnable_claim, true);
assert.equal(result.capabilities[0].authorized_to_principal, null);
assert.equal(result.capabilities[1].runnable_claim, false);
assert.equal(result.capabilities[1].authorized_to_principal, null);
```

Also assert that malformed/missing `capabilities` becomes an empty projection rather than creating claims.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test mesh/test/axiom-one-capability-projection.test.mjs`

Expected: FAIL because `/apps/axiom-one/capability-parity.mjs` does not yet exist.

- [ ] **Step 3: Implement the minimal pure projector**

```js
export function projectCapabilityParity(response) {
  const entries = Array.isArray(response?.capabilities) ? response.capabilities : [];
  const capabilities = entries.map(item => ({
    id: typeof item?.id === 'string' ? item.id : 'unknown',
    family: typeof item?.family === 'string' ? item.family : 'other',
    status: typeof item?.status === 'string' ? item.status : 'unknown',
    summary: typeof item?.summary === 'string' ? item.summary : '',
    runnable_claim: item?.status === 'implemented',
    authorized_to_principal: null
  }));
  const families = [...new Set(capabilities.map(item => item.family))].sort();
  return {
    source: 'capabilities.list',
    authority: 'not-inferred-from-discovery',
    total: capabilities.length,
    implemented: capabilities.filter(item => item.runnable_claim).length,
    families,
    capabilities
  };
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test mesh/test/axiom-one-capability-projection.test.mjs`

Expected: PASS.

- [ ] **Step 5: Run `npm run check` from `mesh/`**

Expected: PASS with no new dependency or generated-state drift.

---

### Task 3: Overview Capability Parity Surface

**Files:**
- Modify: `apps/axiom-one/app.mjs`
- Modify: `mesh/src/check-axiom-one.mjs`
- Test: `mesh/test/axiom-one-capability-projection.test.mjs`

**Interfaces:**
- Consumes: `projectCapabilityParity(capabilitiesResponse)` from Task 2.
- Produces: a read-only Overview section showing implementation claims by family and a visible authority disclaimer.

- [ ] **Step 1: Extend the test with presentation-safe invariants**

Assert the projector preserves the exact registry status, never emits `authorized_to_principal: true`, and treats every non-`implemented` status as `runnable_claim: false`.

- [ ] **Step 2: Run the focused test and verify RED for the new expectation**

Run: `node --test mesh/test/axiom-one-capability-projection.test.mjs`

Expected: FAIL until the projector handles the new case.

- [ ] **Step 3: Import the projector in `app.mjs` and use it in `renderOverview()`**

The Overview copy must state both of these truths:

```text
Implemented means the Mesh registry supports the capability; it does not mean this principal is authorized to execute it.
Authority is evaluated separately through the normal intent and policy path.
```

Render family and capability information with DOM construction helpers already used by Axiom One; do not introduce `innerHTML`, remote assets, persistent storage, or a new request route.

- [ ] **Step 4: Extend `check-axiom-one.mjs` asset markers**

Require the projector import and both authority-boundary phrases so a future UI edit cannot silently remove the distinction.

- [ ] **Step 5: Run the focused test, `npm run check`, and protected CI**

Expected: all pass.

---

## Completion Gate

Capability parity v0 is complete when Axiom One can show what the current Mesh claims to implement while the UI, policy, tests, and verifier all agree that discovery grants no authority. Social mutation, per-principal executable-operation discovery, consequentiality metadata, approval requirements, network-effect metadata, and receipt-type mapping remain separate reviewed tranches rather than being inferred from registry data.
