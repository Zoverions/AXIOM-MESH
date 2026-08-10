# AXIOM-MESH Agent Interoperability Capability Map

**Status:** planning and traceability map; not the runnable capability registry

**Adopted:** 2026-08-09

**Current registry authority:** `mesh/config/capabilities.json`

**Current build:** `0.12.0-dev.3`

## Purpose

This map connects existing AXIOM foundations to the digital-agent interoperability programme without promoting unimplemented features.

The design goal is a stable machine capability substrate rather than a general agent runtime. Existing or future external runtimes may connect through compatibility adapters, while authority, grants, bounded execution, credentials, evidence, and revocation remain AXIOM concerns.

## Claim rule

```text
protocol compatibility != authorization
capability discovery != permission
agent identity != trust
remote completion != verified truth
skill import != runtime authority
```

Only the capability registry establishes current runnable status.

## Planning-state vocabulary

| State | Meaning |
|---|---|
| **current-registry** | existing foundation; consult registry for exact status |
| **specified-next** | candidate for normative schema/design work |
| **planned** | architectural intent exists |
| **laboratory-only** | may be built/tested without production authority |
| **blocked** | cannot activate until named dependencies pass |
| **not-claimed** | explicitly absent from the current supported surface |

## Layer A — Existing foundations

| Foundation | Planning state | Relevance to agents |
|---|---|---|
| Authenticated Gateway ingress | current-registry | common machine entry point |
| Constrained machine principals | current-registry | human-sponsored machine authority with action/purpose ceilings and no delegation |
| Deny-dominant policy | current-registry | prevents runtime/plugin permissions from becoming AXIOM authority |
| Explicit plans and approvals | current-registry | supports consequential machine requests and owner review |
| Scoped grants | current-registry | natural primitive for machine authority |
| Bounded Sandbox execution | current-registry | separates effect execution from agent planning |
| Grid evidence chain | current-registry | durable receipts and provenance |
| Machine intent receipts | current-registry | owner-scoped Grid-attested terminal receipt verification without promoting the AXIOM Verify product |
| Capability registry | current-registry | machine discovery foundation |
| Capability-to-assertion evidence bindings | current-registry | prevents prose-only capability promotion |
| Memory graph/provenance | current-registry | machine-addressable state with owner boundary |
| Capsule registry | current-registry | foundation for inert imported skills/capsules |
| Admitted-node discovery/scheduling | current-registry | resource/location discovery without remote authority |
| Online/offline causal exchange | current-registry | data/evidence exchange without default consensus |
| Gateway client contract | current-registry | native machine-client foundation |
| Provider runtime foundations | current-registry | credential/policy materialization patterns |
| AXIOM One | experimental/current product programme | human control/approval projection |
| AXIOM Verify | planned product | machine and human receipt/evidence verification target |
| AXIOM Studio | planned product | skill/capsule/adapter tooling target |

These foundations reduce how much new trusted code agent interoperability should require.

## Layer B — Machine principals

| Capability | Planning state | Dependencies | Current claim |
|---|---|---|---|
| Machine principal identity | current-registry | bearer principal registry, Gateway auth | implemented for constrained `agent` principals |
| Runtime instance binding | current-registry | machine principal identity | runtime ID and optional software digest are authority-bound attribution, not attestation |
| Owner/sponsor relationship | current-registry | configured human principal | implemented human sponsorship; legal/social legitimacy not inferred |
| Purpose/action ceilings | current-registry | Hypervisor policy/intent | implemented as a second deny-dominant layer |
| Machine execution-time ceiling | current-registry | Hypervisor plan/grant | implemented by intersecting policy and machine timeout |
| Machine authority evidence binding | current-registry | approval/plan/grant/evidence | authority digest bound across the supported local execution path |
| Machine-principal revocation | specified-next | bearer lifecycle / identity records | expiry enforced; dedicated revocation lifecycle remains future work |
| Purpose-bound machine credentials | planned | provider runtime, secret policy | not-claimed |
| Destination/rate/concurrency/request/response limits | current-registry / partial | Gateway + runtime enforcement | request/rate/concurrency/response ceilings and current built-in `local` destination enforcement are live; external/provider destination semantics remain future work |
| Principal-specific capability visibility | current-registry | discovery policy | principal-filtered requestability discovery is live and explicitly not authorization |
| Machine principal in Circle | blocked | Circle identity/charter | not-claimed |

Machine-principal v1 explicitly rejects wildcard scope, administrator role, and delegation. Existing infrastructure `service` identities remain compatible unless they opt into the constrained machine profile.

## Layer C — Protocol-neutral invocation semantics

