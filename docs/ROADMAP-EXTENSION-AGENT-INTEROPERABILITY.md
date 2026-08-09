# AXIOM-MESH Roadmap Extension — Agent Interoperability and Capability Substrate

**Status:** canonical candidate strategic extension to `docs/ROADMAP.md`; branch review only until merged

**Adopted for branch review:** 2026-08-09

**Planning horizon:** current `0.12.x` product/pilot work through machine principals, protocol adapters, bounded delegation, remote tasks, and machine participation in governed collaboration

**Authority:** `mesh/config/capabilities.json` remains authoritative for runnable capability status. This roadmap extension does not promote any capability.

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
- scheduling/resource profile usefulness.

Optimization cannot silently drop authorization, attribution, or required evidence.

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
  -> authenticated remote execution
  -> governed agent roles in Circles/institutions
```

External research may run ahead, but authority exposure may not.

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
- a supported capsule marketplace.

## Long-horizon outcome

AXIOM-MESH should become a communication and capability substrate where humans and digital agents can use the same bounded authority model through different interfaces. Agent runtimes remain replaceable. Credentials remain scoped. Delegation remains explicit. Effects remain governed. Evidence remains portable. Protocol changes do not change who is allowed to do what.
