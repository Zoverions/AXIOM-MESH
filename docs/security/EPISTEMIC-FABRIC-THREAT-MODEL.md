# Epistemic Fabric Threat Model

**Status:** Stage 5B design-gate security input; documentation-only; no implementation authority

**Date:** 2026-09-07

**Parent design:** `docs/superpowers/specs/2026-09-07-epistemic-fabric-stage5b-design.md`

## Security objective

Preserve a distributed, revisable evidence substrate without allowing provenance, consensus, model output, institutional status, or epistemic confidence to become an alternate AXIOM authority system.

The security boundary is stricter than ordinary document integrity:

```text
signed != true
verified object != authorized effect
consensus != truth
confidence != authority
```

All future runtime work remains subordinate to Gateway -> Hypervisor -> Sandbox -> Grid and existing deny-dominant policy.

## Assets

Protected assets include:

- exact source bytes and source hashes;
- source anchors and provenance lineage;
- claim/evidence object identity;
- revision ordering and append-only history;
- assessment attribution;
- unknown/contradiction state;
- prediction preregistration state;
- private evidence and disclosure boundaries;
- exact-effect mutation commitments;
- canonical head and replay state;
- resource ceilings;
- separation between epistemic state and execution authority.

## Adversaries

Assume malicious or compromised:

- external sources;
- authors or institutions;
- ingestion adapters;
- models and agents;
- federation peers;
- reviewers;
- high-reputation identities;
- operators with access to non-authority layers;
- coordinated Sybil populations;
- correlated models sharing training data or architecture.

Existing host/root and active signing-key compromise limits remain governed by the current-build threat model and are not silently solved by this design.

## Threats and required controls

### Provenance poisoning

**Threat:** false origin, attribution, or derivation is attached to a claim/evidence item.

**Controls:** exact source hashing, signed provenance, source-anchor verification, explicit lineage, append-only corrections, no truth inference from provenance alone.

### Source substitution

**Threat:** content at a URL or identifier changes while the epistemic object continues to imply the old bytes.

**Controls:** content-address acquired bytes; persistent acquisition timestamp and digest; new bytes create a new revision/source object.

### Citation laundering

**Threat:** one underlying study is repeated through many papers, reviews, articles, or model summaries and miscounted as independent evidence.

**Controls:** dependency/lineage graph, explicit independence state, `unknown` rather than optimistic independence.

### Sybil consensus

**Threat:** many controlled identities create apparent agreement.

**Controls:** agreement count is never canonical evidence weight; evidence lineage and scoped identity/credential context remain separate.

### Correlated model error

**Threat:** many models agree because they share training data, provider infrastructure, prompts, or architecture.

**Controls:** record model/version/run provenance and model-family/dependency context where known; do not treat model plurality as independent replication.

### Evidence-to-authority laundering

**Threat:** a highly supported claim is transformed directly into a capability or privileged effect.

**Controls:** epistemic artifacts are authority-neutral by construction; external effects require ordinary Mesh authorization.

### Semantic scope widening

**Threat:** evidence supporting a narrow population, time window, environment, or conditional claim is reused to support a broader proposition.

**Controls:** explicit claim scope, exact proposition binding, validation of support-edge applicability, no automatic universalization.

### Retraction suppression

**Threat:** a node serves superseded or withdrawn evidence without current status.

**Controls:** signed revision/retraction events, freshness policy, current-head checks, historical state remains available but not silently current.

### Malicious retraction

**Threat:** an attacker invalidates legitimate evidence through unauthorized retraction.

**Controls:** exact-object binding, scoped authority, current-head verification, append-only event history.

### Assessment capture

**Threat:** prestigious institutions, reviewers, or dominant agents become de facto truth authorities.

**Controls:** assessments are attributable views over evidence sets; institutional status is metadata, not universal truth authority.

### Contrarian capture

**Threat:** rejection, censorship, obscurity, or minority status itself becomes evidence for a claim.

**Controls:** rejection carries no automatic positive epistemic weight; reopening requires a changed evidence/assumption landscape or explicit review rationale.

### Historical rewriting

**Threat:** old assessments or evidence states are silently rewritten to make current conclusions appear inevitable.

**Controls:** append-only revisions/events; deterministic historical reconstruction; corrections through supersession/challenge/retraction.

### Prediction editing

**Threat:** forecasts are modified after outcomes are known.

**Controls:** preregistration digest and timestamp; post-outcome edits create a new prediction object and cannot replace the original.

### Cross-domain analogy attack

**Threat:** superficial similarity between domains is promoted into causal or structural equivalence.