| Capability | Planning state | Existing foundation | Remaining work |
|---|---|---|---|
| Minimal invocation envelope | current-registry / native partial | intents, machine authority digest, grants, evidence | native v1 schema/canonicalization is live; external protocol projections remain future work |
| Capability ID/version binding | specified-next | capability registry | adapter translation rules |
| Purpose binding | current-registry | intent purpose + machine purpose ceilings | formalize as mandatory invocation-envelope field |
| Machine authority binding | current-registry | request/plan/capability/evidence digests | preserve parity through every future adapter |
| Destination binding | current-registry / partial | deny-egress/adapters | current built-in `local` destination is computed and enforced; external/provider semantics remain future work |
| Requested/achieved assurance binding | planned | adaptive assurance architecture | future assurance schema |
| Causal/task parent binding | planned | causal exchange/provenance | task context schema |
| Result/artifact digest binding | specified-next | evidence/export digests | artifact model |
| Protocol-parity proof | laboratory-only | native client + adapter | positive/negative equivalence suite |

The envelope is a semantic binding, not a new wire protocol.

## Layer D — Native machine surface

| Capability | Planning state | Dependency | Safeguard |
|---|---|---|---|
| Capability discovery | current-registry | Gateway contract/registry | principal-filtered discovery is live and does not grant permission |
| Schema discovery | planned | stable capability schemas | protected metadata filtering |
| Plan/approval status | planned | policy/approval records | principal-scoped visibility |
| Grant inspection | planned | scoped grants | no self-expansion |
| Async task status | planned | task state model | exact uncertainty/cancellation semantics |
| Machine Verify | current-registry / primitive | Grid-attested machine receipts | owner-scoped terminal receipts verify independently; the separate AXIOM Verify product remains planned |
| Event observation | planned | events/telemetry | bounded subscription and privacy |
| Artifact retrieval | planned | artifact model | digest/size/source/retention bounds |

## Layer E — MCP server compatibility

| Capability | Planning state | Dependency | Current claim |
|---|---|---|---|
| Read-only MCP adapter | laboratory-only | native machine discovery | not-claimed |
| Tool discovery projection | laboratory-only | capability/schema discovery | not-claimed |
| Consequential MCP tool translation | blocked | machine principal + invocation envelope + parity tests | not-claimed |
| MCP resource projection | laboratory-only | principal-scoped reads | not-claimed |
| MCP authentication/profile | specified-next | adapter threat model | not-claimed |
| MCP protocol parity | laboratory-only | native equivalent requests | not-claimed |
| MCP streaming/async bridge | planned | task/event semantics | not-claimed |

Required invariant: the same principal requesting the same underlying capability through native Gateway or MCP receives the same authority decision.

## Layer F — Skill and capsule interoperability

| Capability | Planning state | Product boundary | Safeguard |
|---|---|---|---|
| External skill importer | laboratory-only | AXIOM Studio | inert import only |
| Skill provenance/version tracking | specified-next | AXIOM Studio/Grid | immutable source digest |
| Permission manifest derivation | specified-next | AXIOM Studio | generated request, not grant |
| Static/adversarial skill scan | laboratory-only | AXIOM Studio | advisory + fail gates by policy |
| Capsule conformance test | planned | Sandbox/Studio | no production authority |
| Update diff/review | planned | Studio/provenance | no silent replacement |
| Imported skill activation | blocked | grants, adapter policy, security review | not-claimed |

Skill instructions are content. They do not become policy merely because a framework labels them a skill.

## Layer G — External tool/provider consumption

| Capability | Planning state | Dependency | Safeguard |
|---|---|---|---|
| Purpose-bound provider credential | specified-next | provider runtime | never ambient model credential |
| Destination allowlist | current foundation / planned adapter use | deny-egress | exact host/profile |
| External tool schema binding | planned | capsule/adapter schema | detect changes |
| Idempotent external effect | specified-next | intent idempotency + adapter contract | duplicate-effect tests |
| External result provenance | planned | evidence/artifact model | not automatically truth |
| Cost/quota budget | specified-next | policy/grant | fail closed on exhaustion |
| Provider outage behavior | specified-next | adapter contract | explicit unavailable state |

## Layer H — Asynchronous tasks and artifacts

| Capability | Planning state | Dependency | Current claim |
|---|---|---|---|
| Task state machine | specified-next | intent/evidence | not-claimed |
| Awaiting-approval task state | specified-next | approvals | not-claimed |
| Progress event stream | planned | event observation | not-claimed |
| Typed artifact record | specified-next | Grid/evidence | not-claimed |
| Resumable observation | planned | transport adapter | not-claimed |
| Cancellation/expiry | specified-next | task state/grants | not-claimed |
| Uncertain completion | specified-next | idempotency/evidence | not-claimed |
| Runaway budget termination | planned | budgets/supervisor | not-claimed |

## Layer I — Delegation

| Capability | Planning state | Dependency | Safeguard |
|---|---|---|---|
| Machine delegation v1 | blocked/current denial | machine-principal validator | current v1 requires disabled / depth 0 |
| Bounded future machine delegation | specified-next | grants + revocation | explicit attenuated scope only |
| Delegation expiry/revocation | specified-next | Grid/governance | append-only history |
| Delegation depth | specified-next | delegation schema | bounded chain |
| Attenuation proof | laboratory-only | canonical delegation semantics | no scope increase |
| Sub-agent delegation | blocked | attenuation proof + threat model | not-claimed |
| Delegation receipt chain | planned | evidence | selective disclosure |

