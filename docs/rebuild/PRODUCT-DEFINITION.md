<!-- axiom-capability-registry: schema=axiom-capabilities.v1; kernel=0.12.0-dev.3; digest=8bcdcfd8f010d2ad5c6fb84fd6fafe8f4833c29d865b5a4181500b137104b0cb -->
# AXIOM-MESH Product Definition

**Status:** canonical rebuild and product definition

**Current build:** `0.12.0-dev.3`

**Reconciled:** 2026-07-30

**Deployment status:** production candidate; no live production claim

## One-sentence definition

AXIOM-MESH is a local-first capability network that turns a human or agent
intent into a policy-authorized plan, executes each approved effect inside a
bounded runtime, and emits portable cryptographically linked evidence for
personal agency, collaboration, audit, governance, recovery, and optional
future settlement.

## Current product state

The supported product today is the clean-room kernel and its authenticated
operator surfaces. It includes the four-service intent-to-evidence path,
encrypted durable state, policy, consent, approvals, evidence, portability,
recovery, single-host service isolation, admitted-node reservations,
operator-approved causal exchange, and deployment-provider protocols.

It does **not** yet include a supported non-developer browser product, external
AI provider, public network, remote workload dispatcher, token, settlement
system, regulated-domain application, or production autonomous agent.

Development now proceeds through three coordinated tracks:

1. **Trust and operations** — complete authentic pilot and independent-review
   evidence for the supported kernel.
2. **Human utility and network activation** — build useful non-developer
   products around the kernel.
3. **Frontier incubation** — implement ambitious systems in isolated,
   disabled-by-default laboratories without promoting them prematurely.

## Development-state model

AXIOM-MESH distinguishes five states:

1. **Built** — code and tests exist in an isolated development path.
2. **Enabled** — an operator deliberately activates the capability under an
   explicit policy and credential boundary.
3. **Exposed** — a user, node, or external system can reach the capability.
4. **Production-promoted** — the exact build and deployment pass applicable
   security, recovery, governance, accessibility, legal, and operational gates.
5. **Marketed** — public claims describe only the promoted scope.

Code may be built long before it is safe to enable, expose, promote, or market.

> **Build broadly. Activate deliberately. Expose minimally. Promote only with evidence. Market only what is true.**

## Trusted runtime

The product has four runtime responsibilities:

1. **Gateway** — the only public ingress; authenticates principals, validates
   requests, applies abuse controls, handles idempotency, and exposes versioned
   user/operator APIs.
2. **Hypervisor** — converts intent into an explicit plan; evaluates layered
   policy, consent, risk, budgets, and approvals; issues short-lived,
   single-use capability grants.
3. **Sandbox** — executes only the action, provider, destination, data, and
   resources named by a valid grant; it has no ambient network, filesystem,
   secret, package, or host authority.
4. **Grid** — owns durable encrypted state, the append-only evidence chain,
   consent, memory, registries, governance, accounting, portability, recovery,
   admission, scheduling reservations, and conflict records.

The mandatory effect path is:

```text
Intent
  -> authenticate and validate
  -> normalize
  -> evaluate policy, consent, and risk
  -> produce an explicit plan
  -> obtain required independent approval
  -> issue a scoped grant
  -> execute in the Sandbox
  -> commit state and evidence to the Grid
  -> return a readable result and receipt
```

No component, product, adapter, administrator, autonomous agent, settlement
process, or domain capsule may bypass this path for a privileged or externally
visible effect.

The current reference unit topology runs the four services across four exact
single-host internal network segments. A machine-readable default-deny policy
authorizes only 38 exact caller, destination, method, and route combinations
before signing or network I/O, derives each destination's active mTLS peers,
and removes Gateway-to-Sandbox and Grid-to-Sandbox adjacency. Plaintext
development traffic remains loopback-only. This is a reference single-host
enforcement claim, not evidence of a pilot or multi-host orchestrator policy.

## Product layers

### Kernel layer

The zero-dependency `mesh/` runtime owns security-critical authorization,
execution, state, and evidence. Its dependency and authority boundaries are not
expanded merely to simplify application development.

### Human application layer

Browser, mobile, desktop, and static verification applications live outside
the trusted kernel and communicate through versioned Gateway contracts. They
receive only narrowly scoped API authority.

Planned human concepts are:

- **Ask** — express an intended outcome;
- **Plan** — inspect the proposed steps, data, providers, destinations, cost,
  retention, timeout, and evidence obligations;
- **Approvals** — approve, edit, deny, revoke, or review consequential effects;
- **Vault** — inspect, organize, export, disclose, tombstone, or delete personal
  information;
- **Receipts** — see what happened, under which authority, and what the evidence
  does and does not prove;
- **Share** — selectively transfer objects and evidence;
- **Circles** — coordinate with trusted people and independently owned nodes.

### Adapter layer

AI providers, channels, storage transfer, credentials, zk verification,
settlement, remote execution, and domain integrations are separate adapters.
Each adapter has an exact trust, credential, egress, consent, budget, retention,
cancellation, evidence, failure, uninstall, and rollback contract.

