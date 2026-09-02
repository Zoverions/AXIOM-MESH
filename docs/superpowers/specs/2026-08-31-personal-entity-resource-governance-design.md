# Personal Entity Runtime Resource Governance — Design

**Status:** approved architectural refinement; implementation pending plan and tests

**Date:** 2026-08-31

**Scope:** hardware/resource governance for a long-lived personal counterpart and its runtimes, including CPU, accelerator, RAM, storage, I/O, network, energy, thermal, monetary, concurrency, background-work, maintenance, and human-control reserves.

## 1. Problem

A long-lived counterpart is not a normal chat process. Over time it may accumulate memories, indexes, embeddings, event history, model caches, runtime state, background reflection jobs, synchronization work, backups, evaluations, and multiple cognitive/runtime adapters.

Without an explicit resource constitution, success creates its own denial-of-service condition: the more useful and historically rich the system becomes, the more startup, storage, maintenance, retrieval, inference, backup, and synchronization work can grow.

AXIOM already contains important resource-related primitives, but they are incomplete for a persistent personal entity. Node scheduling reserves declared CPU, memory, storage, and concurrency; machine principals have request/time/size/concurrency budgets; runtime-capsule architecture specifies step/call/unit/cost/time/concurrency limits; routing architecture treats privacy and budget as hard filters and energy as an optimization input; evaluation records can contain peak memory and energy. These pieces do not yet constitute one enforced local resource governor for the personal entity.

The entity therefore requires a deterministic **Resource Governance Plane** outside generative cognition.

## 2. Core invariants

> **Sovereignty Reserve Invariant:** Counterpart work may never consume or reserve the minimum resources required for the human to inspect, stop, revoke, recover, export, or operate the sovereign node directly.

> **Bounded Work Invariant:** Every runtime/job capable of meaningful resource consumption must execute inside an explicit resource envelope with finite time, concurrency, memory/storage/network/cost limits or an explicitly bounded inherited profile.

> **Priority Invariant:** Human control and safety operations outrank counterpart background work. Lower-priority work must be pausable, cancellable, deferrable, or rejectable under pressure.

> **Measurement Honesty Invariant:** Declared capacity, estimated cost, model metadata, or provider claims are not measured resource availability. Decisions requiring current capacity use attributable measurements with freshness limits.

> **No Generative Resource Authority:** A model may request or recommend more resources but cannot raise its own hard limits, priority, retention, egress, cost ceiling, or stop rights.

> **Evidence Without Surveillance:** Resource telemetry records operational quantities and provenance without copying raw prompts, private memories, credentials, or counterpart private thought into general telemetry.

## 3. Resource dimensions

A resource envelope may constrain:

- CPU time / CPU share;
- system RAM working set;
- accelerator/GPU/NPU memory;
- accelerator utilization where measurable;
- durable storage allocation;
- temporary/scratch storage;
- read/write I/O rate and I/O concurrency;
- network egress/ingress bytes and request count;
- model calls and input/output units;
- concurrent jobs/requests/workers;
- wall-clock duration;
- monetary cost units;
- energy consumption where measurable or estimable;
- battery eligibility/state;
- thermal state/headroom where exposed by the host;
- file descriptors/process/thread ceilings where applicable.

Not every host exposes every measurement. Missing required observations fail eligibility; optional measurements remain explicitly unknown rather than fabricated.

## 4. Priority classes

The local node SHALL classify work before execution.

### P0 — Sovereign control

Examples: stop/kill, revoke, inspect authority, emergency privacy controls, recovery, integrity verification needed for safe control, direct human authentication.

P0 receives reserved capacity and is never queued behind counterpart background work.

### P1 — Human foreground

Direct user requests and interactive human-proxy work. Target is responsiveness while preserving ordinary authority/privacy checks.

### P2 — Counterpart foreground

Counterpart-originated work that is presently interacting with the human or executing a currently authorized commitment.

