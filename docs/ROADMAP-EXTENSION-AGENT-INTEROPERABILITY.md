# AXIOM-MESH Roadmap Extension — Agent Interoperability and Capability Substrate

**Status:** canonical strategic extension to `docs/ROADMAP.md`; included in the supported documentation corpus

**Adopted for branch review:** 2026-08-09

**Planning horizon:** current `0.12.x` product/pilot work through machine principals, protocol adapters, bounded delegation, remote tasks, and machine participation in governed collaboration

**Authority:** `mesh/config/capabilities.json` remains authoritative for runnable capability status. This roadmap extension does not promote any capability.

**Document role:** future-programme sequencing and interoperability guardrails.
The [project status](PROJECT-STATUS-2026.md) and [readiness tracker](PRODUCTION-READINESS-TRACKER.md)
own current implementation and promotion decisions; the detailed architecture
and capability maps provide design inputs, not alternate status registries.
Items below remain non-claims until code, registry state, tests, review, and
promotion evidence agree.

## Why this extension exists

AXIOM-MESH is currently strongest as a local-first capability, policy, execution, and evidence substrate. Its product programme has naturally begun with human-facing surfaces, but the same core should be useful to digital agents, services, schedulers, local models, external agent frameworks, and future embodied systems.

General agent runtimes are evolving too quickly for AXIOM to gain leverage by maintaining a competing fork. The strategic opportunity is instead to make AXIOM a stable **machine authority and interoperability substrate** that those runtimes can call.

The detailed package is:

- `docs/rebuild/AGENT-INTEROPERABILITY-AND-CAPABILITY-SUBSTRATE.md`;
- `docs/rebuild/AGENT-INTEROPERABILITY-CAPABILITY-MAP.md`;
- `docs/reviews/AGENT-INTEROPERABILITY-ARCHITECTURE-REVIEW-2026-08-09.md`;
- `docs/MASTER-TODO-AGENT-INTEROPERABILITY.md`.

## Roadmap doctrine

> **Do not build another universal agent. Build the trusted capability fabric agents can use. Protocols carry requests; AXIOM carries authority, limits, provenance, and receipts.**

The existing five-state lifecycle remains unchanged:

1. built;
2. enabled;
3. exposed;
4. production-promoted;
5. marketed.

Agent interoperability also inherits the existing distinction between authority, assurance, finality, and retention.

## Compatibility commitments effective immediately

1. No agent, service, plugin, skill, protocol adapter, or remote peer may bypass `Gateway -> Hypervisor -> Sandbox -> Grid` for privileged or externally visible effects.
2. External agent frameworks are clients/integration targets, not trusted authority roots.
3. Protocol discovery never grants permission.
4. Installation/import of a skill, plugin, capsule, Agent Card, or tool manifest grants no runtime authority.
5. Agent delegation must be explicit, bounded, expiring, revocable, and attenuation-only by default.
6. Credentials remain purpose-bound and must not be broadly injected into model context or child agents.
7. Advisory ethical/risk models may increase caution but may not silently lower mandatory policy or approval requirements.
8. The native Gateway contract remains semantically authoritative; compatibility adapters must prove equivalent authorization outcomes.
9. Remote output is evidence from a remote source, not local truth merely because the protocol completed successfully.
10. No interoperability feature may be marketed before registry/evidence promotion.
11. Network path discovery, local-repair candidates, route optimization, radio metrics, attestation state, spectrum policy, DTN state, or AI recommendations are evidence and planning inputs only; none may create network-control authority or bypass the normal AXIOM intent/grant/effect path.

## Workstream A — Current production-candidate protection

**Horizon:** current `0.12.x`

- preserve exact existing registry claims;
- complete authentic pilot and independent security review;
- complete current AXIOM One lifecycle/security/accessibility gates;
- complete AXIOM Verify foundations needed for machine receipt validation;
- do not add agent authority shortcuts to accelerate experimentation;
- preserve current non-claims for external AI, remote execution, federation, MCP, A2A, and supported autonomous agents.

## Workstream B — Legacy agent extraction

**Horizon:** immediate portfolio work; no runtime promotion

- audit IronAgent, ZovsIronClaw, claw_academy, Context-Poisoning-Detector, Axiom-Forge, and related agent/tool repositories;
- extract unique skills, adapters, tests, security detectors, hardware profiles, and orchestration patterns;
- bind every extracted artifact to source provenance;
- reject stale broad production claims;
- use discovered fail-open/ambient-authority patterns as negative test cases;
- prefer maintained upstream interoperability over permanent general-agent forks;
- archive/delete only after unique work and security/provenance obligations are resolved.

