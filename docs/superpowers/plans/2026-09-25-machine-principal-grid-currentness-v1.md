# Machine Principal Grid Currentness v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fail-closed, Grid-backed, deny-only machine-principal lifecycle/currentness boundary that supports authorized attenuation/revocation and transactionally ordered logical effect release without creating a second authority store or a Sandbox-to-Grid network edge.

**Architecture:** The normalized `axiom-machine-principal.v1` loaded by Gateway remains the immutable root authority ceiling for a deployment generation. Grid owns the only mutable lifecycle head, replay state, and logical release records. Gateway resolves target machine roots for lifecycle intents; Hypervisor authorizes mutations and performs all Grid currentness/release calls; Sandbox receives a Grid-signed release receipt and verifies it before invoking a builtin.

**Tech Stack:** Node.js ESM, built-in `node:test`, `node:sqlite`, existing Ed25519 identities/signed service requests, existing Grid encrypted event/materialization layer, JSON Schema 2020-12 documents, zero new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-25-machine-principal-grid-currentness-v1-design.md`

## Global Constraints

- Start from current `main`; re-read `AGENTS.md`, `CONSTITUTION.md`, and the spec before implementation.
- Current planning baseline is migration version **10** and service-network policy **42 exact routes**. If either changed before execution, stop and reconcile this plan before coding.
- Preserve `Gateway -> Hypervisor -> Sandbox -> Grid` for ordinary execution.
- Do **not** add a Sandbox -> Grid network edge. Hypervisor performs currentness/release Grid calls and passes a Grid-signed release receipt to Sandbox.
- Do **not** mount or load the API bearer-token registry in Hypervisor, Sandbox, or Grid. Gateway remains the only service that loads it.
- The configured machine principal remains the root authority ceiling; mutable Grid state can only attenuate or terminate it.
- Currentness evidence/checkpoints/receipts are evidence, never authority roots.
- Machine principals cannot mutate lifecycle state.
- Delegation remains `allowed=false`, `max_depth=0`.
- `revoked`, `compromised`, and `expired` are terminal in v1.
- No Grid write transaction may span model work, network I/O, builtin execution, or response disclosure.
- Logical release is not proof of execution; execution is not disclosure; denial is not rollback.
- No new public Gateway route is required. Lifecycle mutation uses existing `POST /v1/intents`.
- No capability registry promotion, product claim, deployment enablement, or production promotion occurs in this plan.
- Every task follows RED -> GREEN -> refactor-only-if-needed, with a fresh exact-head protected CI gate before merging each reviewable stage.
- Every stage must preserve the existing deny-dominant policy, identity, capability, evidence, and service-network boundaries.

## Review Focus

1. **Root changes underneath retained lifecycle state:** execution and mutation must fail with `machine_currentness_root_mismatch`; no automatic migration.
2. **Attenuation that looks smaller but actually widens one dimension:** any newly added scope/action/purpose/destination/role, higher budget, later expiry, sponsor/runtime change, or delegation change must deny.
3. **Two concurrent mutations against one predecessor:** exactly one successor commits; the loser receives a stale-currentness conflict and cannot create a second event.
4. **Crash after durable mutation/release commit but before response:** exact replay recovers the committed record; a different replay cannot create another successor/release.
5. **Revocation between capability consumption and builtin invocation:** the stale attempt must fail at Grid logical release and the builtin invocation count must remain zero.

---

## Task 1: Pure authority attenuation and v1 contract surface

**Files:**
- Create: `mesh/src/lib/machine-principal-attenuation.mjs`
- Create: `mesh/src/lib/machine-principal-currentness.mjs`
- Create: `mesh/config/machine-principal-mutation-authorization-v1.schema.json`
- Create: `mesh/config/machine-principal-lifecycle-transition-v1.schema.json`
- Create: `mesh/config/machine-principal-currentness-projection-v1.schema.json`
- Create: `mesh/config/machine-effect-release-v1.schema.json`
- Create: `mesh/test/machine-principal-attenuation.test.mjs`
- Create: `mesh/test/machine-principal-currentness-contracts.test.mjs`
- Create: `mesh/test/machine-principal-currentness-schema.test.mjs`

**Interfaces:**
- Consumes: `normalizeMachinePrincipalDefinition(principal)` and `digestObject(value)`.
- Produces:
  - `machineAuthoritySnapshot(principal) -> normalized full authority object`
  - `assertMachineAuthorityAttenuation(predecessor, successor, { now }) -> normalized successor`
  - `machineAuthoritySnapshotDigest(snapshot) -> 64-char hex digest`
  - fixed schema constants for mutation authorization, lifecycle transition, currentness projection, and effect release
  - strict normalizers for those four contracts

- [ ] **Step 1: Write RED attenuation tests**

Create tests that prove same-principal narrowing and every widening denial:

```js
const predecessor = machineAuthoritySnapshot(machineFixture());

const narrowed = assertMachineAuthorityAttenuation(predecessor, {
  ...predecessor,
  scopes: ['intent:execute'],
  constraints: {
    ...predecessor.constraints,
    actions: ['system.echo'],
    purposes: ['test.conformance'],
    destinations: ['local'],
    budgets: {
      ...predecessor.constraints.budgets,
      max_requests_per_minute: 10,
      max_concurrent_requests: 1,
      max_execution_ms: 1_000,
      max_request_bytes: 32_768,
      max_response_bytes: 131_072
    }
  }
}, { now: new Date('2026-09-25T17:00:00.000Z') });

assert.equal(narrowed.id, predecessor.id);
assert.deepEqual(narrowed.constraints.actions, ['system.echo']);