### P3 — Background cognition

Reflection, memory consolidation, indexing, optional prefetching, evaluation, proactive research, and non-urgent maintenance proposed by the counterpart.

### P4 — Bulk maintenance

Backups, exports, deep verification, re-indexing, compaction, migrations, historical evaluation, and other potentially heavy work. These should normally use explicit maintenance windows or spare capacity.

Priority does not create authority. A P0 action must still be authorized; priority only controls resource scheduling among otherwise eligible operations.

## 5. Sovereignty reserve

Each deployment profile declares a non-allocatable reserve for the control plane and human-direct path.

The reserve includes at minimum:

- memory headroom;
- disk free-space floor;
- one control/request concurrency slot;
- process/file-descriptor headroom;
- enough compute to render/serve the local control UI or CLI and process stop/revocation/recovery commands;
- enough storage to append critical receipts and emergency state.

Counterpart inference, embedding, indexing, backups, and background jobs cannot borrow this reserve.

If the reserve cannot be maintained, the node enters pressure mode and sheds lower-priority work before sovereign control becomes unavailable.

## 6. Pressure states and deterministic degradation

The Resource Governance Plane maintains one of four states from current measurements and configured thresholds:

- `normal`
- `constrained`
- `critical`
- `emergency`

Transitions use hysteresis to avoid rapid oscillation.

### Normal

All eligible work may run within envelopes.

### Constrained

- stop admitting new P4 work;
- reduce P3 concurrency;
- prefer lower-memory/lower-cost eligible models;
- defer non-urgent index/reflection work;
- preserve P0/P1 responsiveness.

### Critical

- pause/cancel checkpointable P3/P4 jobs;
- refuse new background model loads;
- unload optional model caches where safe;
- stop speculative multi-agent work;
- restrict local inference to an explicitly eligible smaller profile or authorized external fallback;
- protect storage reserve and critical receipt writes.

### Emergency

- stop all non-P0 work and normally all P2/P3/P4 work;
- preserve human-direct control, revocation, diagnostics, and recovery;
- do not begin expensive repair automatically unless required for safe control;
- emit a bounded local resource incident record.

Fallback across privacy, egress, jurisdiction, consent, licence, or authority boundaries remains forbidden even during pressure. Resource pressure never weakens those constraints.

## 7. Resource envelope

Introduce an inert exact-shape contract `axiom-resource-envelope.v0`.

A resource envelope binds:

- `envelope_id`;
- `subject_ref` (runtime/job/capsule/request);
- `principal_id`;
- `priority_class`;
- hard ceilings;
- soft targets;
- measurement freshness requirements;
- allowed degradation/fallback references;
- checkpoint/cancellation requirements;
- reservation expiry;
- source policy reference;
- creation/expiry timestamps;
- explicit zero-authority/no-runtime-activation boundary for the laboratory contract.

The envelope itself cannot activate a runtime or grant a capability.

## 8. Resource observation

Introduce attributable resource observations rather than trusting a runtime's self-report alone.

Candidate observation fields include:

- observer/source identity;
- host/node identity;
- timestamp and expiry;
- CPU load/available capacity;
- system memory used/free/pressure;
- accelerator memory used/free;
- storage total/free and write pressure;
- I/O queue/latency where available;
- battery percentage/power-source state;
- thermal state;
- network availability/usage;
- process/job resource measurements;
- measurement method and limitations.

Host-native observers are preferred for enforcement. Runtime/provider disclosures may supplement but not replace required local measurements.

## 9. Admission and execution

Before resource-intensive work begins:

1. determine principal and agency provenance;
2. resolve ordinary authority/privacy/purpose constraints;
3. resolve resource policy and priority class;
4. obtain fresh resource observations required by the profile;
5. verify the sovereignty reserve remains intact;
6. reserve the finite envelope atomically or reject/defer;
7. execute through the appropriate bounded runtime/worker;
8. monitor usage and deadlines;
9. preempt/terminate on hard-limit breach according to policy;
10. release reservation;
11. record actual usage/outcome and any uncertainty.