No agent may gain authority by spawning a child agent or switching protocols.

## Layer J — MCP client compatibility

| Capability | Planning state | Dependency | Safeguard |
|---|---|---|---|
| External MCP server admission | laboratory-only | adapter registry | metadata is untrusted |
| Environment/credential filtering | specified-next | provider runtime | explicit injection only |
| Dynamic tool change detection | laboratory-only | schema/digest cache | re-review on change |
| Per-tool policy translation | planned | invocation envelope | no server-declared permission |
| External MCP execution | blocked | bounded provider path + red-team | not-claimed |

## Layer K — A2A compatibility

| Capability | Planning state | Dependency | Current claim |
|---|---|---|---|
| Agent descriptor/Card parsing | laboratory-only | machine discovery | not-claimed |
| Remote endpoint admission | laboratory-only | node/identity/transport | not-claimed |
| Task/message translation | laboratory-only | async task semantics | not-claimed |
| Remote artifact translation | laboratory-only | artifact/evidence model | not-claimed |
| Streaming/push translation | planned | task/event profile | not-claimed |
| A2A delegation | blocked | machine delegation + recognition | not-claimed |
| Remote execution through A2A | blocked | remote execution programme | not-claimed |

## Layer L — Authenticated remote execution

| Capability | Planning state | Dependencies | Current claim |
|---|---|---|---|
| Remote executor identity | specified-next | multi-host identity/transport | not-claimed |
| Executable/capsule digest pin | specified-next | capsule registry | not-claimed |
| Remote scoped grant | laboratory-only | machine delegation | not-claimed |
| Encrypted remote input | planned | transport/data policy | not-claimed |
| Remote result/evidence verification | specified-next | Verify/evidence | not-claimed |
| Partition/recovery semantics | planned | causal exchange/recovery | not-claimed |
| Production remote execution | blocked | pilot + independent review | not-claimed |

Scheduler placement is not execution authority.

## Layer M — Agent roles in collective products

| Capability | Planning state | Dependency | Safeguard |
|---|---|---|---|
| Agent as Circle service role | blocked | Circle charter + machine principal | explicit charter permission |
| Agent as delegated worker | blocked | delegation + Circle governance | bounded term/scope |
| Agent proposal author | planned | Circle proposal semantics | machine identity visible |
| Agent vote/decision role | blocked | dedicated governance review | never human-equivalent by default |
| Institutional service agent | blocked | institutional offices/roles | sponsoring authority visible |

## Cross-cutting security requirements

Every agent interoperability capability must address:

- malicious runtime/client assumptions;
- prompt/context/tool-description injection;
- skill/capsule supply-chain risk;
- protocol confusion;
- alternate-path authorization parity;
- identity/endpoint substitution;
- credential isolation/redaction;
- delegation amplification;
- replay/idempotency;
- resource/cost exhaustion;
- external result provenance;
- data minimization and cross-agent leakage;
- adapter upgrade/change detection;
- recovery and revocation;
- exact claims and non-claims.

## Cross-cutting performance requirements

Performance work must measure:

- native versus adapter latency;
- discovery metadata size/cacheability;
- task/event overhead;
- receipt/evidence size;
- retry/idempotency cost;
- scheduling/resource utilization;
- provider round-trip overhead;
- verification cost.

No optimization can weaken the mandatory authority result.

## Dependency chain

```text
current kernel + constrained machine principal + pilot evidence
  -> complete invocation envelope
  -> native machine discovery + Verify
  -> read-only MCP adapter
  -> inert skill/capsule importer
  -> bounded external tool/provider
  -> async task/artifact model
  -> attenuation-only delegation
  -> MCP client laboratory
  -> A2A laboratory
  -> authenticated remote execution
  -> governed machine roles in Circles/institutions
```

## Documentation update rule

When any item moves from planning into specification or implementation, update all applicable:

1. capability registry and assertion evidence binding;
2. normative requirements;
3. product definition;
4. roadmap/task queue;
5. agent interoperability architecture/map/review;
6. threat model;
7. schemas and protocol-version contracts;
8. credential, operations, recovery, and revocation runbooks;
9. current status/readiness;
10. release notes and public claims.

## Current non-claims

Current `0.12.0-dev.3` **does** claim the narrow constrained machine-principal authorization primitive recorded in the capability registry. It does **not** claim MCP, A2A, machine-principal delegation, dedicated machine revocation, machine-specific destination/rate/concurrency/request/response enforcement, external skill execution, production agent federation, runtime hardware attestation, or authenticated remote task execution. This map preserves a path to those capabilities while keeping current authority exact.