# Human, Entity, and Societal Fabric Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the first inert, testable contracts that connect agency provenance, human sovereignty, resource governance, persistent orientation, compute qualification, and dual human/agent capability discovery without enabling new external authority.

**Architecture:** Keep all v0 work as exact-shape deterministic contracts and local observers. No Gateway route, model invocation, runtime activation, network effect, or authority expansion is introduced by this plan. Build from the approved agency/resource specs, then add the smallest neutral interfaces required for later first-embodiment work.

**Tech Stack:** Node.js ESM, zero third-party npm dependencies, JSON Schema draft 2020-12, existing canonical/digest helpers and test patterns.

**Spec:** `docs/superpowers/specs/2026-08-31-entity-agency-provenance-human-baseline-design.md`; `docs/superpowers/specs/2026-08-31-personal-entity-resource-governance-design.md`; `docs/architecture/PERSISTENT-ORIENTATION-AND-TRIGGERED-COGNITION.md`; `docs/architecture/INTELLIGENCE-FABRIC-AND-COMPUTE-QUALIFICATION.md`; `docs/architecture/DUAL-SURFACE-CAPABILITY-SURFACES.md`

## Global Constraints

- Preserve `Gateway -> Hypervisor -> Sandbox -> Grid` for privileged/external effects.
- New v0 contracts are inert and must state zero authority/network/runtime activation.
- No personal/private corpus or credentials enter public fixtures.
- Node/npm/runtime policy remains repository-authoritative.
- Capability registry status changes only with executable evidence.
- Use TDD: failing semantic/schema tests before implementation.

---

### Task 1: Agency provenance / human baseline / deliberation contract parity

**Status:** implemented on `feat/entity-agency-provenance-v0`; focused local verification 14/14 green; repository CI pending at time of update.

**Files:**
- Create/modify focused validators under `mesh/src/lib/` following existing contract-validator conventions.
- Create schemas under `docs/architecture/contracts/`.
- Create focused tests under `mesh/test/`.

**Interfaces:**
- Produces deterministic `validate*()` + digest helpers for the three approved v0 records.
- No runtime/Gateway integration.

- [x] Write exact-shape failing tests for human-proxy, counterpart-voice, joint, worker-execution, protest, stop-right, and deliberation cases.
- [x] Run focused tests and confirm failure before implementation.
- [x] Implement minimal strict validators and canonical digests using repository-native helpers.
- [x] Add JSON Schemas mirroring semantic invariants, including `authority_effect=none`, `network_effect=none`, and `runtime_activation=false` where specified.
- [ ] Run focused tests plus full repository `npm test` on an authoritative checkout/CI.
- [x] Push as a reviewable semantic-contract slice.

### Task 2: Resource Envelope / Observation contract laboratory

**Files:**
- Create focused resource contract validators/schemas/tests.

**Interfaces:**
- Produces `axiom-resource-envelope.v0` and `axiom-resource-observation.v0` validation/digest primitives.

- [ ] Write failing tests for finite ceilings, priority class, expiry, missing required observations, child-budget inheritance metadata, and zero-authority semantics.
- [ ] Run focused tests and confirm failure.
- [ ] Implement minimal validators/digests.
- [ ] Add matching schemas and negative fixtures.
- [ ] Run focused + full tests.
- [ ] Commit.

### Task 3: Deterministic pressure evaluator and sovereignty reserve

**Files:**
- Create one focused pure module for pressure-state evaluation.
- Add tests using synthetic host observations.

**Interfaces:**
- Consumes validated resource observations/profile thresholds.
- Produces `normal|constrained|critical|emergency` plus deterministic allowed priority admissions.

- [ ] Write failing tests for threshold transitions, hysteresis, P0 preservation, P3/P4 shedding, storage reserve, and missing-measurement behavior.
- [ ] Implement pure deterministic evaluator with no model dependency.
- [ ] Verify no test path relaxes privacy/egress/authority.
- [ ] Run focused + full tests.
- [ ] Commit.