### Frontier laboratory layer

Distributed authority, economic systems, autonomous loops, regulated domains,
embodied systems, arbitrary code, and post-quantum migration may be built in
isolated laboratories. Laboratory code uses synthetic or separately consented
test data, non-production identities, no real user funds, no public authority,
explicit halt controls, and reproducible adversarial tests.

## Human product family

### AXIOM One

AXIOM One is the planned private personal agent, vault, approval centre, and
evidence record. It must let a non-developer:

- install or open a local node;
- submit an intent in ordinary language;
- inspect and edit the plan;
- understand what information will leave the node and why;
- approve or deny effects;
- inspect private memory and provenance;
- view readable receipts;
- export, disclose, revoke, tombstone, delete, back up, and recover data;
- use the primary experience by phone, keyboard, and assistive technology.

AXIOM One has an experimental loopback-only PWA foundation. It remains outside
implemented/supported claims until complete production-path code, negative
tests, human evidence, packaging, documentation, and independent review satisfy
the capability acceptance rule.

The current experimental human-explanation slice reviews five exact actions
before sending: the non-consequential echo, owner-scoped private memory creation,
one of three fixed directional provenance links, confirmation-bound
tombstoning, and selective local memory export. It maps all stable Gateway
outcomes and current kernel event kinds, distinguishes active,
expired, consumed, and unknown approvals, preserves raw evidence, and reuses the
same request key when a browser outcome is uncertain. A `corrects` edge retains
the source and target as independently visible records; it is provenance, not
silent replacement. The Vault reveals a generated bundle only after a separate
action and retains no token or response in browser storage. This browser
projection is not an authoritative pre-execution kernel plan. General
consequential plan/approval, edge deletion, hard deletion,
restore, bulk ingestion, and human evidence still require their own gates.

### AXIOM Verify

AXIOM Verify is a local or static verifier for receipts and export packages. It
must explain:

- signer and trust-anchor identity;
- integrity and evidence continuity;
- included records and declared scope;
- alterations, missing material, or unresolved signatures;
- whether a result is evidence of integrity, an operator claim, a synthetic
  fixture, or a production-promotion artifact;
- explicit non-claims.

Verification must not require trusting a hosted AXIOM service.

### AXIOM Circles

AXIOM Circles are invitation-based collaboration spaces for families, teams,
community groups, researchers, creators, and organizations. A Circle may
support shared objects, proposals, policies, tasks, commitments, approvals,
receipts, and evidence timelines while members retain independently owned nodes
and data.

Circles use selective disclosure, explicit membership and role records,
revocation, approved causal exchange, visible conflicts, and human appeal.
They do not imply public federation, autonomous payroll, or settlement.

### AXIOM Studio

AXIOM Studio is planned tooling for creating and reviewing capsules, adapters,
policies, schemas, consent rules, permission declarations, SBOMs, threat
models, fixtures, rollback procedures, and conformance evidence.

Studio may generate development artifacts; it cannot grant runtime authority or
promote its own output.

### AXIOM Managed Node

AXIOM Managed Node is an optional operational product for people and small
organizations that need hosting, updates, backup, monitoring, and support.
Managed operation must not transfer ownership of personal information or grant
the service operator an undeclared right to inspect plaintext data.

## Product promises

### Sovereignty

- Local-first operation and explicit degraded modes.
- Core access and identity do not require a token.
- The user can inspect, revoke, export, and delete supported identity, consent,
  memory, intent, receipt, governance, and accounting records.
- Institution, Circle, or operator policy may tighten a safety floor but cannot
  silently weaken a higher-level denial or expand consent.
- Managed services remain replaceable and exportable.

### Verifiability

- Every mutation has an actor, policy decision, plan, input digest, result
  digest, timestamp, and previous-event hash.
- Decision provenance records observable inputs, rules, providers, tool calls,
  approvals, and outcomes; it does not claim to expose private chain-of-thought.
- A missing verifier, provider, credential, destination, or settlement adapter
  is an unavailable capability, never synthetic success.
- Cryptographic and zk claims identify their algorithm, circuit or protocol,
  verification material, public-input schema, and implementation.

### Capability safety

- Installing, discovering, connecting, or listing a capability does not grant
  authority.
- Capsules are immutable, content-addressed, signed, versioned, and described by
  manifests, schemas, constraints, provenance, and SBOMs.
- Runtime grants are short-lived, audience-, intent-, plan-, tool-, resource-,
  provider-, destination-, and constraint-bound.
- External source code and tools remain quarantined until policy and evidence
  permit a named execution path.

### Human comprehension

- Consequential effects must be described before approval.
- Friendly language may not conceal uncertainty, conflict, degraded state,
  denial, cost, external transfer, or irreversibility.
- Accessibility, keyboard use, screen-reader behavior, reduced motion,
  contrast, phone usability, and plain-language receipts are tested release
  requirements.
- The user can reach export and deletion from the primary interface.

