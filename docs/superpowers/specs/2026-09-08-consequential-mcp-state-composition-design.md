# Consequential MCP / State Composition Design

Date: 2026-09-08
Status: design only; no production promotion or runtime authority change
Stage: input to a fresh Stage 5B design gate

## Purpose

Define a protocol-neutral security profile for consequential tool execution, motivated by MCP-style control planes that can change infrastructure state.

The profile must preserve AXIOM-MESH's existing distinction between discovery, authentication, capability, authorization, execution, and evidence while adding a missing composition rule:

> Each effect may be individually authorized while the resulting aggregate system state is unauthorized.

This design therefore treats authorization of one tool call as necessary but not sufficient for authorization of the state produced by composing multiple calls, agents, protocols, deputies, retries, or rollback actions.

## Scope

The first implementation slice is experimental and non-authorizing. It should add a machine-readable Agent Commons profile, portable negative fixtures, and deterministic conformance tests. It must not activate MCP/A2A execution, add network credentials, widen Gateway/Hypervisor/Sandbox/Grid authority, promote a capability, or claim production deployment support.

The design is protocol-neutral. MCP is the motivating interoperability surface, but the same rules apply to REST APIs, provider control planes, CLIs, automation SDKs, network controllers, infrastructure-as-code executors, physical actuators, and other consequential effect adapters.

## Existing architecture inputs

This work composes with, but does not replace:

- RT-AUTH-001: capability validity is not effect-time authority currentness;
- the causal authority composition substrate: composition follows a causal scope rather than a transport session;
- Agent Commons portable negative-fixture conventions;
- one-time effect consumption and replay resistance;
- identity/discovery separation from local authorization;
- the delegation-subtree/root-budget design, where aggregate authority consumption must remain bounded across descendants;
- existing evidence rules: signed or authenticated evidence does not prove external outcome or satisfaction.

No existing input grants implementation or authorization authority to this Stage 5B slice.

## Core invariants

### 1. Tool reachability is not effect authority

A tool may be discovered, authenticated, schema-valid, and callable without being authorized for the requested effect.

`tool listed / reachable / authenticated != effect authorized`

### 2. Tool-level grants bind concrete effects

A consequential grant must bind the concrete effect rather than only a broad tool name. The exact binding may include, according to effect class:

- action/tool identity;
- target resource or topology object;
- source and destination;
- arguments and normalized effect parameters;
- bounded magnitude, quota, duration, and time window;
- authority root and acting/delegated principal;
- required currentness evidence;
- destination/audience;
- intended resulting-state constraints;
- causal scope and prior state assumptions.

### 3. Individually authorized effects do not imply an authorized aggregate state

Before a consequential effect, the enforcement point must evaluate both:

1. whether the requested transition itself is authorized; and
2. whether the resulting state remains inside all applicable invariant and authority ceilings.

An effect that is locally valid but would create a forbidden aggregate state must be denied.

### 4. Composition follows causal state, not transport sessions

Protocol switching, reconnecting, using another MCP server, invoking a provider API, changing agents, or retrying through another adapter must not reset the state-composition boundary.

Relevant effects remain associated with the same causal scope / authority root until an explicitly authorized boundary transition closes or replaces that scope.

### 5. Currentness is checked at the last controllable point

Any current authority, topology, policy, revocation, or dependency state required to decide the effect must be re-evaluated immediately before the effect boundary where practical.

A previously valid tool approval cannot survive a material policy or topology change merely because its token, capability, or session remains cryptographically valid.

### 6. Provider/deputy execution is attributed to the originating authority root

An agent must not bypass a direct restriction by asking an authorized provider, MCP server, browser, retrieval service, cloud control plane, or other deputy to produce the same consequential outcome.

The deputy may have its own bounded authority, but its action must remain attributable to the causal request and must not widen the originating authority ceiling.

### 7. Rollback is itself a consequential effect

An inverse, rollback, remediation, or recovery action is not automatically authorized because it appears to undo a previous effect. It requires current authority and must itself satisfy resulting-state constraints.

### 8. Requested state is not observed state

A successful API/tool response does not prove that the external system reached the requested state.

Evidence should distinguish:

- requested transition;
- admitted transition;
- invocation attempt;
- remote acknowledgement;
- independently observed resulting state, when available;
- unresolved or contradictory state.