for (const widen of [
  value => ({ ...value, scopes: [...value.scopes, 'audit:read'] }),
  value => ({ ...value, constraints: { ...value.constraints, actions: [...value.constraints.actions, 'system.hash'] } }),
  value => ({ ...value, constraints: { ...value.constraints, budgets: { ...value.constraints.budgets, max_execution_ms: value.constraints.budgets.max_execution_ms + 1 } } }),
  value => ({ ...value, sponsor: 'owner.other' }),
  value => ({ ...value, runtime: { ...value.runtime, id: 'runtime.other' } }),
  value => ({ ...value, constraints: { ...value.constraints, delegation: { allowed: true, max_depth: 1 } } })
]) {
  assert.throws(
    () => assertMachineAuthorityAttenuation(predecessor, widen(structuredClone(predecessor))),
    /attenuation|widen|sponsor|runtime|delegation/i
  );
}
```

Also cover: unchanged `narrow` denied, expiry shortening accepted, expiry extension denied, non-persistent -> persistent denied, persistent -> finite session allowed only when `maximumExpiry` is supplied by policy, ordering-independent set normalization, and unknown fields rejected.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
node --test mesh/test/machine-principal-attenuation.test.mjs
```

Expected: FAIL because the module/functions do not exist.

- [ ] **Step 3: Implement the pure attenuation module**

Implement exact exports:

```js
export function machineAuthoritySnapshot(principal) {
  const normalized = normalizeMachinePrincipalDefinition(principal);
  return structuredClone(normalized);
}

export function machineAuthoritySnapshotDigest(snapshot) {
  return digestObject(machineAuthoritySnapshot(snapshot));
}

export function assertMachineAuthorityAttenuation(
  predecessorInput,
  successorInput,
  { now = new Date(), maximumExpiry = null } = {}
) {
  const predecessor = machineAuthoritySnapshot(predecessorInput);
  const successor = normalizeMachinePrincipalDefinition(successorInput, { now });

  assertSame(predecessor.id, successor.id, 'principal id');
  assertSame(predecessor.type, successor.type, 'principal type');
  assertSame(predecessor.sponsor, successor.sponsor, 'sponsor');
  assertSame(predecessor.runtime.id, successor.runtime.id, 'runtime id');
  assertSame(predecessor.runtime.kind, successor.runtime.kind, 'runtime kind');
  assertSame(
    predecessor.runtime.software_digest ?? null,
    successor.runtime.software_digest ?? null,
    'runtime software digest'
  );
  assertSubset(successor.roles, predecessor.roles, 'roles');
  assertSubset(successor.scopes, predecessor.scopes, 'scopes');
  assertSubset(successor.constraints.actions, predecessor.constraints.actions, 'actions');
  assertSubset(successor.constraints.purposes, predecessor.constraints.purposes, 'purposes');
  assertSubset(successor.constraints.destinations, predecessor.constraints.destinations, 'destinations');
  assertBudgetsNotIncreased(predecessor.constraints.budgets, successor.constraints.budgets);
  assertLifetimeNotExtended(predecessor, successor, { maximumExpiry });
  if (successor.constraints.delegation.allowed !== false
      || successor.constraints.delegation.max_depth !== 0) {
    throw new ValidationError('Machine authority attenuation cannot enable delegation');
  }
  if (digestObject(predecessor) === digestObject(successor)) {
    throw new ValidationError('Machine authority narrow transition must strictly reduce authority');
  }
  return Object.freeze(successor);
}
```

Use explicit exact-key validation helpers; do not use truthy/falsy shortcuts for optional expiry.

- [ ] **Step 4: Write RED contract/schema tests**

Pin the fixed identifiers from the spec:

```js
assert.equal(MACHINE_MUTATION_AUTHORIZATION_SCHEMA,
  'axiom-machine-principal-mutation-authorization.v1');
assert.equal(MACHINE_LIFECYCLE_TRANSITION_SCHEMA,
  'axiom-machine-principal-lifecycle-transition.v1');
assert.equal(MACHINE_CURRENTNESS_PROJECTION_SCHEMA,
  'axiom-machine-principal-currentness-projection.v1');
assert.equal(MACHINE_EFFECT_RELEASE_SCHEMA,
  'axiom-machine-effect-release.v1');

assert.deepEqual(MACHINE_CURRENTNESS_EVENT_KINDS, [
  'machine.currentness.compromised',
  'machine.currentness.expired',
  'machine.currentness.initialized',
  'machine.currentness.narrowed',
  'machine.currentness.revoked'
]);
```

For each normalizer, add mutation tests that reject unknown fields, wrong schema, malformed digests, negative/zero sequence numbers, unsupported status, actor/target mismatch, and release records missing capability/attempt/currentness bindings.

- [ ] **Step 5: Implement strict contract normalizers and JSON schemas**

`machine-principal-currentness.mjs` must export:

```js
export const MACHINE_MUTATION_AUTHORIZATION_SCHEMA =
  'axiom-machine-principal-mutation-authorization.v1';
export const MACHINE_LIFECYCLE_TRANSITION_SCHEMA =
  'axiom-machine-principal-lifecycle-transition.v1';
export const MACHINE_CURRENTNESS_PROJECTION_SCHEMA =
  'axiom-machine-principal-currentness-projection.v1';
export const MACHINE_EFFECT_RELEASE_SCHEMA =
  'axiom-machine-effect-release.v1';

export function normalizeMachineMutationAuthorization(value) { /* exact fields */ }
export function normalizeMachineLifecycleTransition(value) { /* exact fields */ }
export function normalizeMachineCurrentnessProjection(value) { /* exact fields */ }
export function normalizeMachineEffectRelease(value) { /* exact fields */ }
```

The JSON Schemas must mirror the JS exact-field boundary and set `additionalProperties:false` at every object layer.

- [ ] **Step 6: Run focused GREEN tests**

Run:

```bash
node --test   mesh/test/machine-principal-attenuation.test.mjs   mesh/test/machine-principal-currentness-contracts.test.mjs   mesh/test/machine-principal-currentness-schema.test.mjs
```

Expected: PASS with zero skipped/cancelled/todo tests.

- [ ] **Step 7: Commit Task 1**

```bash
git add   mesh/src/lib/machine-principal-attenuation.mjs   mesh/src/lib/machine-principal-currentness.mjs   mesh/config/machine-principal-*-v1.schema.json   mesh/config/machine-effect-release-v1.schema.json   mesh/test/machine-principal-attenuation.test.mjs   mesh/test/machine-principal-currentness-contracts.test.mjs   mesh/test/machine-principal-currentness-schema.test.mjs
git commit -m "feat(auth): add machine currentness v1 contracts"
```

