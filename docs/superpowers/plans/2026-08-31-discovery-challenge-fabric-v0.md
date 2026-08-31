# Discovery & Challenge Fabric v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repository-local, zero-authority Discovery & Challenge Fabric v0 that validates provenance-aware findings, preserves contradiction and uncertainty, decomposes causal suspicion, records blindspots and architecture impacts, and requires a separate review disposition before consequential follow-on work.

**Architecture:** One dependency-free ESM contract module plus five closed JSON Schema 2020-12 mirrors and deterministic fixtures. DCF records may describe and propose; they cannot browse, invoke models, access credentials, write memory, mutate GitHub, alter policy, promote capabilities, or enter the Gateway -> Hypervisor -> Sandbox -> Grid execution path.

**Tech Stack:** Node.js ESM, Node built-in `node:test`, existing `canonical.mjs` validation/digest helpers, JSON Schema 2020-12.

**Spec:** `docs/superpowers/specs/2026-08-31-discovery-challenge-fabric-v0-design.md`

**Epistemic addendum:** `docs/superpowers/specs/2026-08-31-discovery-challenge-fabric-v0-epistemic-addendum.md`

## Global constraints

- Node remains `>=22.23.2 <23 || >=24.14.0 <25`.
- `mesh/config/capabilities.json` remains authoritative and unchanged by v0.
- All DCF objects retain zero authority; Architecture Impact remains `not-authorized`.
- Source class, evidence strength, claim confidence, novelty, review state, and architecture impact remain separate.
- Raw source count is never independent-lineage count.
- Negative evidence, contradiction, and unresolved references remain first-class.
- `private-security` material is excluded from public sample outputs.
- Suspicion remains a research trigger: beneficiary is not perpetrator; preparation is not causation; post-event exploitation is not event engineering.
- No watcher, source connector, model call, browser UI, autonomous repository mutation, live Composition Authority, or memory-semantics change is part of v0.

---

### Task 1 — Contract and schema surface

**Files:**
- `mesh/src/lib/discovery-challenge-fabric.mjs`
- `mesh/test/discovery-challenge-fabric.test.mjs`
- `mesh/test/discovery-challenge-fabric-schema.test.mjs`
- five schemas under `docs/architecture/contracts/`

- [x] Write missing-surface tests first.
- [x] Observe protected-CI RED caused specifically by missing module/schema files.
- [x] Add minimal fail-closed exports and hard-boundary schema surfaces.
- [ ] Register the five schemas and approved DCF docs in the supported documentation boundary.
- [ ] Observe GREEN for the surface-only checkpoint before adding validator behavior.

### Task 2 — Semantic validation and epistemic decomposition

**Interfaces to implement:**
- `validateDiscoverySourceEnvelope(source)`
- `validateDiscoveryInsightCandidate(candidate)`
- `validateBlindspotRecord(record)`
- `validateArchitectureImpactRecord(record)`
- `validateDiscoveryReviewDisposition(disposition)`
- `summarizeSuspicionDecomposition(candidate)`

- [ ] Write failing tests for all required fields, closed vocabularies, timestamps, digests, duplicate rejection, no input mutation, and all hard boundaries.
- [ ] Write failing tests for `suspicion_decomposition` lanes: `observation`, `incentive`, `capability`, `opportunity`, `preparation`, `response`, `causation`.
- [ ] Prove that supported incentive/preparation/response never automatically upgrades unknown causation.
- [ ] Preserve `adversarial_openness`: strongest support, strongest opposition, best alternative explanation, disconfirming evidence sought, prediction/test, framing risk, confidence update.
- [ ] Preserve hypotheses/open questions when causation is unknown rather than rejecting or upgrading them.
- [ ] Implement only enough validator behavior to make those tests green.
- [ ] Expand JSON Schema mirrors to match the semantic contracts.

### Task 3 — Source lineage and bundle integrity