## Workstream C — Machine principal and invocation semantics

**Horizon:** specification after current pilot blockers; implementation in isolated local paths first

Outcome: a machine caller has an explicit identity and can request a capability without being confused with a human owner or receiving ambient authority.

Milestones:

- machine principal schema;
- sponsorship/ownership/domain relationships;
- key provision, rotation, revocation, compromise handling;
- purpose and destination constraints;
- resource/cost/time/network budgets;
- minimal AXIOM Invocation Envelope;
- exact canonicalization/version negotiation;
- clear caller-claim versus AXIOM-computed fields;
- native structured error/receipt behavior;
- no subdelegation initially.

## Workstream D — Machine discovery and AXIOM Verify

**Outcome:** agents can determine what AXIOM can do and independently inspect outcomes without scraping human interfaces.

Milestones:

- stable capability IDs and schemas;
- bounded machine discovery;
- principal-specific authorization remains separate from discovery;
- exact plan/approval/grant status where the caller is permitted to observe it;
- machine-readable receipts and evidence verification;
- artifact digest/provenance inspection;
- explicit unavailable/denied/uncertain states;
- selective evidence retrieval to keep communication efficient.

## Workstream E — MCP server laboratory

**Outcome:** one maintained external agent/client ecosystem can call a policy-selected AXIOM surface without creating a second authorization system.

**Current contract checkpoint:** the candidate Agent Runtime Adapter v1
manifest is byte-pinned at contract version `1.0.0`, and a 28-case synthetic
reference drill is attached to the required `verify` workflow. This establishes
contract, signed-grant, mapping, revocation, cancellation, idempotency,
uncertain-outcome, and receipt-shape evidence only. It does not load or certify
an external runtime and does not promote MCP support.

Sequence:

1. pin one exact MCP profile;
2. implement an adapter outside the zero-dependency kernel where practical;
3. expose read-only/non-consequential capabilities first;
4. preserve authenticated AXIOM principal identity;
5. translate consequential calls into normal intents;
6. enforce request, rate, concurrency, timeout, origin/authentication, and response bounds;
7. prove protocol parity against the native client;
8. red-team tool-description and prompt injection;
9. keep credentials out of tool metadata and model-visible error paths.

Promotion requires explicit conformance and threat-model evidence.

## Workstream F — AXIOM Studio interoperability imports

**Outcome:** useful external skills/procedures can enter the ecosystem without importing their authority assumptions.

Milestones:

- support one skill/package format first;
- ingest as inert artifacts;
- preserve upstream provenance/version/license/digest;
- derive a candidate capsule manifest;
- declare tools, files, env, credentials, network destinations, data classes, resource budgets, and outputs;
- static/adversarial scan;
- sandbox conformance;
- visible update diff;
- no automatic activation or permission grant.

## Workstream G — One bounded external tool/provider

**Outcome:** prove that machine-originated work can cross an external boundary safely.

Milestones:

- dedicated purpose-bound credential;
- exact destination allowlist;
- exact input/output schema;
- rate/time/cost bounds;
- idempotent retry semantics;
- output provenance and integrity metadata;
- provider unavailability fails closed for protected actions;
- logs/errors/evidence remain secret-free;
- external output remains distinguishable from verified local fact.

## Workstream H — Asynchronous machine tasks

**Outcome:** longer agent workflows do not require open synchronous requests or transcript replay.

Milestones:

- task state machine;
- task/context/causal identifiers;
- bounded progress/event observation;
- artifact records;
- polling and resumable observation profiles;
- cancellation/expiry semantics;
- uncertain completion handling;
- budget exhaustion and runaway-loop controls;
- signed/integrity-bound completion receipts.

## Workstream I — Attenuation-only delegation

**Outcome:** one principal may delegate a narrowly defined capability to an agent or sub-agent without creating generic trust.

Milestones:

- exact delegation record;
- capability/action scope;
- purpose/data/destination restrictions;
- budget ceilings;
- assurance/approval floors;
- delegation depth;
- expiry and revocation;
- subdelegation subset proof;
- full provenance of delegator/delegate/executor;
- confused-deputy and delegation-laundering tests.

## Workstream J — MCP client laboratory