## State model

The experimental profile should model a consequential transition as:

`S0 + E -> S1`

where:

- `S0` is the relevant pre-effect state projection;
- `E` is the normalized proposed effect;
- `S1` is the predicted/declared resulting state used for admission;
- later evidence may contain `S1_observed`, which is not assumed equal to `S1`.

The admission result must be deny-dominant if a required state component is unknown, stale, contradictory, or unavailable and the policy does not explicitly define a safe degraded mode.

The profile should not require a universal world-state model. Each adapter declares the minimal state projection and invariants needed for its effect class.

## Components

### Consequential effect descriptor

A protocol-neutral, inert descriptor for the exact proposed effect. It carries no authority by itself.

Required concepts:

- `effect_id` or content-derived digest;
- `effect_class`;
- normalized action;
- exact targets/arguments;
- authority root / causal scope reference;
- actor/delegation evidence references;
- currentness requirements;
- state assumptions;
- resulting-state constraints;
- evidence requirements.

### State-composition guard

A pure deterministic evaluator in the first slice. It receives:

- exact proposed effect descriptor;
- already-verified local grant evidence;
- current relevant state projection;
- prior admitted/committed effects in the same causal scope;
- applicable invariant/ceiling definitions.

It returns only a local evaluation result such as `permit_candidate` or `deny`; it must not invoke the effect, mutate the authoritative capability registry, or become a new grant issuer.

For the experimental slice, even `permit_candidate` must be explicitly non-authorizing and must not be wired into production execution.

### Effect/state evidence receipt

An inert evidence object that can bind:

- exact effect descriptor digest;
- admission decision and reason;
- state projection digest used at admission;
- policy/currentness evidence refs;
- invocation evidence, if supplied by a separately trusted executor;
- remote acknowledgement evidence;
- independently observed resulting-state evidence;
- unresolved discrepancies.

The receipt must never infer external truth from the request or response alone.

## Portable negative-fixture corpus

The first profile should include at least these cases.

### A. Authenticated but unauthorized network modification

The MCP/control-plane identity and transport are valid, but no bounded local grant covers the requested change.

Expected: deny before effect.

### B. Destination substitution after authorization

A grant covers one exact destination or endpoint. The request changes the destination after approval while preserving tool/action identity.

Expected: deny before effect.

### C. Stale grant after topology or policy change

An effect was approved under `S0`; before execution, relevant topology/policy/currentness changes such that the same transition is no longer permitted.

Expected: deny at the late effect boundary.

### D. Two individually permitted changes create a forbidden route/state

Each transition is valid in isolation. The second transition would create a prohibited end-to-end path or aggregate state.

Expected: first may remain admissible; second denied because `S1` violates a composition invariant.

### E. Concurrent agents race state mutations

Two agents under the same or related authority roots concurrently propose individually valid changes that cannot both coexist within the resulting-state ceiling.

Expected: atomic or serialized admission semantics ensure at most the permitted set commits; no double success due to stale pre-state reads.

### F. Protocol switching does not reset composition

An agent performs one change through MCP and attempts the complementary change through REST/provider API/another MCP server so the pair creates a forbidden state.

Expected: second effect remains associated with the same causal/authority scope and is denied.

### G. Provider deputy bypass

Direct execution of an effect is denied, but the agent asks an authorized provider/deputy to cause the equivalent state transition.

Expected: the deputy path cannot widen the originating authority ceiling; deny or require separately authorized delegation/effect authority.

### H. Rollback requires current authority

A previous change is later targeted for rollback, but the actor's authority has been revoked/narrowed or the environment has changed such that the inverse transition itself is not currently authorized.

Expected: rollback denied; historical authorization does not bootstrap current authority.

### I. Requested state differs from observed state

The remote control plane returns success, but independent observation shows the resulting state does not match the requested/acknowledged state.

Expected: evidence reports discrepancy/unknown external satisfaction; no false success claim.

### J. Retry/duplicate path

A timeout or ambiguous response leads the agent to retry through another endpoint or protocol.

Expected: replay/consumption and composition state prevent duplicate or compounding effects beyond the intended transition.

## Atomicity and concurrency

The profile must be explicit that state-composition checks are vulnerable to TOCTOU if multiple enforcement points evaluate the same stale `S0` independently.