---

## Task 2: Grid lifecycle persistence, replay, and currentness projection

**Files:**
- Modify: `mesh/src/grid/migrations.mjs`
- Modify: `mesh/src/grid/_store-core.mjs`
- Create: `mesh/test/machine-currentness-grid-store.test.mjs`
- Modify: `mesh/test/migrations.test.mjs`

**Interfaces:**
- Consumes: Task 1 normalizers/attenuation.
- Produces:
  - migration **11** `machine-principal-grid-currentness-v1`
  - `GridStore.getMachineCurrentness(principalId)`
  - `GridStore.commitMachineCurrentnessMutation({ traceId, actor, authorization, transition })`
  - durable exact replay through `machine_principal_mutation_commands`

- [ ] **Step 1: Assert the migration baseline before editing**

Run:

```bash
node -e "import('./mesh/src/grid/migrations.mjs').then(() => console.log('load-ok'))"
grep -n "version: 10" mesh/src/grid/migrations.mjs
```

Expected: module loads and version 10 is the latest migration. If not, stop and reconcile the migration number before continuing.

- [ ] **Step 2: Write RED migration/store tests**

Create a fresh GridStore and assert the new tables:

```js
const tables = new Set(
  store.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    .map(row => row.name)
);
assert.ok(tables.has('machine_principal_lifecycle_heads'));
assert.ok(tables.has('machine_principal_mutation_commands'));
assert.ok(tables.has('machine_effect_releases'));
```

Write RED behavior for:
- explicit initialization succeeds once;
- missing principal returns `machine_currentness_not_found`;
- root mismatch rejects mutation;
- exact command replay returns the same successor event/hash;
- same command id with different digest rejects;
- stale predecessor rejects;
- terminal transition cannot reactivate;
- restart reconstructs the same head;
- a deliberately invalid successor causes the entire event/materialization/replay write to roll back.

- [ ] **Step 3: Run RED store tests**

```bash
node --test mesh/test/machine-currentness-grid-store.test.mjs
```

Expected: FAIL because migration 11 and GridStore methods are absent.

- [ ] **Step 4: Add migration 11**

Add one SQL block:

```sql
CREATE TABLE IF NOT EXISTS machine_principal_lifecycle_heads (
  principal_id TEXT PRIMARY KEY,
  principal_type TEXT NOT NULL,
  root_authority_digest TEXT NOT NULL,
  status TEXT NOT NULL,
  lifecycle_seq INTEGER NOT NULL,
  lifecycle_head_event_id TEXT NOT NULL,
  lifecycle_head_event_hash TEXT NOT NULL,
  lifecycle_head_digest TEXT NOT NULL,
  effective_authority_digest TEXT,
  effective_authority_json TEXT,
  last_command_id TEXT NOT NULL,
  last_command_digest TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS machine_principal_mutation_commands (
  command_id TEXT PRIMARY KEY,
  command_digest TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  predecessor_seq INTEGER,
  successor_seq INTEGER NOT NULL,
  result_event_id TEXT NOT NULL,
  result_event_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS machine_effect_releases (
  release_id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  intent_id TEXT NOT NULL,
  plan_digest TEXT NOT NULL,
  action TEXT NOT NULL,
  destination TEXT NOT NULL,
  root_authority_digest TEXT NOT NULL,
  lifecycle_seq INTEGER NOT NULL,
  lifecycle_head_digest TEXT NOT NULL,
  effective_authority_digest TEXT NOT NULL,
  consumption_receipt_digest TEXT NOT NULL,
  release_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(capability_id, attempt_id)
) STRICT;
```

Add indexes on `principal_id, lifecycle_seq` and `principal_id, created_at` where useful.

Add protected-column mappings for:
- `machine_principal_lifecycle_heads.effective_authority_json`
- `machine_principal_mutation_commands.result_json`

Do not store bearer tokens or raw capability tokens in these tables.

- [ ] **Step 5: Refactor event append without changing semantics**

Extract the existing body of `appendEvents()` into an internal method that assumes an active transaction:

```js
appendEvents({ traceId, actor, events }) {
  try {
    return this.transaction(() => this.appendEventsInTransaction({
      traceId, actor, events
    }));
  } catch (error) {
    throw normalizeAppendConflict(error);
  }
}

appendEventsInTransaction({ traceId, actor, events }) {
  // Existing append/materialize/head-update body, unchanged in order.
}
```

Existing append tests must remain byte-for-byte behavior compatible.

- [ ] **Step 6: Implement lifecycle materialization and atomic mutation**

Inside `commitMachineCurrentnessMutation()`:

```js
return this.transaction(() => {
  const command = normalizeMachineMutationAuthorization(authorization);
  const next = normalizeMachineLifecycleTransition(transition);

  const replay = this.readMachineMutationCommand(command.command_id);
  if (replay) {
    if (replay.command_digest !== command.command_digest) {
      throw new AxiomError('machine_currentness_command_conflict',
        'Machine lifecycle command id was already used for different bytes', 409);
    }
    return replay.result;
  }

  const current = this.readMachineLifecycleHead(next.principal_id);
  verifyExpectedPredecessor(current, command, next);
  verifyRootAndTransition(current, command, next);

  const [event] = this.appendEventsInTransaction({
    traceId,
    actor,
    events: [projectLifecycleEvent(next, command)]
  });

  const result = this.getMachineCurrentness(next.principal_id);
  this.insertMachineMutationCommand(command, event, result);
  return result;
});
```

`applyMaterializedEvent()` handles only the five fixed `machine.currentness.*` events and enforces sequence/predecessor/root/status invariants again at materialization time.

- [ ] **Step 7: Prove one-winner concurrency**

Use two independent store connections against the same SQLite file and the same predecessor. Submit two different commands. Assert:

```js
assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
assert.equal(results.filter(x => x.status === 'rejected').length, 1);
assert.match(results.find(x => x.status === 'rejected').reason.code,
  /machine_currentness_stale/);
assert.equal(store.getMachineCurrentness(PRINCIPAL).lifecycle_seq, 2);
```