**Controls:** cross-domain links remain proposal/candidate relationships until domain validation and, where possible, discriminating predictions.

### Private-data correlation attack

**Threat:** repeated bounded disclosures reconstruct protected identities or source data.

**Controls:** release/precision budgets where applicable, anti-correlation review, purpose-bound disclosure, minimum necessary projection, future cryptographic privacy mechanisms only when actually implemented.

### Stale-head mutation

**Threat:** a validly signed mutation is applied after the object/graph head changed.

**Controls:** exact prior revision/head binding and pre-commit head recheck; deny and recompute.

### Replay

**Threat:** a previously accepted mutation is replayed to restore stale state or duplicate an effect.

**Controls:** unique event IDs, nonce, exact prior revision, causation, freshness, canonical sequence/head, existing one-use/burn semantics where effects are involved.

### Reassessment cascade exhaustion

**Threat:** one source triggers unbounded recursive graph traversal/model work.

**Controls:** explicit traversal budgets, depth/cardinality ceilings, queue limits, model-call ceilings, bounded affected-set commitments, deferred/manual review when limits are reached.

### Ingestion flood

**Threat:** adversary sends large numbers of low-value sources/claims to consume storage/compute.

**Controls:** authenticated/rate-bounded ingestion profiles, resource envelopes, admission quotas, duplicate suppression, bounded parsing and object cardinality.

### Proposal-plane escape

**Threat:** model/agent output is written directly into canonical state.

**Controls:** hard proposal/canonical plane separation; canonical promotion requires independent validation and authority; schema validity alone is insufficient.

### Simulation escape

**Threat:** simulated epistemic or experiment work obtains production signing/network authority.

**Controls:** copy-on-write snapshots, no production signing keys, no live effect route, simulation receipt states authority effect `none`.

## Required negative tests

Before any E0/E1 implementation promotion, tests must demonstrate at least:

1. strong evidence cannot mint a capability;
2. direct model canonical write is denied;
3. stale-head mutation is denied;
4. post-signature affected-set widening is denied;
5. derivative citations are not counted as independent;
6. missing source bytes are never substituted by empty bytes;
7. malformed optional evidence fails validation rather than disappearing;
8. correlated consensus does not become truth;
9. rejected status alone does not increase support;
10. retraction triggers bounded reassessment while preserving history;
11. replayed mutations are denied;
12. preregistered predictions cannot be edited after outcome availability;
13. private evidence cannot be disclosed through an epistemic attestation without authority;
14. unsupported signed restrictions fail closed;
15. offline/self-reported locality cannot bypass a required external-status fact;
16. simulation cannot sign or publish a production mutation;
17. scope mismatch cannot silently create a support edge;
18. prior canonical states can be reconstructed consistently.

## Non-claims

This threat model does not claim that AXIOM-MESH currently implements the epistemic fabric, continuous ingestion, cross-domain discovery, private-evidence ZK proofs, autonomous experiment design/execution, or global federation.

It also does not supersede `docs/security/CURRENT-BUILD-THREAT-MODEL.md`. It is a Stage 5B extension that must be incorporated into the current-build model only when a corresponding implementation candidate exists.

---

## Amendment B threat delta — 2026-09-08

**Status:** owner-approved design threat delta only; no E2+ implementation authority; no change to E0/E1 schema bytes or PR #1563 authority.

Amendment B introduces additional failure modes that future E2/E4/E7 work must address.

### Scalar-collapse laundering

**Threat:** a multidimensional epistemic state is compressed into a single confidence, truth, reputation, quality, or priority score, and the scalar hides material weaknesses such as unverified dependencies, unknown independence, weak source alignment, or absent reproduction.

**Controls:** retain underlying dimensions; require explicit derivation profile for any scalar view; forbid aggregate views from overwriting base state; never let a scalar create canonical truth or effect authority.

### Verification-closure ambiguity

**Threat:** a result is labelled `verified` even though only the top-level artifact was checked while dependencies, libraries, cached objects, datasets, compiled binaries, or prior proof objects were reused without independent validation.

**Controls:** bind exact target, verifier/profile, environment, dependency-closure digest, freshly checked subset, reused subset, and replay status. Claims must not exceed the closure actually checked.

### Dependency shadowing

**Threat:** a verification record names dependencies abstractly while an attacker or accidental environment change substitutes different dependency bytes or versions.

**Controls:** content-address dependency identity, exact version/profile binding, environment digest, deterministic reconstruction where claimed, and fail closed on unresolved required dependency identity.