### Governance

- Policy changes follow proposal, review, delay, activation, verification, and
  rollback.
- Automated systems may tighten or pause unsafe behavior but cannot expand their
  own authority.
- Emergency powers are scoped, time-limited, logged, and reviewed.
- Human and agent input may be represented separately; neither is proof that a
  proposal is true.

### Portability

- Export is a trust primitive, not an optional later add-on.
- Exports use stable versioned schemas, canonical JSONL, signed manifests,
  content digests, selective scopes, continuity metadata, and deterministic
  dry-run import.
- Evidence remains independently verifiable after export without leaking
  unrelated private records.
- Adapters and managed deployments require an uninstall and migration path.

## Capability families

The platform is intended to support these families through common policy,
grant, evidence, and capsule models rather than bespoke privileged paths:

- personal AI inference and bounded multi-step orchestration;
- research, retrieval, code, math, physics, cryptography, and data tools;
- messaging, publishing, and communications adapters;
- identity, consent, reputation, credentials, and selective disclosure;
- memory, storage, backup, recovery, transfer, and synchronization;
- invitation-based collaboration and governance;
- education, health, government/public-service, legal, employment, business,
  and finance capsules;
- task markets, workforce coordination, compensation, and embodied-device
  control;
- node discovery, scheduling, routing, remote dispatch, and result provenance;
- proposals, voting, delegation, emergency controls, appeals, and policy
  inheritance;
- accounting, rewards, bonds, treasury, escrow, optional tokenization,
  settlement, and bridges;
- verification adapters, including named zk systems;
- arbitrary-code isolation and post-quantum migration.

Social importance does not create special trust. Regulated and embodied systems
receive stricter identity, consent, minimization, safety, appeal, legal, and
operational gates.

## Current implemented boundary

The `0.12.0-dev.3` kernel currently implements:

- authenticated intent, plan, policy, grant, deterministic execution, and
  signed evidence;
- deny-dominant policy and independent high-risk approval;
- encrypted transactional Grid state and key-lineage-aware evidence;
- consent, capsule manifests, encrypted memory, governance, local accounting,
  export/import, backup, restore, and recovery;
- mutually authenticated internal transport and two single-host topologies;
- bounded telemetry, alert relay, SLO, request-pressure, dependency-loss,
  rotation, recovery, and incident evidence;
- signed admitted-node discovery metadata and deterministic encrypted placement
  reservations without remote execution;
- operator-approved two-Grid causal exchange without consensus;
- signed deployment-independent secret and policy provider startup;
- pilot evidence and independent-security-review intake verifiers;
- authenticated operator API and CLI;
- exact source setup, lock, documentation, claim, and release gates.

The browser dashboard remains experimental. AI, messaging, identity, storage
transfer, zk, settlement, regulated-domain, and arbitrary-code capabilities
remain adapter-required, experimental, or disabled according to the registry.

## Promotion and acceptance rule

A capability is `implemented` only when all five exist:

1. production-path code without a synthetic-success fallback;
2. fail-closed authorization and negative-path tests;
3. durable evidence produced by an executable verification command;
4. operator and user documentation that matches behavior;
5. a current registry/status record tied to a protected commit.

Production promotion additionally requires deployment-specific security,
recovery, observability, accessibility, usability, incident, custody, rollback,
and independent-review evidence. Regulated and economic systems also require
separate legal and domain review.

A product may be useful as an explicitly labeled local preview without being
production-promoted, but it must not receive production credentials, public
authority, or unsupported marketing claims.

## Deliberate non-claims

Until independently demonstrated, AXIOM-MESH does not claim:

- that a model's reasoning or output is proven true by hashing a trace;
- a supported AXIOM One, Verify, Circles, Studio, or Managed Node release;
- production external AI or messaging;
- production-grade BFT, federation, remote dispatch, or Sybil resistance;
- secure arbitrary code merely from container configuration;
- working zk verification without a named adapter;
- operational tokens, staking, treasury, bridges, liquidity, or settlement;
- clinical, educational, governmental, legal, employment, or financial
  compliance;
- secure embodied autonomy;
- end-to-end post-quantum security;
- a live public deployment, accepted authentic pilot package, or independent
  security approval.

Historical or laboratory descriptions do not override the capability registry,
current project status, or deployment evidence.

## Current priorities

Work proceeds in parallel:

1. close authentic single-node pilot blockers;
2. maintain the implemented versioned Gateway client and complete the
   experimental AXIOM One human-shell gates;
3. add one bounded AI provider and useful personal workflows;
4. build AXIOM Verify and invitation-based Circles;
5. establish remote dispatch and result provenance before distributed compute;
6. expand controlled adapters and managed-node operations;
7. continue frontier laboratories behind isolation and promotion gates.

See the [roadmap](../ROADMAP.md), [execution queue](../MASTER-TODO.md),
[current status](../PROJECT-STATUS-2026.md), and
[readiness tracker](../PRODUCTION-READINESS-TRACKER.md).