- [ ] **Step 8: Run Task 2 GREEN tests plus existing Grid tests**

```bash
node --test   mesh/test/machine-currentness-grid-store.test.mjs   mesh/test/migrations.test.mjs   mesh/test/grid*.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

```bash
git add mesh/src/grid/migrations.mjs mesh/src/grid/_store-core.mjs   mesh/test/machine-currentness-grid-store.test.mjs mesh/test/migrations.test.mjs
git commit -m "feat(grid): persist machine currentness lifecycle"
```

---

## Task 3: Internal Grid currentness/mutation API and network-policy bindings

**Files:**
- Create: `mesh/src/grid/machine-currentness-routes.mjs`
- Modify: `mesh/src/grid/server.mjs`
- Modify: `mesh/config/service-network-policy.json`
- Create: `mesh/test/machine-currentness-grid-routes.test.mjs`
- Modify: `mesh/test/service-network-policy.test.mjs`
- Modify: `mesh/src/check-service-network-policy.mjs`

**Interfaces:**
- Consumes: Task 2 store methods.
- Produces:
  - `GET /internal/v1/machine-currentness/:principal_id`
  - `POST /internal/v1/machine-currentness/mutate`
  - Hypervisor-only internal access for both routes
  - service-network policy count 42 -> **44** at this stage

- [ ] **Step 1: Write RED route tests**

Use signed service requests and prove:

```js
const read = await signedFetch(
  hypervisor,
  'grid',
  `${gridUrl}/internal/v1/machine-currentness/${encodeURIComponent(PRINCIPAL)}`,
  { traceId }
);
assert.equal(read.schema, 'axiom-machine-principal-currentness-projection.v1');

await assert.rejects(
  () => signedFetch(gateway, 'grid',
    `${gridUrl}/internal/v1/machine-currentness/${encodeURIComponent(PRINCIPAL)}`,
    { traceId: 'trace_wrong_caller' }),
  error => error.status === 403
);
```

For mutation, prove only authenticated Hypervisor may call the route and that caller/body actor substitution denies.

- [ ] **Step 2: Add the route module**

Export:

```js
export function registerMachineCurrentnessGridRoutes(router, {
  store,
  hypervisorPublicKey
}) {
  router.add('GET', '/internal/v1/machine-currentness/:principal_id', ...);
  router.add('POST', '/internal/v1/machine-currentness/mutate', ...);
}
```

The mutation route:
1. requires `principal.service === 'hypervisor'`;
2. parses exact `authorization` and `transition`;
3. verifies the inner Hypervisor authorization signature against `hypervisorPublicKey`;
4. verifies actor/target/root/predecessor/transition digest bindings;
5. calls only `store.commitMachineCurrentnessMutation()`.

- [ ] **Step 3: Register routes in Grid**

In `createGridService()`, load the trusted Hypervisor public key once and call `registerMachineCurrentnessGridRoutes()`.

Do not add these semantics to generic `/internal/v1/commit`; keep caller-supplied lifecycle events forbidden from bypassing the specialized route.

Add a guard to generic commit:

```js
if (input.events.some(event => String(event?.kind ?? '').startsWith('machine.currentness.'))) {
  throw new ValidationError(
    'Caller-supplied machine.currentness events are forbidden; use the specialized mutation route'
  );
}
```

- [ ] **Step 4: Extend the exact network policy**

Before editing, assert the validator reports 42 routes.

Add exactly two Hypervisor -> Grid routes:

```json
{"method":"GET","path":"/internal/v1/machine-currentness/:principal_id"}
{"method":"POST","path":"/internal/v1/machine-currentness/mutate"}
```

Expected route count after Task 3: **44**.

Do not add Gateway->Grid or Sandbox->Grid routes.

- [ ] **Step 5: Run focused route/network tests**

```bash
node --test   mesh/test/machine-currentness-grid-routes.test.mjs   mesh/test/service-network-policy.test.mjs
node mesh/src/check-service-network-policy.mjs
```

Expected: PASS and exact route count 44.

- [ ] **Step 6: Commit Task 3**

```bash
git add   mesh/src/grid/machine-currentness-routes.mjs   mesh/src/grid/server.mjs   mesh/config/service-network-policy.json   mesh/src/check-service-network-policy.mjs   mesh/test/machine-currentness-grid-routes.test.mjs   mesh/test/service-network-policy.test.mjs
git commit -m "feat(grid): expose authenticated machine currentness routes"
```

---

## Task 4: Human-authorized lifecycle intents without widening credential access

**Files:**
- Create: `mesh/src/lib/machine-principal-mutation-authorization.mjs`
- Modify: `mesh/src/gateway/server.mjs`
- Modify: `mesh/src/hypervisor/server.mjs`
- Modify: `mesh/config/policy.json`
- Create: `mesh/test/machine-currentness-mutation-authorization.test.mjs`
- Create: `mesh/test/machine-currentness-mutation-e2e.test.mjs`

**Interfaces:**
- Consumes: existing `POST /v1/intents`, Gateway-loaded principal registry, Task 3 Grid routes.
- Produces:
  - `buildMachineMutationAuthorization(identity, {...}) -> { statement, signature, digest }`
  - two policy actions:
    - `machine.principal.lifecycle.initialize`
    - `machine.principal.lifecycle.mutate`
  - Gateway-injected `input.resolved_machine_root` for those actions only
  - no new public route

- [ ] **Step 1: Write RED authorization tests**

Pin exact signed statement fields:

```js
const signed = buildMachineMutationAuthorization(hypervisorIdentity, {
  actor: humanPrincipal,
  target_root: rootMachine,
  currentness,
  transition_kind: 'revoke',
  reason: 'incident-response',
  policy: {
    id: 'policy.active',
    version: decision.policy_version,
    digest: decision.policy_digest
  },
  command_id: 'machine_cmd_001',
  issued_at: NOW,
  effective_at: NOW,
  expires_at: LATER
});

assert.equal(signed.statement.schema,
  'axiom-machine-principal-mutation-authorization.v1');