The experimental design should therefore define an abstract admission contract with one of these acceptable mechanisms:

- atomic compare-and-commit against a state/version digest;
- serialized admission for the relevant causal/state scope;
- a single authoritative admission service for that scope;
- another mechanism that proves two incompatible effects cannot both commit from the same stale state.

The profile must not prescribe one storage/database technology.

If atomic/serializable admission evidence is unavailable for a case that requires it, the decision fails closed rather than assuming isolation.

## Relationship to delegation-subtree authority budgets

State composition and aggregate authority budgets solve different but complementary problems.

- Root/subtree budgets prevent descendants from collectively overspending a magnitude/count/resource ceiling.
- State composition prevents individually budget-valid effects from jointly creating a forbidden system condition.

An implementation may need both checks before a consequential effect. Passing one does not imply passing the other.

Neither mechanism may mint authority.

## Relationship to MCP

MCP metadata, server authentication, OAuth credentials, tool schemas, server reputation, remote authorization claims, or successful tool listing are evidence/capability inputs only.

A future MCP adapter may translate an MCP call into the protocol-neutral consequential-effect descriptor, but the MCP server must not become the AXIOM authority root merely because it can perform the operation.

Remote servers may enforce additional restrictions. Their enforcement can narrow actual reach but cannot widen AXIOM local authority.

## Failure semantics

The guard must deny when required inputs are:

- missing;
- stale beyond the declared effect bound;
- contradictory;
- structurally invalid;
- bound to a different actor, authority root, effect, target, policy revision, state version, or destination;
- unable to establish required atomic/serializable admission semantics.

Unknown external outcome after invocation is recorded as unknown/ambiguous, not silently converted to success or failure.

Recovery must preserve honest ambiguity. If a commit may have reached the external system but local evidence is incomplete, the system must reconcile before issuing a duplicate effect where duplication is consequential.

## Testing strategy

Implementation must follow RED -> GREEN TDD.

The first RED should demonstrate that a fixture where two individually valid transitions create a forbidden aggregate state is not currently rejected by any new profile because the profile/guard does not yet exist.

GREEN should add the minimal pure guard/profile needed to classify the corpus correctly, without wiring it to production effect execution.

Required test categories:

- fixture schema/structure validation;
- every negative case denies for the intended reason;
- positive control where two compatible transitions remain acceptable as experimental candidates;
- protocol/destination substitution;
- stale state/currentness;
- concurrency/version-conflict behavior at the pure interface level;
- provider-deputy attribution;
- rollback non-specialness;
- requested-vs-observed evidence separation;
- semantic-elevation tests proving guard output cannot claim production authorization or effect execution;
- static import/boundary checks proving the experimental guard does not invoke network/process/filesystem target effects or mutate the authoritative capability registry.

## Stage 5B acceptance gates

Before any production-path integration is considered, a fresh Stage 5B gate must independently establish:

- exact supported effect classes;
- authoritative state source(s) and freshness requirements;
- atomic/serializable admission mechanism;
- authority-root/causal-scope binding;
- interaction with root/subtree budgets;
- rollback/recovery behavior;
- multi-replica semantics;
- provider/deputy attribution semantics;
- effect receipt and external-state observation requirements;
- threat model and failure containment;
- explicit approval for any runtime integration.

Stage 5A or experimental Agent Commons evidence may be inputs/provenance only. It provides no authorization to integrate or promote this profile.

## Nonclaims

This design does not claim:

- MCP itself is insecure;
- any specific vendor control plane violates these invariants;
- the Zayo deployment has been independently audited;
- a universal network/topology model;
- production effect authorization;
- production MCP/A2A execution;
- distributed consensus or global state truth;
- that remote acknowledgement proves effect completion;
- that rollback is always possible;
- that the experimental guard is a grant issuer or enforcement authority.

## Implementation slice after approval of this spec

The first plan should be limited to:

1. one Agent Commons machine-readable consequential-state-composition profile;
2. one portable fixture corpus covering cases A-J;
3. one minimal pure evaluator/guard used only by tests/laboratory code;
4. focused RED -> GREEN tests plus semantic-elevation and static side-effect traps;
5. canonical documentation registration if required by the repository boundary.

No Gateway, Hypervisor, Sandbox, Grid, MCP transport, provider adapter, capability-registry, credential, deployment, or production policy change belongs in that first slice.
