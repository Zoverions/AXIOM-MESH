# Axiom Science v0 Design

**Status:** owner-approved design; S0 implementation authorized for reviewed integration; no activation or production authority

**Date:** 2026-09-17

**Issue:** #1605

**Current base:** current `main`; Research Capsule v0 (#1603) and Research Composition Graph v0 (#1636) are merged substrates

**Purpose:** define the smallest science-domain layer that can support increasingly autonomous research while preserving AXIOM's existing epistemic, authority, consent, provenance, privacy, and effect boundaries.

**External triggers:** Guo et al., “Toward autonomous science with agentic artificial intelligence,” *Cell* (2026), DOI `10.1016/j.cell.2026.08.052`; Felin and Holweg, “Theory Is All You Need: AI, Human Cognition, and Causal Reasoning,” *Strategy Science* (2024), DOI `10.1287/stsc.2024.0189`; Miao et al., “Reimagining research papers as interactive and reliable AI agents,” *Nature* (2026), DOI `10.1038/s41586-026-11044-y`; and the September 17 `1kpapers`/Jev heterogeneous research-classification workflow captured on #1605.

**Builds on:**

- `docs/superpowers/specs/2026-09-07-epistemic-fabric-stage5b-design.md`;
- `docs/superpowers/specs/2026-09-16-agent-native-research-artifacts-v0-design.md` merged through #1603;
- `mesh/src/lib/research-composition-graph.mjs` merged through #1636 for zero-authority research lineage, contradiction, reproduction, and attention views;
- `docs/rebuild/AGENT-INTEROPERABILITY-AND-CAPABILITY-SUBSTRATE.md` and `Knowledge -> Operation -> Authority`;
- the existing `Gateway -> Hypervisor -> Sandbox -> Grid` authority path;
- machine principals, consent, exact-effect authorization, receipts, selective disclosure, recovery, and plural-authority/Circle architecture.

This design creates no second epistemic engine, no second authority engine, no autonomous truth service, no experiment authority, and no new production capability.

---

## 1. Architectural decision

Axiom Science is a **thin domain layer** over existing AXIOM primitives.

```text
Research Capsule / exact source provenance
              |
              v
        Epistemic Fabric
 sources / claims / evidence
 assessments / unknowns / relationships as later phases add them
              |
              v
        Axiom Science
 study envelope / experiment proposal
 science-specific profiles and workflow semantics
              |
              v
    existing AXIOM authority path
 principal / policy / consent / exact effects
              |
              v
 Gateway -> Hypervisor -> Sandbox -> Grid
              |
              v
 receipts / evidence / append-only lineage
```

The governing doctrine is:

> **Scientific autonomy is not scientific authority.**

An agent may be capable of choosing a method, drafting an experiment, interpreting a result, or operating a tool without acquiring permission to perform any consequential effect.

### Alternatives rejected

**Expand Research Capsule v0 into autonomous science:** rejected because #1603 is deliberately a zero-authority provenance/evidence substrate.

**Put science semantics directly into Epistemic Fabric:** rejected because the Fabric must remain domain-neutral.

**Chosen:** a thin science domain consuming Research Capsule, Epistemic Fabric, and ordinary AXIOM authority without replacing any of them.

---

## 2. Hard invariants

1. **Scientific autonomy is not scientific authority.** Capability, model quality, tool access, or prior success grants no permission.
2. **Knowledge is not authority.** Sources, claims, reviews, and consensus do not mint runtime authority.
3. **Operation is not authority.** A method, notebook, workflow, MCP tool, or instrument command remains inert until separately authorized.
4. **Provenance is not correctness. Extraction is not endorsement.** Exact source preservation does not certify a source statement.
5. **Reproduction is not truth.** A replay establishes only the exact closure reproduced.
6. **Execution success is not epistemic validation.** A completed experiment or computation does not establish its interpretation by itself.
7. **No self-promotion of claims.** A proposer/executor may emit an assessment, but it remains attributable to the same lineage and cannot masquerade as independent validation or global establishment.
8. **Negative knowledge is first-class.** Failed, falsifying, inconclusive, excluded, superseded, and contradicted work remains attributable and append-only.
9. **Unknown remains unknown.** Missing independence, provenance, applicability, calibration, or validation is never inferred as favorable.
10. **Scientific decisions do not mint effect authority.** Peer review, Circle votes, publication, citation count, or institutional status may inform policy but cannot create a capability/grant.
11. **Private evidence remains private unless separately disclosed.** Research participation does not imply blanket data release.
12. **No second canonical engine.** Science composes existing canonicalization, Epistemic Fabric, Research Capsules, and Mesh authority/receipt paths.
13. **No global truth primitive.** Scoped assessments may exist; `global_truth = true` or scalar-threshold equivalents do not.
14. **Currentness matters.** Source, code, model, dataset, protocol, environment, instrument calibration, and policy drift may narrow prior applicability.
15. **Typed model output is not truth or permission.** Typed outputs remove parsing ambiguity; they remain probabilistic judgments whose use must be calibrated.

---

## 3. Reuse before invention

Current `main` already implements the Epistemic Fabric E0/E1 proposal-only `Source`, `Claim`, and `Evidence` contracts. `Assessment`, `Unknown`, generic `Relationship`, contradiction mutation, and canonical epistemic admission remain later phases. Axiom Science must not pretend those future primitives are implemented.

The target mapping is:

| Scientific concept | AXIOM representation |
|---|---|
| paper/dataset/source | implemented Epistemic `Source` + Research Source Manifest |
| scientific proposition | implemented Epistemic `Claim` |
| hypothesis | implemented `Claim` with `claim_kind: hypothesis` plus science-domain references |
| observation/result evidence | implemented Epistemic `Evidence` plus exact run/reproduction artifacts |
| research question | future Epistemic `Unknown` profile; until then referenced as bounded study text/digest, not a competing generic object |
| critique/interpretation | future Epistemic `Assessment` profile |
| semantic classifier output | future `Assessment` Research Judgment profile |
| contradiction | future Epistemic relationship/contradiction semantics |
| replication assessment | future `Assessment` profile plus multidimensional independence vector |
| correction/retraction | append-only revision/currentness events; never silent rewrite |

The first Axiom Science implementation therefore adds only science-specific objects that are not already represented by E0/E1.

### Theory and causal inquiry direction

The Felin/Holweg theory-versus-prediction distinction is treated as a design input, not as a permanent claim that only humans can form theories. Axiom Science should make the scientific reasoning loop explicit enough to inspect and challenge:

```text
observation / source evidence
        ↓
defeasible causal theory or hypothesis
        ↓
predicted consequences
        ↓
discriminating test or experiment proposal
        ↓
separately authorized execution, if any
        ↓
new evidence / negative result
        ↓
reassessment, contradiction, revision, or supersession
```

The important separation is **evidence != theory != prediction != authority**. A theory may explain existing observations and generate expectations about evidence that does not yet exist. An Experiment Proposal may encode a discriminating test, but it remains inert until the normal AXIOM authority path separately permits its effects.

S0 does not add a generic `Theory`, `Prediction`, or `CausalModel` contract. Hypotheses continue to use Epistemic `Claim`; provenance/evidence continue to use Research Capsule and Epistemic objects; lineage, support, contradiction, reproduction, and negative results reuse Research Composition Graph v0. Science-specific predicates such as `predicts`, `discriminates_between`, or causal-intervention semantics require a fresh bounded contract design rather than overloading existing relation meanings.

This makes causal inquiry a knowledge-plane process that can be highly autonomous while preserving the existing rule that scientific reasoning cannot mint execution permission.

---

## 4. Science Study v0

A **Science Study** is a zero-authority organizational envelope that binds the scientific work together without becoming a truth or execution object.

Its first contract must bind at least:

```text
schema
study_id
purpose
question_digest
scope
population_or_domain_constraints[]
participant_principal_refs[]
methodology_refs[]
source_manifest_digests[]
epistemic_object_refs[]
disclosure_policy_refs[]
preregistration_refs[]
created_at
study_digest
authority_effect = none
```

All arrays are bounded. References are inert identifiers/digests. A Study grants no execution, disclosure, publication, spending, or canonical epistemic authority.

---

## 5. Experiment Proposal v0

An **Experiment Proposal** describes a potential scientific operation before authority exists.

Its first contract must bind at least:

```text
schema
experiment_proposal_id
study_digest
question_digest
hypothesis_claim_refs[]
operation_candidate_refs[]
protocol_refs[]
declared_inputs[]
declared_outputs[]
data_classes[]
environment_requirements[]
instrument_requirements[]
network_requirement
filesystem_requirement
credential_requirement
spend_requirement
declared_effect_classes[]
safety_constraint_refs[]
stopping_conditions[]
analysis_plan_ref
proposed_execution_principal
created_at
proposal_digest
execution_authority = none
authority_effect = none
```

The proposal may reference a Research Operation Candidate from #1603 but cannot activate it. It contains no portable grant and no hidden approval.

---

## 6. Research graph semantics

Axiom Science is a graph composed from existing/future epistemic objects plus the two science-specific v0 envelopes.

```text
ScienceStudy
    |
    +--> question digest / later Unknown
    |          |
    |          v
    |       Claim / Hypothesis
    |          |
    |          v
    |    prior Source/Evidence
    |          |
    |          v
    +--> ExperimentProposal
               |
               +----> separate authority request
               |            |
               |            +---- denied/expired -> provenance only
               |
               v
          authorized effect
               |
               v
  ordinary receipts + run/reproduction artifacts
               |
               v
      Epistemic Evidence / Claim
               |
               v
 future Assessment / critique / replication
```

Axiom Science v0 does **not** create a new `ExperimentRunEvidence` canonical object. Computational reproduction already has Research Reproduction Evidence in #1603, and generic observations/results belong in Epistemic `Evidence`. Future physical/institutional execution may justify a separate run profile only after an execution-phase design proves that existing evidence/receipt contracts are insufficient.

---

## 7. Claim-to-evidence lineage

A scientific conclusion must remain traversable to the evidence and derivations offered for or against it.

The target lineage is:

```text
Claim
  -> future Assessment(s)
  -> analysis artifact/source references
  -> Epistemic Evidence
  -> reproduction/run artifact
  -> exact protocol / code / data / model / environment
  -> authority/effect receipts where execution occurred
```

Analysis is represented through source/evidence artifacts and methodology references unless a later design demonstrates a genuinely missing domain primitive. Axiom Science v0 must not create an `Analysis Record` merely to duplicate existing Source/Evidence semantics.

The system distinguishes unsupported prose, source statements, model inference, measured observation, analyzed evidence, and independent critique without requiring that every claim become machine-proven.

---

## 8. Scientific state is scoped assessment, not a truth lifecycle

Axiom Science must never introduce:

```text
hypothesis -> proven -> true
```

When the Epistemic Fabric later implements `Assessment`, science profiles may express evaluator-relative dispositions such as:

- `supports_within_scope`;
- `weakens_within_scope`;
- `falsifies_within_scope`;
- `inconclusive`;
- `not_applicable`;
- `contested`;
- `methodologically_invalid`;
- `insufficient_evidence`.

Each assessment binds evaluator, evidence set, methodology/profile, claim scope, currentness, limitations, and provenance. Different legitimate assessments may coexist. A user-facing view may derive “currently supported under profile X”; that derived view never becomes global truth.

---

## 9. Heterogeneous model pipeline

Axiom Science should assume different stages are best served by different models, algorithms, or deterministic tools.

The `1kpapers`/Jev workflow is useful evidence for this architecture: one model summarized papers and a specialized System One model performed typed topic classification. The reported cost/latency is external benchmark evidence, not an AXIOM invariant or quality guarantee.

Target pattern:

```text
exact source bytes / source manifest
        |
        v
deterministic extraction where possible
        |
        v
source-bounded summary / knowledge projection
        |
        v
fast typed semantic judgments
        |
        +--> confident + low consequence -> code consumes result
        |
        +--> uncertain / high consequence -> deeper evaluator / human review
        |
        v
selective reasoning / critique / synthesis
        |
        v
deterministic verification where available
        |
        v
Epistemic Fabric + Science graph
```

Routing may consider cost, latency, quality, privacy, context length, specialization, calibration, and current availability. Routing grants no effect authority.

---

## 10. Research Judgment future profile

Jev/System One or comparable typed semantic outputs belong in a **future profile over Epistemic `Assessment`**, not a new v0 truth object. Because `Assessment` is not yet implemented on current `main`, Axiom Science S0 must not add a competing canonical Research Judgment schema.

The future profile must bind at least:

```text
input/source digest
question/taxonomy/profile digest
provider/model/version or evaluator identity
typed answer/distribution
confidence/calibration metadata
created_at
currentness/expiry
evaluation profile/reference
downstream-use class
judgment digest
```

Downstream-use classes should include:

```text
discovery_only
routing_only
ranking_only
epistemic_proposal
requires_review
```

No class carries runtime authority.

Appropriate uses include topic/domain classification, method/evidence-shape classification, relevance/reranking, source/specialist routing, resource-only vs operation-bearing routing, candidate contradiction/replication prioritization, and uncertainty detection.

Inappropriate final roles include scientific truth, evidence independence, consent, execution authority, consequential effect classification where deterministic evidence exists, independent-replication declaration, or publication as established fact.

### Cascade rule

Low-confidence or high-consequence semantic judgments escalate to a stronger evaluator or human/scientific review. Thresholds are application-specific and must be evaluated on target-domain outcomes; vendor/demo thresholds are not universal policy.

### Reuse rule

A judgment may be reused only when its exact input digest, question/profile digest, evaluator/model version, and relevant currentness conditions remain applicable. Reuse remains visible in provenance.

---

## 11. Reproducibility closure

A reproduction claim may not exceed the closure actually replayed.

Future reproduction/replication evidence must expose, as applicable:

- exact claim/target digest;
- source/paper version;
- code revision;
- data/sample digest;
- model/checkpoint or exact provider/model version;
- prompt/configuration/profile digest;
- dependency/lockfile/SBOM closure;
- execution environment/container/runtime;
- instrument identity and calibration state;
- protocol version;
- analysis harness/version;
- stochastic policy/seed where meaningful;
- dependencies freshly rebuilt versus reused;
- independent replay identity;
- comparison/tolerance method;
- result and limitations.

Cached dependencies, common datasets, shared model checkpoints, or shared harnesses remain visible rather than disappearing behind a successful result.

---

## 12. Replication independence is multidimensional

A future Replication Assessment must not reduce independence to a boolean or scalar.

It must expose whether the work is `same`, `different`, or `unknown` for at least:

- source data;
- study population/sample;
- code/implementation;
- model/checkpoint;
- dependency/environment;
- protocol;
- instrument/lab;
- operator/research team;
- analysis harness;
- source/evidence lineage;
- funding/sponsor where methodology makes it relevant.

Unknown independence remains unknown. Any scalar summary is derived view state only and cannot replace the vector.

This profile waits for the Epistemic Fabric `Assessment` phase rather than creating a parallel v0 assessment object.

---

## 13. Negative knowledge and long-running research

Axiom Science preserves successful, falsifying, inconclusive, null, excluded, failed-tool, failed-environment, resource-exhausted, protocol-deviating, scope-mismatched, safety-denied, duplicate, and abandoned routes with their exact reasons.

A failure is not automatically a falsification.

Long-running agents should reuse the Epistemic Fabric continuation-packet architecture. A science continuation packet may carry unresolved targets, graph/snapshot references, attempted routes, counterexamples, open evidence obligations, experiment proposals, resource expenditure, remaining search budget, and provenance.

Continuation packets carry **knowledge/proposals only**. They never transfer credentials, consent, spending, experiment, network, repository, instrument, or publication authority.

---

## 14. Science Circles

Research groups are a natural future Circle profile: human researchers, research agents, critique agents, analysts, data custodians, lab/instrument service principals, external replicators, and auditors may coordinate shared study state while retaining independently owned node state.

Circle proposals, votes, reviews, or publication decisions remain governance/evidence state. They do not mint Sandbox/Grid authority. Explicit shared projections cross the Circle boundary; private state remains private unless separately disclosed.

---

## 15. Privacy, human subjects, and publication

Autonomous science must not become a reason to centralize raw participant data.

Sensitive research state remains under its sovereign/domain boundary. Purpose and disclosure are separately authorized. Derived evidence does not imply permission to reveal raw inputs. Aggregate research should use the privacy-preserving collective-intelligence substrate where applicable, and audit evidence must not become a secondary identity-correlation database.

This design does not claim legal/ethics-board compliance, clinical-trial authority, biosafety approval, or human-subject authorization. Future institutional adapters may represent such approvals but cannot fabricate them.

Publication is an external effect and provenance event, not a truth transition. Future publication must separately bind exact artifact/version, submitting principal, destination, disclosure policy, authorship assertions, applicable approval/consent, authority, and receipt. Peer review, acceptance, correction, concern, retraction, and supersession remain append-only provenance/currentness events or assessments.

---

## 16. Fail-closed semantics

| Condition | Required result |
|---|---|
| invalid science-domain schema | reject |
| missing provenance | stage/deny admission |
| missing authority for consequential experiment | deny execution |
| semantic uncertainty | retain probability/uncertainty; escalate per profile |
| typed judgment conflicts with deterministic evidence | deterministic property follows deterministic evidence/policy; preserve conflict |
| stale source/code/model/environment | historical evidence remains; current applicability narrows |
| unknown replication independence | remain `unknown` |
| successful run with failed analysis | preserve run evidence; no claim promotion |
| failed run due to tooling | record tool failure; do not call hypothesis falsified |
| private evidence lacks disclosure authority | deny disclosure |
| Circle/committee approval lacks runtime grant | no execution authority |
| proposal contains undeclared effects | deny until corrected and separately authorized |
| historical negative result is rewritten | deny mutation; append correction/supersession only |

---

## 17. Threat classes

Future Axiom Science work must test at least:

- source/paper prompt injection;
- provenance or publication-prestige laundering;
- model-confidence laundering;
- reproduction-to-truth laundering;
- execution-success-to-truth laundering;
- semantic-classifier-to-authority laundering;
- correlated-agent agreement masquerading as independence;
- shared data/code/model masquerading as independent replication;
- selective reporting / failed-run deletion;
- post-outcome preregistration mutation;
- analysis-profile switching without provenance;
- stale model/environment/instrument state;
- private-data exfiltration through research outputs;
- tool metadata lying about effects;
- resource exhaustion;
- continuation-packet authority smuggling;
- Circle governance bypassing local non-waivable protections;
- publication without disclosure/authority.

Recording these threat classes authorizes no dangerous experimental execution or operational red-team activity.

---

## 18. Resource and cost controls

Future executable research must carry finite budgets for applicable dimensions: inference spend, tokens/context, retrieval/fetch count, storage, CPU/GPU time, wall time, attempts, instrument time, external APIs, network destinations, and human-review requests.

Unknown consequential resource dimensions fail closed rather than becoming unlimited.

Fast semantic models may reduce routine cost. Cost optimization never reduces evidence, privacy, safety, or authority requirements.

---

## 19. Exact S0 implementation boundary

The first implementation slice is **zero-authority, network-free, provider-free, and execution-free**.

It may add only:

1. `Science Study v0` inert JSON Schema;
2. `Experiment Proposal v0` inert JSON Schema;
3. one zero-dependency semantic verifier for those two contracts using the repository's existing canonicalization/validation discipline;
4. synthetic fixtures composing the new contracts with the already-implemented Epistemic `Source`/`Claim`/`Evidence` contracts and the merged Research Capsule v0 contracts;
5. focused tests proving authority neutrality, boundedness, exact digest/currentness behavior, and no second canonical engine;
6. canonical documentation/index/checker registration.

S0 must **not** add `Assessment`, `Unknown`, `Relationship`, Research Judgment, Replication Assessment, a new generic run-evidence type, or another Claim/Evidence contract. Those wait for their corresponding Epistemic Fabric phases or a fresh design proving a missing primitive.

S0 must not add autonomous fetching, live ingestion, remote MCP/tool connections, provider credentials, package installation, subprocess/container execution, production model routing, physical/wet-lab/clinical execution, spending/procurement, publication, Gateway routes, capability-registry changes, network widening, autonomous truth adjudication, or production promotion.

---

## 20. S0 acceptance requirements

A future implementation proposal must prove at minimum:

1. Science Study and Experiment Proposal cannot mint capabilities, consent, grants, or execution authority.
2. Current Epistemic `Source`/`Claim`/`Evidence` contracts are reused rather than duplicated.
3. Research Capsule objects are referenced rather than copied into a second canonical graph.
4. `Claim claim_kind: hypothesis` is reused rather than inventing a Hypothesis schema.
5. Missing future `Assessment`/`Unknown` functionality is not simulated by misleading substitute truth objects.
6. An Experiment Proposal remains valid provenance after denial/expiry but cannot execute.
7. Undeclared/unknown consequential requirements fail validation or remain explicitly unknown; they never imply permission.
8. Exact study/proposal inputs and references are digest-bound and bounded.
9. No semantic-confidence field can grant authority or establish truth.
10. No first-slice module performs provider I/O, network I/O, subprocess execution, production filesystem mutation, Grid mutation, or capability mutation.
11. Clean-kernel, documentation, supported-platform, and security-boundary verification remain intact.

---

## 21. Migration path

Axiom Science advances through independent gates:

**S0 — domain contracts:** Science Study + Experiment Proposal only; inert fixtures/verifier/tests.

**S1 — causal inquiry projection:** owner-local science projection over merged Research Composition Graph v0, preserving competing hypotheses, predictions/test proposals, support, contradiction, negative results, and unresolved state without creating a second graph or external effects.

**S2 — bounded semantic pipeline:** provider-backed summarization/classification/routing only after provider authority, exact provenance, budgets, evaluation/calibration, and the generic Assessment substrate exist or a fresh compatible profile is approved. Outputs remain epistemic proposals/assessments.

**S3 — computational reproduction sandbox:** separately authorized disposable execution of specifically admitted low-consequence computational operations; exact effect/environment receipts; no physical lab authority.

**S4 — Science Circle pilot:** low-consequence multi-principal collaboration over shared projections, critique, replication, objections, and export.

**S5 — controlled continuous ingestion:** bounded feeds create source manifests, knowledge projections, semantic proposals, and reassessment proposals; continuous ingestion still stops before effects.

**S6 — autonomous research planning:** agents maintain continuation/frontier state and propose experiments under explicit budgets; planning autonomy remains distinct from execution authority.

**S7 — physical/institutional adapters:** only after independent designs, threat models, legal/institutional review, and fresh authority gates. No approval is inherited from S0-S6.

---

## 22. Claim boundary

Approval of this design means only that Axiom Science should be developed as a thin, provenance-preserving, authority-neutral scientific domain over the existing Mesh architecture.

It does **not** establish autonomous scientific discovery, scientific truth determination, continuous ingestion, production semantic-model routing, laboratory automation, clinical/human-subject authorization, remote research-agent execution, publication authority, independently validated replication, or production Axiom Science capabilities.

The intended direction is:

> **Let research agents become increasingly autonomous in discovery, planning, analysis, and collaboration while making evidence, provenance, uncertainty, resource use, and authority boundaries more explicit—not less.**

The durable efficiency rule is:

> **Fast semantic judgment may reduce reasoning cost. It may not reduce the evidence, privacy, safety, or authority burden.**