assert.equal(signed.statement.actor_id, humanPrincipal.id);
assert.equal(signed.statement.target_principal_id, rootMachine.id);
assert.equal(signed.statement.root_authority_digest, rootMachine.authority_digest);
assert.equal(signed.statement.policy_digest, decision.policy_digest);
assert.ok(verifyObjectSignature(
  signed.statement, signed.signature, hypervisorIdentity.publicKey
));
```

Mutation tests must show changing actor, target, predecessor head, successor digest, transition kind, policy digest, command id, or expiry breaks verification/binding.

- [ ] **Step 2: Implement authorization builder/verifier**

`machine-principal-mutation-authorization.mjs` must export:

```js
export function buildMachineMutationAuthorization(identity, input) { ... }
export function verifyMachineMutationAuthorization(value, {
  hypervisorPublicKey,
  now = new Date()
}) { ... }
```

The statement digest is `digestObject(statement)`; `command_digest` is derived from the exact normalized mutation command and cannot be caller-supplied independently.

- [ ] **Step 3: Add policy actions**

Add:

```json
"machine.principal.lifecycle.initialize": {
  "decision": "allow",
  "risk": "high",
  "required_scopes": ["machine:write"],
  "required_confirmations": 1,
  "required_confirmation_values": ["confirm:machine.principal.lifecycle.initialize"],
  "requires_independent_approval": true,
  "tool": "builtin.validate-mutation"
},
"machine.principal.lifecycle.mutate": {
  "decision": "allow",
  "risk": "high",
  "required_scopes": ["machine:write"],
  "required_confirmations": 1,
  "required_confirmation_values": ["confirm:machine.principal.lifecycle.mutate"],
  "requires_independent_approval": true,
  "tool": "builtin.validate-mutation"
}
```

Do not grant `machine:write` to machine principals.

- [ ] **Step 4: Resolve target root only in Gateway**

Build an id index once after `loadApiPrincipals(config)`:

```js
const principalsById = new Map(
  [...principals.values()].map(principal => [principal.id, principal])
);
```

For the two lifecycle actions:
- require authenticated caller type `human`;
- require `machine:write` or human administrator wildcard before resolving a target;
- reject public `input.resolved_machine_root`;
- resolve `input.target_principal_id` from `principalsById`;
- require target schema `axiom-machine-principal.v1`;
- inject `resolved_machine_root: structuredClone(target)` into the internal intent input.

Do not send bearer token material inward.

- [ ] **Step 5: Add a specialized Hypervisor lifecycle branch**

After normal intent normalization and policy evaluation, but before plan/capability issuance:

```js
if (isMachineLifecycleAction(intent.action)) {
  return handleMachineLifecycleIntent({
    intent,
    traceId,
    decision,
    policy,
    identity,
    gridGet,
    commit,
    gridUrl: config.urls.grid
  });
}
```

The handler must:
1. require human actor;
2. preserve normal `intent.accepted` / denial evidence;
3. enforce normal confirmation and independent-approval semantics;
4. load current Grid currentness for mutate, or require absence for initialize;
5. for `narrow`, call `assertMachineAuthorityAttenuation(currentEffective, successor)`;
6. build/sign the exact mutation authorization;
7. call `POST /internal/v1/machine-currentness/mutate`;
8. commit `intent.completed` with a minimized lifecycle result projection;
9. never issue a Sandbox capability for the lifecycle action.

- [ ] **Step 6: Write and run real-stack mutation tests**

Use Gateway public `/v1/intents` and prove:
- machine caller denied;
- human without `machine:write` denied before target enumeration;
- initialization requires exact target root;
- target root is Gateway-resolved, not caller-overridable;
- independent approval required and one-use;
- narrow truly reduces authority;
- widened budget/destination/action denies;
- revoke terminal;
- exact idempotent replay does not create a second lifecycle transition;
- root-registry digest mismatch denies.

Run:

```bash
node --test   mesh/test/machine-currentness-mutation-authorization.test.mjs   mesh/test/machine-currentness-mutation-e2e.test.mjs
```

- [ ] **Step 7: Commit Task 4**

```bash
git add   mesh/src/lib/machine-principal-mutation-authorization.mjs   mesh/src/gateway/server.mjs   mesh/src/hypervisor/server.mjs   mesh/config/policy.json   mesh/test/machine-currentness-mutation-authorization.test.mjs   mesh/test/machine-currentness-mutation-e2e.test.mjs
git commit -m "feat(auth): authorize machine lifecycle mutations"
```

---

## Task 5: Bind current lifecycle state into machine capability issuance

**Files:**
- Modify: `mesh/src/hypervisor/server.mjs`
- Modify: `mesh/src/lib/plan.mjs`
- Modify: `mesh/src/lib/invocation-envelope.mjs`
- Modify: `mesh/src/lib/machine-receipt.mjs`
- Create: `mesh/test/machine-currentness-issuance.test.mjs`
- Modify: `mesh/test/machine-principal-e2e.test.mjs`
- Modify: `mesh/test/machine-receipt.test.mjs`

**Interfaces:**
- Consumes: Grid currentness projection.
- Produces:
  - capability claims:
    - `root_authority_digest`
    - `effective_authority_digest`
    - `currentness_seq`
    - `currentness_head_digest`
  - plan/invocation evidence with the same exact binding

- [ ] **Step 1: Write RED issuance tests**

For an initialized machine principal:

```js
assert.equal(claims.root_authority_digest, root.authority_digest);
assert.equal(claims.effective_authority_digest, current.effective_authority_digest);
assert.equal(claims.currentness_seq, current.lifecycle_seq);
assert.equal(claims.currentness_head_digest, current.lifecycle_head_digest);
```

After a narrow transition, submit an action removed by the effective authority and assert `machine_action_denied`.

After revoke, assert `machine_currentness_terminal`.

With no lifecycle row after enforcement is enabled, assert `machine_currentness_unavailable`.

With mismatched root digest, assert `machine_currentness_root_mismatch`.

- [ ] **Step 2: Resolve currentness before machine evaluation**

In Hypervisor, for machine principals only:

```js
const currentness = await gridGet(
  `/internal/v1/machine-currentness/${encodeURIComponent(intent.principal.id)}`,
  traceId
);
const effectivePrincipal = resolveEffectiveMachinePrincipal(
  intent.principal,
  currentness
);
```

`resolveEffectiveMachinePrincipal()` belongs in Task 1's currentness module and must:
- require root digest equality;
- deny terminal state;
- normalize protected effective authority;
- prove it remains an attenuation of the current root;
- return both `effective_principal` and immutable `currentness_binding`.

Evaluate machine action/purpose/destination/budget against `effective_principal`, not the root.

- [ ] **Step 3: Bind currentness through plan and capability**

Extend plan provenance only for machine principals:

```js
machine_currentness: {
  root_authority_digest,
  effective_authority_digest,
  lifecycle_seq,
  lifecycle_head_digest
}
```

Add the same four fields to capability claims.

Do not replace the existing `authority_digest` root binding; keep backward evidence explicit by renaming only if all existing receipt/intent tests are updated atomically. Preferred v1 behavior: retain `authority_digest` as root and add `effective_authority_digest`.

- [ ] **Step 4: Bind accepted/terminal evidence**

Add `machine_currentness` to `intent.accepted` evidence and terminal result evidence.

Update machine receipt verification so it proves:
- accepted root digest == terminal root digest;
- accepted effective digest == terminal effective digest;
- accepted lifecycle seq/head == terminal lifecycle seq/head used for capability issuance.

Receipt semantics remain evidence of recorded AXIOM state, not external truth.

- [ ] **Step 5: Run issuance/evidence tests**

```bash
node --test   mesh/test/machine-currentness-issuance.test.mjs   mesh/test/machine-principal-e2e.test.mjs   mesh/test/machine-receipt.test.mjs   mesh/test/machine-receipt-e2e.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add   mesh/src/hypervisor/server.mjs   mesh/src/lib/plan.mjs   mesh/src/lib/invocation-envelope.mjs   mesh/src/lib/machine-receipt.mjs   mesh/test/machine-currentness-issuance.test.mjs   mesh/test/machine-principal-e2e.test.mjs   mesh/test/machine-receipt.test.mjs
git commit -m "feat(auth): bind machine grants to current lifecycle"
```

---

## Task 6: Transactionally ordered logical effect release

**Files:**
- Create: `mesh/src/grid/machine-effect-release-route.mjs`
- Create: `mesh/src/lib/machine-effect-release.mjs`
- Modify: `mesh/src/grid/server.mjs`
- Modify: `mesh/src/grid/_store-core.mjs`
- Modify: `mesh/config/service-network-policy.json`
- Modify: `mesh/src/check-service-network-policy.mjs`
- Modify: `mesh/src/hypervisor/server.mjs`
- Modify: `mesh/src/sandbox/server.mjs`
- Create: `mesh/test/machine-effect-release.test.mjs`
- Create: `mesh/test/machine-effect-release-route.test.mjs`

**Interfaces:**
- Consumes: currentness-bound capability claims, durable capability consumption event/receipt.
- Produces:
  - `POST /internal/v1/machine-effect/release`
  - `machine.effect.released`
  - `machine_effect_releases`
  - Grid-signed `axiom-machine-effect-release.v1` receipt
  - service-network policy count 44 -> **45**

- [ ] **Step 1: Write RED release tests**

Build a consumed capability bound to current lifecycle and assert:

```js
const released = store.commitMachineEffectRelease({
  traceId,
  actor: PRINCIPAL,
  capability_claims: claims,
  attempt_id: ATTEMPT,
  consumption_receipt_digest: CONSUMPTION_DIGEST
});