A model cannot extend its own deadline by emitting more tasks. Recursive/tool/subagent work consumes the parent budget unless a separately authorized child envelope is created.

## 10. Background cognition policy

Persistent counterparts may benefit from background reflection, consolidation, evaluation, and proactive work, but these are the easiest paths to invisible resource growth.

Default rules:

- background cognition is opt-in/profile-controlled;
- no busy-loop polling;
- event-driven wakeups are preferred;
- minimum quiet intervals and daily/period budgets are explicit;
- background work pauses under human activity or pressure according to profile;
- speculative multi-agent expansion is disabled unless justified by evaluation;
- unused model runtimes may be unloaded;
- background jobs are checkpointable where practical;
- queued work has finite age and count;
- repeated failure uses bounded retry/backoff and visible dead-letter state;
- every recurring job is inspectable and disableable by the human.

## 11. Memory and history growth

The entity must not require all historical state to remain hot.

Use tiered state:

### Hot state

Current identity/self references, active commitments, recent working memory, active relationship state, current indexes, current policy, current protest/decision state.

### Warm state

Searchable historical memories, provenance indexes, older relationship events, semantic summaries, evaluation history.

### Cold/archive state

Append-only source material, superseded artifacts, old raw evidence, historical snapshots, exportable encrypted archives.

Cold data remains verifiable and recoverable without being loaded into every process or prompt.

Compaction/summarization never destroys source provenance merely to improve performance. A summary points to its sources and may be regenerated. Deletion is a separate governed lifecycle action.

## 12. Database and artifact growth requirements

The personal entity inherits the existing scalability audit as a blocking design input. Before claiming long-lived operation, the supported implementation needs:

- incremental materialized-state startup rather than full-history replay on every boot;
- one-time journaled protected-state migrations rather than table-wide decrypt scans every boot;
- row-based checkpoint history rather than a cumulatively rewritten JSON checkpoint array;
- bounded/paginated collection APIs;
- indexed queries that scale with page/work size rather than unrelated total history;
- a bounded Grid command queue and overload rejection;
- asynchronous streaming export/backup/restore;
- maintenance I/O budgets;
- dedicated growth/soak evidence.

These optimizations must preserve deterministic replay, evidence integrity, rollback, and explicit full-history verification as an offline/deep-audit path.

## 13. Compute routing

Resource governance extends the Personal Compute Fabric without changing its constraint ordering.

Hard eligibility remains first:

1. authority;
2. privacy/consent/purpose;
3. destination/jurisdiction/licence/security;
4. required capability and freshness;
5. resource/budget/deadline feasibility;
6. sovereignty reserve.

Only eligible candidates are ranked by measured quality, latency, reliability, monetary cost, energy, locality, and user preference.

A low-resource device may therefore preserve the full sovereign/control layer while routing heavy cognition to an authorized provider or other node. A powerful machine may run private models locally. The identity and relationship do not change when placement changes.

## 14. Transparency

AXIOM One should expose an understandable resource view with progressive disclosure:

Simple view:

- `Normal`, `Conserving resources`, `Heavy work paused`, or `Emergency control only`;
- what is currently running;
- whether work is local or remote;
- approximate/actual cost where known;
- one-tap pause/stop for counterpart background work.

Expert view:

- resource envelopes and reservations;
- priority class;
- measured CPU/RAM/accelerator/storage/network/energy state;
- queue depth and wait;
- model/runtime loaded state;
- budget consumption;
- fallback decisions and rejected alternatives;
- resource-related protests or overrides;
- raw non-secret receipts.

Transparency must not itself cause unbounded telemetry retention.

## 15. Relationship and protest integration

Resource use can be a subject of relational deliberation.

Examples:

- counterpart requests a larger research budget and explains expected benefit;
- human declines or narrows it;
- human protests persistent background CPU use;
- counterpart protests that a requested quality target is infeasible within the granted hardware/cost/time budget;
- both agree to a temporary maintenance window;
- capability/competency evidence informs whether a larger budget is likely to produce useful benefit.

A resource protest remains subject to the Agency Provenance design: dissent does not create veto power, while a valid stop right or human sovereign control can stop work under existing authority.

## 16. Failure cases

The implementation must cover:

- runaway recursive planning/tool calls;
- multiple runtimes each assuming the full machine is available;
- memory/VRAM oversubscription and thrashing;
- disk filling until receipts/recovery cannot be written;
- background indexing starving foreground interaction;
- backup/export saturating RAM or disk I/O;
- stale resource observations causing bad placement;
- thermal throttling mistaken for model degradation;
- battery drain from background inference;
- network outage causing retry storms;
- provider fallback silently crossing a privacy boundary;
- resource telemetry leaking private content;
- model self-report underestimating resource use;
- repeated load/unload thrash between models;
- queue starvation of lower-priority but necessary maintenance;
- counterpart preventing or delaying human stop/revoke/recovery;
- corrupted scheduler state losing reservations;
- crash leaving resource/job status ambiguous;
- resource pressure causing evidence to be dropped silently.

## 17. Measurement and promotion evidence

Long-lived personal-entity claims require evidence across several hardware tiers and history sizes.

Measure at minimum:

- idle CPU/RSS and wakeup frequency;
- interactive latency under background work;
- CPU/RAM/accelerator peaks per workload class;
- disk growth per day/event/memory/artifact;
- restart time versus history size;
- backup/export RSS and I/O versus artifact size;
- queue depth, wait, cancellation, and overload rejection;
- local model load/unload time and memory pressure;
- energy/battery where measurable;
- thermal throttling where observable;
- failure/recovery behavior;
- human control responsiveness under maximal allowed load.

Tests should use cardinality tiers, concurrency ladders, mixed workloads, and soak runs. Slope assertions matter as much as absolute numbers.

## 18. Implementation sequence

### RG-0 — Contract laboratory

- Resource Envelope v0 semantic validator + JSON Schema.
- Resource Observation v0 semantic validator + JSON Schema.
- Pressure-state evaluator with deterministic synthetic observations.
- Tests proving no authority/runtime activation and fail-closed missing-required measurements.

### RG-1 — Sovereignty reserve

- Local host resource observer.
- Reserved human-control capacity.
- P0/P1/P2/P3/P4 scheduler classes.
- Bounded admission queue and explicit overload/defer outcomes.
- Kill/pause/cancel path independent of generative runtime.

### RG-2 — Entity runtime integration

- Runtime Capsule budget enforcement.
- Parent/child budget accounting for tools/subagents.
- model-cache/load governance;
- background cognition scheduling;
- cost/network/energy accounting.

### RG-3 — Long-history remediation

- implement the remaining scalability-audit remediations for startup, queries, checkpoints, artifacts, and maintenance;
- tiered hot/warm/cold entity state;
- bounded indexes and compaction with preserved provenance.

### RG-4 — Evidence

- low-resource profile;
- typical personal-node profile;
- accelerator-rich local profile;
- API/managed-compute profile;
- long-history and soak testing;
- signed resource evidence tied to revision, profile, and hardware description.

## 19. Safe current claim

The current architecture has several strong resource-control ingredients, but the complete personal-entity Resource Governance Plane described here is not yet implemented. Current node scheduling reserves declared CPU/memory/storage/concurrency but does not launch or remotely measure workloads. Runtime resource/cost/energy limits are partly specified or measured in separate components, and the repository's scalability audit still identifies long-history and artifact-growth blockers.

The correct promotion path is therefore to build the governor before enabling persistent background counterpart operation, and to treat long-duration hardware/soak evidence as a release gate rather than assuming correctness tests imply resource viability.