**Interfaces:**
- `discoverySourceDigest(source)`
- `countIndependentSourceLineages(sources)`
- `validateDiscoveryBundle(bundle, repositoryIndex = null)`

- [ ] Add formal, empirical, derivative, negative-result, blindspot, impact, and disposition fixtures.
- [ ] RED: derivative sources sharing an explicit upstream lineage count as one independent lineage.
- [ ] RED: duplicate IDs, unresolved record references, self-corroboration, and false lineage counts fail closed.
- [ ] GREEN: build explicit connected components from source IDs/upstream refs only; do not infer lineage from domain, text similarity, publisher reputation, or model output.
- [ ] Architecture references remain descriptive; unresolved requirement/path refs are returned explicitly, never treated as successful coverage.
- [ ] Return only frozen zero-authority bundle summaries; no ranking, truth score, recommendation, or execution decision.

### Task 4 — Static no-effect boundary

**File:** `mesh/test/discovery-challenge-fabric-boundary-static.test.mjs`

- [ ] RED/GREEN a static test permitting only the canonical helper import and rejecting filesystem, network, subprocess, provider/runtime, credential, wallet, secret, Grid/Gateway/Hypervisor/Sandbox, MCP/A2A, and `fetch` surfaces.
- [ ] Assert bundle summaries retain `authority_effect: none`, `runtime_effect: none`, `capability_promoted: false`, and `repository_mutated: false`.

### Task 5 — Blindspot Register and normative integration

**Files:**
- `docs/architecture/blindspots/README.md`
- `docs/architecture/blindspots/BLINDSPOT-REGISTER.v0.json`
- `docs/rebuild/REQUIREMENTS.md`
- `docs/README.md`

- [ ] Add public-safe examples for memory-authority laundering, protocol-composition ownership, trusted-domain/download confusion, negative evidence, and causal suspicion with unresolved perpetrator.
- [ ] Prove the register contains no `private-security` source.
- [ ] Add `DISC-01` through `DISC-08` covering provenance intake, separated epistemic dimensions, lineage-aware corroboration, negative evidence, descriptive architecture refs, explicit Review Disposition, no autonomous effects, and public-register safety.
- [ ] Add `DISC-09`: causal suspicion MUST preserve observation/incentive/capability/opportunity/preparation/response/causation separately and MUST NOT infer causation from benefit, preparedness, or exploitation alone.
- [ ] Add narrow docs links with explicit non-claims: approved zero-authority research/proposal substrate, not a live autonomous radar.

### Task 6 — Full verification and merge decision

- [ ] Run protected Clean Kernel, Node 22, container, Windows, and any normal macOS compatibility jobs on the exact final PR head.
- [ ] Confirm `mesh/config/capabilities.json` has no DCF capability promotion.
- [ ] Review changed-file scope for accidental runtime, policy, credential, provider, network, or UI effects.
- [ ] Inspect failures causally; add a regression test before fixing any code defect.
- [ ] Keep PR draft until all v0 semantics and docs are complete.
- [ ] Merge only after fresh green exact-head verification and then verify the resulting `main` merge commit before claiming integration complete.

## Deferred follow-ons requiring separate approval

1. Repository-local architecture index beyond caller-supplied indexes.
2. Read-only source connectors/network ingestion.
3. Model-assisted extraction/comparison.
4. Incident Backpropagator that drafts tests.
5. Axiom One Trust Center / Radar UI.
6. Composition Lab for MCP + A2A + OAuth/provider/device combinations.
7. Memory Authority Kernel changes.
8. Continuous TPM/TEE/runtime attestation.
9. Automated issue/branch/RFC/PR creation.
10. Any capability-registry entry or promotion.

The v0 success condition is deliberately narrow: **AXIOM can represent, validate, challenge, and review a blindspot—including a suspicious causal hypothesis—without allowing discovery or suspicion to become an authority system or a truth shortcut.**