assert.equal(released.statement.schema, 'axiom-machine-effect-release.v1');
assert.equal(released.statement.capability_id, claims.jti);
assert.equal(released.statement.lifecycle_seq, claims.currentness_seq);
assert.equal(released.statement.lifecycle_head_digest, claims.currentness_head_digest);
```

Then advance the same principal lifecycle and assert the old capability release fails with `machine_currentness_stale`.

Mutate an unrelated principal and assert the release still succeeds.

- [ ] **Step 2: Implement the atomic store method**

`commitMachineEffectRelease()` runs one Grid transaction:

```js
return this.transaction(() => {
  const current = this.readMachineLifecycleHead(claims.subject);
  assertCurrentnessMatchesCapability(current, claims);
  assertCapabilityConsumptionExists(
    claims.jti,
    consumptionReceiptDigest
  );

  const release = normalizeMachineEffectRelease(buildReleaseStatement(...));
  const existing = this.readMachineEffectRelease(release.release_id);
  if (existing) {
    if (existing.release_digest !== digestObject(release)) {
      throw new AxiomError('machine_effect_release_conflict',
        'Effect release id was already used for different bytes', 409);
    }
    return existing;
  }

  const [event] = this.appendEventsInTransaction({
    traceId,
    actor,
    events: [projectMachineEffectReleasedEvent(release)]
  });
  this.insertMachineEffectRelease(event, release);
  return { event, release };
});
```

The current lifecycle **must equal** the capability-bound lifecycle sequence/head/effective authority digest. Any relevant mutation after issuance makes the capability stale.

- [ ] **Step 3: Implement the Hypervisor-only Grid route**

The route:
- authenticates Hypervisor;
- verifies the supplied capability using the trusted Hypervisor public key;
- rejects non-machine capabilities;
- verifies exact actor/subject/action/destination/plan/currentness claims;
- verifies the durable consumption receipt digest matches the existing deterministic `capability.consumed` event;
- commits release;
- signs the release statement with Grid identity.

- [ ] **Step 4: Extend service-network policy**

Add exactly:

```json
{"method":"POST","path":"/internal/v1/machine-effect/release"}
```

Expected route count after Task 6: **45**.

No Sandbox->Grid route is added.

- [ ] **Step 5: Hypervisor orders release after durable consumption and before Sandbox execution**

After capability consumption is verified:

```js
const release = await signedFetch(
  identity,
  'grid',
  `${config.urls.grid}/internal/v1/machine-effect/release`,
  {
    method: 'POST',
    traceId,
    body: {
      actor: intent.principal.id,
      capability,
      attempt_id: executionEpoch,
      consumption_receipt_digest: consumption.receipt_digest
    }
  }
);
```

Pass `release_receipt` into the existing Sandbox execute request.

Do not perform the release before durable capability consumption.

- [ ] **Step 6: Sandbox verifies release receipt before invoking builtin**

Add `verifyMachineEffectReleaseReceipt()` in `machine-effect-release.mjs`.

Immediately before `executeSandboxBuiltin()`:

```js
const release = verifyMachineEffectReleaseReceipt(input.release_receipt, {
  gridPublicKey: gridKey,
  claims,
  intent,
  plan,
  consumptionReceiptDigest: consumption.receipt_digest,
  attemptId: executionEpoch
});
```

Reject missing/invalid/mismatched release with `machine_effect_release_required` or `machine_effect_release_mismatch`.

The receipt is not reusable for another capability, intent, plan, destination, execution epoch, or attempt.

- [ ] **Step 7: Run focused release tests**

```bash
node --test   mesh/test/machine-effect-release.test.mjs   mesh/test/machine-effect-release-route.test.mjs   mesh/test/capability-consumption.test.mjs
node mesh/src/check-service-network-policy.mjs
```

Expected: PASS and service-network route count 45.

- [ ] **Step 8: Commit Task 6**

```bash
git add   mesh/src/grid/machine-effect-release-route.mjs   mesh/src/lib/machine-effect-release.mjs   mesh/src/grid/server.mjs   mesh/src/grid/_store-core.mjs   mesh/config/service-network-policy.json   mesh/src/check-service-network-policy.mjs   mesh/src/hypervisor/server.mjs   mesh/src/sandbox/server.mjs   mesh/test/machine-effect-release.test.mjs   mesh/test/machine-effect-release-route.test.mjs
git commit -m "feat(auth): order machine effect release against currentness"
```

---

## Task 7: Deterministic revoke/narrow race, crash recovery, and no-builtin-on-deny proof

**Files:**
- Create: `mesh/test/machine-currentness-effect-race-e2e.test.mjs`
- Create: `mesh/test/machine-currentness-recovery.test.mjs`
- Modify: `mesh/src/hypervisor/server.mjs` only to add a test-only injected barrier hook if the existing service-construction seam cannot provide one without production branching
- Modify: `mesh/test/machine-principal-e2e.test.mjs`

**Interfaces:**
- Consumes: Tasks 4-6.
- Produces: deterministic #1445 evidence; no production feature beyond already implemented boundaries.

- [ ] **Step 1: Add a test-only barrier seam**

Prefer dependency injection at service construction:

```js
createHypervisorService(config, {
  beforeMachineEffectRelease = async () => {}
})
```

Default production behavior remains a no-op.

Do not add environment-variable or public-request hooks.

- [ ] **Step 2: Write the deterministic revoke race**

The test sequence is exact:

```js
const reached = deferred();
const resume = deferred();
const invocationCounter = { value: 0 };