**Outcome:** AXIOM-governed workflows may consume external MCP tools while credentials and authority remain bounded by AXIOM.

Milestones:

- admitted server metadata;
- environment stripping and explicit credential injection;
- destination policy;
- dynamic tool metadata treated as untrusted;
- schema/change detection;
- per-call policy evaluation;
- malicious-server fixtures;
- output/credential bounds;
- no ambient filesystem or host authority.

## Workstream K — A2A-compatible discovery and task exchange

**Horizon:** after local machine principals, async tasks, evidence, and delegation are stable

Outcome: remote agent ecosystems can exchange tasks/artifacts through explicit recognition without acquiring local authority.

Milestones:

- exact supported profile;
- Agent Card/descriptor parsing as claims;
- separate peer authentication/admission;
- task/message/artifact translation;
- remote result provenance;
- async/streaming compatibility;
- endpoint substitution and task hijack defenses;
- no implicit remote execution authority.

## Workstream L — Authenticated remote execution

**Horizon:** after mature multi-host identity, transport, task semantics, independent verification, and recovery

- bind remote executor and exact executable/capsule digest;
- issue short-lived one-use grants;
- encrypt/bind inputs;
- enforce data residency/destination requirements;
- validate results and evidence independently where consequence requires;
- handle partitions, compromise, cancellation, uncertain completion, and recovery;
- never infer execution authority from scheduler discovery metadata alone.

## Workstream L2 — Resilient Path Fabric

**Horizon:** inert contract and simulation work may proceed during `0.12.x`; live forwarding/radio control only after multi-host transport, measured telemetry, trust, recovery, and explicit network-effect authorization exist

**Outcome:** AXIOM can reason about heterogeneous network paths as a policy-aware portfolio rather than a flat undifferentiated mesh, while keeping network-control authority separate from path observations and optimization.

Architectural model:

```text
traffic/service intent
  -> hard legality + security constraints
  -> validated path portfolio
  -> prepared local-repair candidates
  -> deterministic route/execution proposal
  -> normal AXIOM authorization
  -> bounded network effect
```

The target fabric should distinguish at least these overlapping views rather than collapsing them into one weighted graph:

- physical links and media;
- local-repair/reliability relationships;
- energy/transit eligibility;
- compute/storage placement;
- node trust and attestation freshness;
- spectrum/regulatory availability;
- maintenance/access/repair burden.

Milestones:

1. preserve current admitted-node discovery/scheduling and online-causal-exchange semantics as separate controls rather than silently redefining them as routing;
2. define a route/path portfolio contract with exact source/destination, traffic criticality, latency ceiling, current attestation requirement, path count, and required failure-domain diversity;
3. represent failure correlation explicitly across spectrum, power, backhaul, vendor, administration, and physical site rather than equating neighbor count or edge-disjointness with resilience;
4. introduce role-specialized nodes: stable powered transit/core, regional relays, energy-constrained routers, and leaf/sleepy endpoints;
5. require policy-confirmed legal availability before a radio/link may enter an admissible live path;
6. make stale/quarantined attestation and depleted/reserve transit energy fail closed for protected live paths;
7. separate fast local-repair candidates from slower global routing/topology optimization;
8. support selective redundancy for critical traffic without defaulting to universal packet replication;
9. model BPv7-style store-forward only as an explicit disruption-tolerant fallback, not as ordinary low-latency routing or permission to move data;
10. preserve compute capacity and storage placement as path metadata so later work can model computation as virtual graph edges without granting compute authority from connectivity alone;
11. retain maintenance class, access constraints, repair burden, and spare/power facts as first-class planning evidence rather than operator folklore outside the model;
12. run AI/GNN/RL control in shadow mode first: model predicts, bounded optimizer proposes, deterministic checks validate, and only a separately authorized executor may change forwarding;
13. use constrained or lexicographic optimization so legality/security/reliability floors cannot be numerically traded away for throughput or latency;
14. add chaos drills for link loss, shared-power loss, gateway loss, stale attestation, energy depletion, route correlation, partitions, and recovery oscillation;
15. measure local repair time, p99 latency, control airtime, correlated-failure survival, relay-energy inequality, trust quarantine error, operator repair time, and route-change rollback rate;
16. keep radio-specific mechanisms replaceable: Babel/RPL/OSPF-class reachability, RAW-like repair, Wi-Fi/TSCH/Wi-SUN/cellular/wired media, and DTN may be adapters beneath AXIOM semantics rather than hard-coded authority roots.