### Replay-depth spoofing

**Threat:** an agent or node self-declares a verification as independently reproduced without evidence of a separate actor/run/environment or without actually re-executing the relevant closure.

**Controls:** bind replay actor/run identity, inputs, environment, closure, outputs, and receipts/evidence where applicable; unknown independence remains unknown.

### Failed-route erasure

**Threat:** unsuccessful approaches, counterexamples, failed replications, or negative findings are silently discarded, causing agents to repeat dead ends or creating a biased history that overrepresents success.

**Controls:** append-only attributable failure provenance, explicit failure classes, resource/search metadata, and historical reconstruction including negative-search state.

### Failed-route poisoning

**Threat:** malicious agents inject fabricated failure records to discourage exploration of viable approaches or falsely claim that a route has already been exhausted.

**Controls:** exact run/artifact provenance, evidence-linked failure reason, independent replay when material, no automatic route exclusion from an unverified failure record, and explicit confidence/verification dimensions for the failure itself.

### Failure-to-falsification laundering

**Threat:** tool errors, budget exhaustion, timeout, unsupported methods, or inconclusive searches are represented as proof that a claim or approach is false.

**Controls:** closed failure taxonomy; logical refutation/empirical falsification kept distinct from inconclusive, operational, resource, and tooling failures; downstream consumers must not silently reinterpret classes.

### Continuation-packet authority smuggling

**Threat:** a research handoff contains or implies credentials, capabilities, grants, consent, budget permission, repository authority, network authority, experiment authority, or instructions treated as already authorized by the receiving node.

**Controls:** continuation packet schema remains authority-neutral; deny authority-bearing fields; strip no restrictions silently; receiving context performs fresh ordinary AXIOM authorization for any effect.

### Continuation-context substitution

**Threat:** a valid continuation packet is resumed against a different graph snapshot, target, dependency set, or evidence state while still presenting the work as a continuation of the original investigation.

**Controls:** content-address exact target, graph/snapshot, obligations, evidence references, and packet digest; mismatched continuation context creates a new derivation/packet rather than silently mutating identity.

### Frontier capture

**Threat:** one model, institution, sponsor, or optimization objective defines the `frontier` so that selected topics, methods, or hypotheses appear objectively most important.

**Controls:** frontier is a scoped derived view bound to explicit methodology/profile, source snapshot, resource horizon, and derivation digest; multiple legitimate frontier views may coexist; no universal frontier authority.

### Frontier-to-authority laundering

**Threat:** high frontier rank, novelty, expected information gain, or agent preference directly triggers spending, repository mutation, deployment, network activity, or experiment execution.

**Controls:** frontier output is proposal-only evidence. Any external effect traverses the ordinary Mesh authority path with fresh state, policy, resource, and consequence checks.

### Frontier feedback gaming

**Threat:** agents generate low-quality contradictions, unresolved obligations, or synthetic novelty to manipulate frontier ranking and attract compute/resources.

**Controls:** provenance-bound frontier derivation, duplicate/correlation controls, resource budgets, explicit evidence-state dimensions, no automatic resource grant, and auditable derivation from the exact underlying graph.

## Amendment B future negative-test requirements

These tests belong only to the separately gated future implementation slices; they do not modify E0/E1 acceptance criteria:

1. a scalar aggregate cannot erase or overwrite weaker/unknown underlying dimensions;
2. a high scalar score cannot mint canonical status or external-effect authority;
3. `verified` cannot be emitted without explicit target/verifier/closure semantics once the future verification contract requires them;
4. reused dependencies cannot be represented as freshly independently rebuilt;
5. changed dependency bytes invalidate exact verification identity;
6. self-declared replay cannot become independent reproduction without bound replay evidence;
7. failed routes remain present in historical reconstruction;
8. timeout/resource/tool failure cannot be reclassified as falsification;
9. fabricated/unverified failure provenance cannot automatically suppress a route;
10. continuation packets reject authority-bearing fields and credentials;
11. continuation import does not inherit sender authority;
12. packet reuse against a different graph snapshot cannot preserve the same continuation identity;
13. frontier output changes when the bound source snapshot/profile changes;
14. multiple scoped frontier views may coexist without global truth promotion;
15. frontier rank cannot directly invoke repository, network, spending, deployment, or physical effects.

## Amendment B non-claims

This threat delta does not claim implementation of evidence-state vectors, reproducibility closure, failure provenance, continuation packets, frontier computation, MAP/Lean ingestion, or autonomous mathematical/scientific research. It adds design constraints that future independently gated phases must satisfy.