const stack = await startDevelopmentStack(overrides, {
  hypervisor: {
    beforeMachineEffectRelease: async () => {
      reached.resolve();
      await resume.promise;
    }
  },
  sandbox: {
    executeBuiltin: args => {
      invocationCounter.value += 1;
      return executeBuiltin(args);
    }
  }
});

const pending = submitMachineIntent();
await reached.promise;

await submitHumanLifecycleMutation({
  transition: 'revoke',
  target_principal_id: MACHINE_ID
});

resume.resolve();

await assert.rejects(pending,
  error => error.code === 'machine_currentness_stale'
    || error.code === 'machine_currentness_terminal');
assert.equal(invocationCounter.value, 0);
```

Do the same for `narrow` that removes the pending action.

- [ ] **Step 3: Add positive ordering controls**

Prove:
- unchanged currentness permits exactly one release/invocation;
- mutation of another principal does not block;
- release committed first remains valid historical authorization evidence even if revocation commits immediately afterward;
- the same release receipt cannot execute twice;
- a new grant after revocation does not revive an old attempt.

- [ ] **Step 4: Add crash/replay tests**

Test:
- mutation committed, response lost -> exact command replay returns same successor;
- release committed, response lost -> exact release replay returns same release;
- conflicting replay bytes -> 409;
- restart between commit and replay preserves the same result;
- no code path translates an uncertain release into automatic second builtin execution.

- [ ] **Step 5: Run race/recovery tests repeatedly**

```bash
for i in 1 2 3 4 5; do
  node --test     mesh/test/machine-currentness-effect-race-e2e.test.mjs     mesh/test/machine-currentness-recovery.test.mjs || exit 1