Promotion gates before any live path-selection or forwarding effect:

- measured telemetry provenance and bounded freshness;
- exact node/link identity and failure-domain provenance;
- legal/spectrum policy evidence appropriate to the jurisdiction;
- no route through a node that fails the applicable trust or energy floor;
- deterministic hard-constraint checker independent of any learned optimizer;
- AI recommendation cannot directly mutate forwarding, radio, spectrum, or gateway state;
- explicit network-effect action and ordinary AXIOM intent/plan/grant/evidence path;
- rollback and safe deterministic fallback when telemetry, optimizer, verifier, or radio control is unavailable;
- demonstrated control-loop stability under coupled routing, local repair, congestion, energy, and compute changes;
- partition/rejoin and DTN behavior cannot bypass destination authority, consent, data residency, or causal-conflict rules;
- human-readable “why this path?” and “why this path was rejected?” explanations;
- independent security, networking, privacy, regulatory, and operational review.

The first useful implementation remains deliberately inert: validate candidate portfolios and their failure-domain independence, trust/energy/legal admissibility, repair bindings, DTN declarations, and shadow-optimizer non-authority. It does not alter routing tables, radios, interfaces, kernel networking, remote nodes, or causal exchange.

## Workstream M — Agents in Circles and institutions

**Horizon:** after Circle identity/charter/delegation/appeal foundations

- machine principal roles must be explicit in the charter;
- agents cannot count as human consent by default;
- sponsoring principals/institutions remain visible where required;
- machine roles have term, scope, delegation, suspension, and revocation;
- agent governance influence remains separately inspectable and contestable;
- consequential Circle effects still use normal approvals and evidence.

## Workstream N — Performance and communication efficiency

Interoperability must be measured rather than assumed efficient.

Measure:

- native versus adapter request latency;
- discovery payload and cache hit rate;
- receipt/evidence payload sizes;
- event streaming versus polling overhead;
- retry/idempotency cost;
- adapter credential/policy lookup cost;
- task throughput under fixed security constraints;
- scheduling/resource profile usefulness;
- local repair and global reconvergence time;
- correlated-failure survival rather than path count alone;
- control/telemetry airtime and minimum sufficient telemetry;
- relay-energy burden and time to first depletion;
- operator repair effort and physical access delay.

Optimization cannot silently drop authorization, attribution, required evidence, legal constraints, security floors, or failure-domain diversity.

## Dependency map

```text
current kernel integrity + authentic pilot
  -> machine principal + minimal invocation envelope
  -> native machine discovery + Verify
  -> read-only MCP projection
  -> inert skill/capsule import
  -> bounded external tool/provider
  -> async task/artifact semantics
  -> attenuation-only delegation
  -> MCP client laboratory
  -> A2A task exchange laboratory
  -> resilient path-fabric laboratory
  -> authenticated remote execution
  -> governed agent roles in Circles/institutions
```

External research may run ahead, but authority exposure may not. Path-fabric research may consume scheduling, causal-exchange, trust, telemetry, and simulator evidence without converting those observations into forwarding authority.

## Documentation and claims maintenance

Every implementation step must update, as applicable:

- `mesh/config/capabilities.json` and evidence bindings;
- normative requirements;
- product definition;
- primary roadmap/task queue;
- this extension and its capability map;
- threat model;
- schemas/conformance tests;
- credential/operations/recovery runbooks;
- current status/readiness;
- release notes;
- exact public claims/non-claims.

## Current non-claims

This roadmap does not claim current support for:

- MCP server/client operation;
- A2A interoperability;
- machine delegation;
- third-party skill execution;
- autonomous-agent production use;
- remote task execution;
- agent federation;
- agent membership in Circles;
- production multi-path routing or automated local forwarding repair;
- autonomous radio/spectrum control;
- attestation-weighted live routing;
- BPv7/DTN transport as a supported AXIOM network service;
- AI-controlled network optimization;
- a supported capsule marketplace.

## Long-horizon outcome

AXIOM-MESH should become a communication and capability substrate where humans and digital agents can use the same bounded authority model through different interfaces. Agent runtimes remain replaceable. Network media and routing protocols remain replaceable. Credentials remain scoped. Delegation remains explicit. Path observations and optimizer recommendations remain evidence rather than authority. Effects remain governed. Evidence remains portable. Protocol or radio changes do not change who is allowed to do what.