### Task 4: Persistent orientation / dormant obligation contract

**Files:**
- Create dormant-obligation validator/schema/tests.
- Create pure trigger-matching helper tests; no daemon/runtime.

**Interfaces:**
- Produces a durable intent record that requires normal re-admission when triggered.

- [ ] Write failing tests for trigger, expiry, authority scope, resource profile, provenance, restart serialization, and no automatic execution.
- [ ] Implement minimal contract + deterministic trigger match result.
- [ ] Prove trigger satisfaction returns a proposal/admission input, not execution authority.
- [ ] Run tests.
- [ ] Commit.

### Task 5: Capability Surface Registry v0

**Files:**
- Create documentation contract/schema and semantic checker.
- Add sterile entries only for the new specified families.

**Interfaces:**
- Links human presentation metadata and agent-facing contracts by capability ID without changing executable capability status.

- [ ] Write failing tests that reject unknown lifecycle values, missing non-claims, and any claim that discovery grants authority.
- [ ] Implement checker/schema.
- [ ] Add entries for agency, sovereignty, deliberation, resource, persistent orientation, compute/intelligence qualification as `specified/planned`, not implemented.
- [ ] Run docs/check/test gates.
- [ ] Commit.

### Task 6: Read-only host and intelligence inventory

**Files:**
- Add platform-specific read-only observer tooling outside the trusted kernel, with Windows coexistence first.
- Add fixture-based parser/classifier tests.

**Interfaces:**
- Produces observation reports only; no install, credential value, model invocation, firewall/startup change, or node admission.

- [ ] Write fixture tests for CPU/RAM/disk/GPU/WSL/tool presence and intelligence endpoint presence.
- [ ] Implement read-only observation adapters with secret-presence booleans only.
- [ ] Add explicit non-claims distinguishing installed UI/local effects/local orchestration/local inference.
- [ ] Run tests on synthetic fixtures; later execute on the first Windows coexistence host.
- [ ] Commit.

### Task 7: Compute/model qualification and router v0

**Files:**
- Create pure eligibility evaluator + tests.

**Interfaces:**
- Consumes compute-node observations, endpoint declarations, task constraints, cost/privacy/entitlement policy.
- Produces A/B/C/D/E/F/U eligibility and ranked eligible candidates; never execution authority.

- [ ] Write failing tests proving hard filters precede quality/cost ranking.
- [ ] Cover insufficient memory, unknown accelerator support, privacy mismatch, entitlement absence, cost ceiling, provider outage, and local fallback.
- [ ] Implement minimal pure evaluator.
- [ ] Verify no route can self-grant entitlement/resource/authority.
- [ ] Run tests.
- [ ] Commit.

### Task 8: Genesis Boot proof harness (sterile)

**Files:**
- Add a synthetic/inert proof harness and fixtures only after Tasks 1-7 are green.

**Interfaces:**
- Demonstrates persistent identity state + runtime swap + dormant obligation continuity + resource-pressure preservation using fake runtimes.

- [ ] Write failing end-to-end synthetic test: runtime A -> checkpoint -> stop -> runtime B -> same entity/authority -> trigger -> bounded admission proposal -> sleep.
- [ ] Add counterpart-disabled human-direct proof.
- [ ] Add abundance-invariance proof: larger compute envelope changes eligible cognition, not authority.
- [ ] Implement minimal synthetic harness.
- [ ] Run full `npm test`, `npm run check`, and `npm run release:verify`.
- [ ] Commit with explicit non-production claim.

### Task 9: Documentation synchronization and review gate

**Files:**
- Update owning roadmap/status/product/README links only to reflect what Tasks 1-8 actually achieved.

- [ ] Re-run capability/status generation and verify no accidental promotion.
- [ ] Update architecture links, master todo states, threat-model references, and release non-claims.
- [ ] Search for contradictory `implemented`/`production` language.
- [ ] Run docs and release gates.
- [ ] Request independent review before merge.