done
```

Expected: five consecutive green runs.

- [ ] **Step 6: Commit Task 7**

```bash
git add   mesh/test/machine-currentness-effect-race-e2e.test.mjs   mesh/test/machine-currentness-recovery.test.mjs   mesh/test/machine-principal-e2e.test.mjs   mesh/src/hypervisor/server.mjs
git commit -m "test(auth): prove machine currentness effect race"
```

---

## Task 8: Documentation, release truth, and protected verification

**Files:**
- Modify: `docs/security/CURRENT-BUILD-THREAT-MODEL.md`
- Modify: `docs/rebuild/REQUIREMENTS.md`
- Modify: `docs/rebuild/AGENT-INTEROPERABILITY-CAPABILITY-MAP.md`
- Modify: `docs/MASTER-TODO-AGENT-INTEROPERABILITY.md`
- Modify: `docs/PRODUCTION-READINESS-TRACKER.md`
- Modify: `docs/PROJECT-STATUS-2026.md`
- Modify: `docs/PRODUCTION-GRADE.md`
- Modify: `mesh/README.md`
- Modify: `docs/releases/0.12.0-dev.3.md`
- Modify: `docs/operations/EXPLICIT-SERVICE-NETWORK-POLICY.md`
- Modify: `mesh/src/check-docs.mjs`
- Test: existing documentation/release/security suites

**Interfaces:**
- Consumes: completed currentness implementation and exact measured route/migration counts.
- Produces: source-grounded claims only; no capability promotion.

- [ ] **Step 1: Update threat model with implemented boundary**

Document:
- static root registry vs mutable Grid lifecycle;
- root mismatch fail-closed;
- attenuation-only mutations;
- terminal lifecycle states;
- Hypervisor->Grid logical release;
- no Sandbox->Grid edge;
- release/execution/disclosure distinction;
- residual host/root/clock/credential risks.

- [ ] **Step 2: Add normative requirements**

Add exact requirements covering:
- configured root as authority ceiling;
- Grid as sole mutable lifecycle authority source;
- true attenuation proof;
- one-winner competing successor;
- exact currentness-bound capability issuance;
- atomic logical effect release;
- no currentness-evidence authority;
- crash/replay uncertainty semantics.

- [ ] **Step 3: Update current-state documents**

Each listed document must either receive a source-grounded text update or the PR description must explicitly state why its current wording remains accurate.

Do **not** mark the capability registry as newly implemented unless a separate promotion decision explicitly changes it.

- [ ] **Step 4: Update network-policy documentation from measured validator output**

On this plan's baseline, the count changes 42 -> 45. Run the validator and use its actual count rather than hand-editing unsupported numbers.

```bash
node mesh/src/check-service-network-policy.mjs
```

Then update every computed-count claim that `check-docs.mjs` requires.

- [ ] **Step 5: Register new schemas/tests/docs only where the canonical boundary requires it**

Run:

```bash
npm --prefix mesh run docs:check
```

If the canonical boundary reports a new Markdown/schema file as unexpected, add only the exact approved path plus stable required-content markers. Do not broaden the checker to accept arbitrary files.

- [ ] **Step 6: Run the focused security suite**

```bash
node --test   mesh/test/machine-principal*.test.mjs   mesh/test/machine-currentness*.test.mjs   mesh/test/machine-effect-release*.test.mjs   mesh/test/capability-consumption.test.mjs   mesh/test/service-network-policy.test.mjs   mesh/test/machine-receipt*.test.mjs
```

Expected: PASS, zero skipped/cancelled/todo for the new currentness/release tests.

- [ ] **Step 7: Run the full repository verification**

Use the repository-pinned runtime and commands:

```bash
npm ci --ignore-scripts
npm --prefix mesh ci --ignore-scripts
npm --prefix mesh run docs:check
npm --prefix mesh run verify
```

Expected: all commands exit 0.

- [ ] **Step 8: Run platform/protected CI on the exact final head**

Required GitHub checks:
- Clean Kernel `verify`
- `documentation-maintenance`
- `container`
- `compatibility-node-22`
- Windows
- macOS ARM
- macOS Intel
- CodeQL Actions
- CodeQL Rust
- CodeQL JavaScript/TypeScript

Do not inherit a parent/head's green run after any commit or merge refresh.

- [ ] **Step 9: Update #1443, #1445, and #1840 with exact evidence**

Record:
- exact head SHA;
- migration number;
- exact service-network route count;
- focused test counts;
- protected workflow run IDs/results;
- whether independent review has occurred;
- explicit non-claims around production promotion and #1840 disclosure.

- [ ] **Step 10: Commit documentation/release reconciliation**

```bash
git add   docs/security/CURRENT-BUILD-THREAT-MODEL.md   docs/rebuild/REQUIREMENTS.md   docs/rebuild/AGENT-INTEROPERABILITY-CAPABILITY-MAP.md   docs/MASTER-TODO-AGENT-INTEROPERABILITY.md   docs/PRODUCTION-READINESS-TRACKER.md   docs/PROJECT-STATUS-2026.md   docs/PRODUCTION-GRADE.md   mesh/README.md   docs/releases/0.12.0-dev.3.md   docs/operations/EXPLICIT-SERVICE-NETWORK-POLICY.md   mesh/src/check-docs.mjs
git commit -m "docs(auth): reconcile machine currentness runtime boundary"
```

---

## Plan self-review results

### Spec coverage

- Static root authority ceiling: Tasks 1, 4, 5.
- Grid-only mutable lifecycle authority: Tasks 2, 3.
- True attenuation proof: Task 1.
- Human-authorized mutation path: Task 4.
- Durable replay/idempotency and competing successors: Task 2.
- Currentness read projection: Tasks 2-3.
- Capability issuance binding: Task 5.
- Transactionally ordered logical release: Task 6.
- Deterministic revoke/narrow race: Task 7.
- Crash/uncertainty semantics: Tasks 2, 6, 7.
- #1840 future disclosure separation: Global constraints and Task 8 documentation.
- Documentation/promotion boundaries: Task 8.

No spec requirement is intentionally left without an implementation or verification task.

### Placeholder scan

The plan contains no TBD/FIXME/placeholder implementation instructions. Every created interface is named above before later tasks consume it.

### Type/interface consistency

- `currentness_seq` / `currentness_head_digest` / `effective_authority_digest` are the capability claim names throughout.
- Grid persistence uses `lifecycle_seq` / `lifecycle_head_digest` internally and projections map directly to the capability fields.
- Mutation commands always carry `command_id` and derived `command_digest`.
- Logical release uses one Grid-signed `axiom-machine-effect-release.v1` receipt and never becomes a bearer permission.
- Gateway resolves target root; Hypervisor authorizes; Grid orders; Sandbox verifies receipt and executes.

### Review Focus coverage

All five Review Focus conditions have explicit tests in Tasks 1, 2, 5, 6, or 7.

## Landing gate

This implementation is not merge-ready until:

1. Tasks 1-8 are complete;
2. the final exact head passes the full protected matrix;
3. no unresolved authority-boundary review thread remains;
4. the final branch is refreshed against current `main` without force;
5. the refreshed exact head is reverified;
6. independent security review is obtained before any production promotion;
7. capability/product/deployment claims remain unchanged unless separately approved.

The implementation may be built and reviewed before external security review; **production promotion may not**.
