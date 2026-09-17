# Axiom Science v0 Design

**Status:** owner-approved design direction; documentation-only; implementation authority not granted

**Date:** 2026-09-17

**Issue:** #1605

**Stacked on:** draft PR #1603 exact head `0a47ede785b0751cf615a3e0a67ab113e8d67599`

**Purpose:** define the smallest science-domain layer that can support increasingly autonomous research while preserving AXIOM's existing epistemic, authority, consent, provenance, privacy, and effect boundaries.

**External triggers:**

- Guo et al., “Toward autonomous science with agentic artificial intelligence,” *Cell* (2026), DOI `10.1016/j.cell.2026.08.052`;
- Miao et al., “Reimagining research papers as interactive and reliable AI agents,” *Nature* (2026), DOI `10.1038/s41586-026-11044-y`, already tracked in #1602/#1603;
- the September 17, 2026 `1kpapers`/Jev workflow report demonstrating low-cost heterogeneous research summarization plus typed semantic classification, captured on #1605.

**Builds on:**

- `docs/superpowers/specs/2026-09-07-epistemic-fabric-stage5b-design.md`;
- `docs/superpowers/specs/2026-09-16-agent-native-research-artifacts-v0-design.md` from draft PR #1603;
- `docs/rebuild/AGENT-INTEROPERABILITY-AND-CAPABILITY-SUBSTRATE.md` and the `Knowledge -> Operation -> Authority` separation;
- the existing `Gateway -> Hypervisor -> Sandbox -> Grid` authority path;
- machine principals, consent, exact-effect authorization, receipts, causal history, selective disclosure, recovery, and plural-authority/Circle architecture.

This design creates no second epistemic engine, no second authority engine, no autonomous truth service, no experiment authority, and no new production capability.

---

## 1. Architectural decision

Axiom Science is a **thin domain layer** over existing AXIOM primitives.

```text
Research Capsule / source provenance
              |
              v
        Epistemic Fabric
 Source / Claim / Evidence / Assessment
 Unknown / Relationship / contradiction
              |
              v
        Axiom Science
 study / experiment proposal / run evidence
 scientific profiles / critique / replication
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

The domain adds scientific workflow semantics. It does not redefine canonical evidence or what grants authority.

The governing doctrine is:

> **Scientific autonomy is not scientific authority.**

An agent may be capable of selecting a method, drafting an experiment, interpreting a result, or operating a tool without acquiring permission to perform any consequential effect.

---

## 2. Alternatives considered

### 2.1 Expand Research Capsule v0 into autonomous science

Rejected.

Research Capsule v0 is intentionally a zero-authority provenance/evidence substrate. Expanding it into orchestration, experiment execution, scientific adjudication, and collaboration would erase a useful boundary and widen draft PR #1603 beyond its verified scope.

### 2.2 Put science semantics directly into Epistemic Fabric

Rejected.

The Epistemic Fabric must remain domain-neutral. It should represent claims, evidence, assessments, unknowns, contradictions, provenance, and reproducibility closure for many domains. Scientific preregistration, experimental protocols, lab resources, replication semantics, and publication are domain-specific.

### 2.3 Thin Axiom Science domain over Research Capsule + Epistemic Fabric + ordinary authority

Chosen.

This preserves one knowledge substrate and one authority plane while allowing science-specific workflows and policy.

---

## 3. Hard invariants

1. **Scientific autonomy is not scientific authority.** Capability, model quality, tool access, or prior success does not grant permission.
2. **Knowledge is not authority.** Research sources, claims, models, reviews, and scientific consensus do not mint runtime authority.
3. **Operation is not authority.** A method, notebook, workflow, MCP tool, instrument command, or generated protocol remains inert until separately authorized.
4. **Provenance is not correctness. Extraction is not endorsement.** Exact source preservation does not certify a source statement.
5. **Reproduction is not truth.** A successful replay establishes only the exact closure reproduced.
6. **Execution success is not epistemic validation.** A completed experiment or computation does not automatically establish its interpretation.
7. **No self-promotion of claims.** A proposer or executor may emit its own assessment, but that assessment remains attributable to the same lineage and cannot masquerade as independent validation or global establishment.
8. **Negative knowledge is first-class.** Failed, falsifying, inconclusive, excluded, superseded, and contradicted work remains attributable and append-only.
9. **Unknown remains unknown.** Missing independence, provenance, applicability, calibration, or validation state is never inferred as favorable.
10. **Scientific decisions do not mint effect authority.** Peer review, Circle votes, committee approval, publication, citation count, or institutional status may inform policy but cannot create a capability/grant by themselves.
11. **Private evidence remains private unless separately disclosed.** Participation in research does not imply blanket data release.
12. **No second canonical engine.** Science composes the Epistemic Fabric, Research Capsules, and existing Mesh authority/receipt paths.
13. **No global truth primitive.** Science may expose scoped assessments and derived views, never `global_truth = true` or an equivalent scalar threshold.
14. **Currentness matters.** Source, code, model, dataset, protocol, environment, instrument calibration, and policy drift can narrow or invalidate prior applicability.
15. **Typed model output is not truth or permission.** A structured interface can eliminate parsing ambiguity while remaining probabilistic evidence that must be calibrated for its use.

---

## 4. Reuse before invention

Axiom Science must reuse the generic Epistemic Fabric wherever the concept is not genuinely science-specific.

| Scientific concept | Canonical underlying primitive |
|---|---|
| research source / paper / dataset | `Source` + Research Source Manifest |
| source statement / scientific proposition | `Claim` |
| research question / unresolved problem | `Unknown` plus relationships |
| hypothesis | `Claim` with a science-domain hypothesis profile |
| observation / measurement | `Evidence` with a science-domain observation profile |
| critique / interpretation | `Assessment` + `Relationship` |
| contradiction | Epistemic contradiction/relationship semantics |
| semantic classifier output | `Assessment` with a Research Judgment profile |
| reproduction result | Research Reproduction Evidence + `Evidence` |
| competing explanation | multiple `Claim` objects and explicit relationships |
| correction / retraction / supersession | append-only epistemic events/revisions |

Axiom Science therefore needs only a small set of new domain objects for study/workflow state that the generic fabric should not own.

---

## 5. Minimal science-domain objects

### 5.1 Science Study

A bounded study/project envelope.

Conceptual fields include:

- study identifier;
- purpose and research-question references;
- scope/population/domain constraints;
- participating principal references;
- methodology/profile references;
- disclosure/publication policy references;
- preregistration references where applicable;
- exact Research Capsule/source references;
- created/revised timestamps;
- content/provenance digests.

A Science Study is an organizational object. It grants no execution or disclosure authority.

### 5.2 Experiment Proposal

A proposal-plane object describing a potential scientific operation before authority exists.

It must be able to bind:

- study/question/hypothesis references;
- protocol/method/operation-candidate digests;
- declared inputs and outputs;
- data classes;
- expected evidence or discriminating observation;
- environment/instrument/resource requirements;
- network/filesystem/credential requirements;
- cost/spend requirements;
- safety constraints;
- stopping conditions;
- expected failure classes;
- analysis plan reference;
- declared effect classes;
- proposed execution principal;
- proposal digest.

An Experiment Proposal contains no embedded grant and no portable authority.

### 5.3 Experiment Run Evidence

A record of what actually occurred after an experiment was separately authorized and executed through the ordinary AXIOM path.

It references, rather than replaces:

- exact authorization/grant receipt;
- executing principal;
- operation/protocol digest;
- source/code/model/data/environment closure;
- instrument identity/configuration/calibration where applicable;
- exact input/fixture digests;
- start/end time;
- observed outputs and logs/evidence references;
- failure/termination state;
- effect receipt references;
- privacy/disclosure constraints.

The run record must not reinterpret its own output as a scientific conclusion.

### 5.4 Replication Assessment

A science-domain profile over `Assessment` that binds a reproduction/run result to an explicit independence and closure vector.

A replication is never represented as a bare boolean.

---

## 6. Canonical research graph

The scientific workflow is represented as a graph over generic epistemic objects plus the small science-domain envelope.

```text
ScienceStudy
    |
    +--> Unknown / Research Question
    |          |
    |          v
    |        Claim / Hypothesis
    |          |
    |          v
    |     prior EvidenceSet
    |          |
    |          v
    +--> ExperimentProposal
               |
               +----> authority request / decision
               |            |
               |            +---- denied/expired --> provenance only
               |
               v
         authorized execution
               |
               v
       ExperimentRunEvidence
               |
               v
         Observation/Evidence
               |
               v
          Analysis Record
               |
               v
          Claim/Assessment
          /      |       \
      critique replication supersession
```

The graph may contain several competing hypotheses and incompatible assessments at once. Contradiction is preserved instead of being averaged into a synthetic consensus.

---

## 7. Analysis records and claim-to-evidence lineage

A scientific claim should be traversable to the evidence and derivations that support or challenge it.

A bounded Analysis Record binds:

- input evidence digests;
- code/model/method/verifier profile;
- environment/dependency closure;
- parameters and decision thresholds;
- statistical, formal, or causal assumptions;
- result artifacts;
- analyst/agent provenance;
- limitations and scope;
- output claim/evidence references.

Conceptually:

```text
Claim
  -> Assessment(s)
  -> Analysis Record(s)
  -> Observation/Evidence
  -> Experiment Run Evidence
  -> exact protocol / code / data / model / environment
  -> authority/effect receipts where execution occurred
```

This does not require that every scientific claim become machine-proven. It requires that the system distinguish unsupported prose, source statements, model inference, measured observation, analyzed evidence, and independent critique.

---

## 8. Scientific state is assessment, not a global lifecycle flag

Axiom Science must not introduce a universal lifecycle such as:

```text
hypothesis -> proven -> true
```

A named evaluator, methodology, Circle, institution, or policy profile may instead produce scoped assessments such as:

- `supports_within_scope`;
- `weakens_within_scope`;
- `falsifies_within_scope`;
- `inconclusive`;
- `not_applicable`;
- `contested`;
- `methodologically_invalid`;
- `insufficient_evidence`.

Each assessment is bound to:

- evaluator/principal;
- evidence set;
- methodology/profile;
- claim scope;
- time/currentness;
- limitations;
- provenance.

Different legitimate assessments may coexist.

An application may derive a view such as “currently supported under profile X,” but that view is not written back as global truth.

---

## 9. Heterogeneous model pipeline

Axiom Science should assume that different computational stages may be best served by different models, algorithms, or deterministic tools.

The September 17 `1kpapers`/Jev report is useful evidence for this architecture: one model generated research summaries and a specialized System One model performed typed topic classification. The reported cost/latency numbers are external benchmark evidence, not AXIOM invariants and not a guarantee for another corpus.

The architectural pattern is:

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
 Epistemic Fabric + Science-domain graph
```

The durable object is the result and provenance, not the provider brand.

Model routing may consider cost, latency, quality, privacy, context length, specialization, calibration, and current availability, but routing itself grants no effect authority.

---

## 10. Research Judgment profile

Typed semantic decisions from Jev/System One or comparable future systems should be represented as a profile over Epistemic `Assessment`, not as a new truth object.

A Research Judgment must be able to bind:

```text
input/source digest
question/taxonomy/profile digest
provider/model/version or exact evaluator identity
typed answer/distribution
confidence/calibration metadata
created_at
currentness/expiry where applicable
evaluation profile/reference
downstream-use class
judgment digest
```

Initial downstream-use classes:

- `discovery_only`;
- `routing_only`;
- `ranking_only`;
- `epistemic_proposal`;
- `requires_review`.

No downstream-use class carries runtime authority.

Suitable uses include:

- topic/domain classification;
- method/evidence-shape classification;
- relevance screening and reranking;
- source and specialist routing;
- likely resource-only vs operation-bearing research routing;
- candidate contradiction/replication prioritization;
- uncertainty detection;
- deciding which expensive evaluator should inspect a case next.

Unsuitable final decision roles include:

- scientific truth;
- evidence independence;
- consent/authority;
- experiment execution permission;
- repository/deployment authority;
- consequential effect classification where deterministic effect evidence exists;
- declaring a claim independently replicated;
- publication as an established result.

### 10.1 Cascade rule

Semantic uncertainty must be explicit.

Low-confidence or high-consequence judgments escalate to a stronger evaluator or human/scientific review instead of silently increasing model effort everywhere or treating uncertainty as permission.

Thresholds are application/profile specific and must be evaluated against target-domain outcomes. Demo thresholds and vendor benchmark results are not universal policy.

### 10.2 Reuse rule

When the exact input digest, question/profile digest, evaluator/model version, and relevant currentness conditions are unchanged, a prior semantic judgment may be reused according to its retention/expiry policy. Reuse must remain visible in provenance.

---

## 11. Reproducibility closure

A replication or reproduction claim may not exceed what was actually replayed.

A reproducibility closure should be able to bind, as applicable:

- exact claim/target digest;
- source/paper version;
- code revision;
- data/sample digest;
- model/checkpoint digest or exact provider/model version;
- prompt/configuration/profile digest where relevant;
- dependency closure / lockfile / SBOM digest;
- execution environment/container/runtime digest;
- instrument identity and calibration state;
- protocol version;
- analysis harness/version;
- random seed or stochastic policy;
- dependencies freshly rebuilt versus reused;
- independent replay identity;
- output comparison/tolerance method;
- result and limitations.

A cached dependency, shared model checkpoint, common analysis script, or reused dataset is not hidden merely because the run succeeded.

---

## 12. Replication independence is multidimensional

Independent replication cannot be self-declared with a boolean.

At minimum, a Replication Assessment should expose whether the new work shares or differs in:

- source data;
- study population/sample;
- code/implementation;
- model/checkpoint;
- dependency/environment;
- experimental protocol;
- instrument/lab;
- operator/research team;
- analysis harness;
- source/evidence lineage;
- funding/sponsor where relevant to the methodology.

Each dimension is initially:

```text
same | different | unknown
```

A later domain profile may define richer semantics, but unknown independence must never be silently counted as independent confirmation.

A scalar independence score may be computed for a specific application, but it is derived view state only and cannot replace the vector.

---

## 13. Negative knowledge and failure provenance

Failed research is evidence about what was attempted.

Axiom Science preserves at least:

- successful result;
- empirical falsification;
- formal counterexample/refutation;
- inconclusive result;
- null result;
- excluded run;
- tool/instrument failure;
- dependency/environment failure;
- resource exhaustion;
- protocol deviation;
- scope mismatch;
- analysis failure;
- safety/policy denial;
- duplicate route;
- abandoned route with reason.

A failure is not automatically a falsification.

Historical negative routes remain attributable so another agent can avoid waste or deliberately retry when assumptions, methods, evidence, or tools change.

---

## 14. Continuation and long-running autonomous research

The Epistemic Fabric's continuation-packet direction is the correct substrate for long-running autonomous research.

A science continuation packet may reference:

- unresolved question/hypothesis;
- exact graph/snapshot;
- evidence-state vectors;
- attempted and failed routes;
- current experiment proposals;
- open evidence obligations;
- contradictions/discriminating observations;
- promising unexplored routes;
- exact agent/model/run provenance;
- resource expenditure;
- remaining declared search budget;
- disclosure constraints.

Importing a continuation packet imports knowledge/proposals only.

It does not transfer:

- experiment authority;
- credentials;
- consent;
- spending authority;
- instrument authority;
- network authority;
- repository authority;
- publication authority.

---

## 15. Science Circles

Research collaboration is a natural future Circle profile.

A Science Circle may coordinate:

- human researchers;
- research agents;
- review/critique agents;
- lab/instrument service principals;
- statisticians/analysts;
- data custodians;
- external replicators;
- auditors.

The Circle can maintain shared study state, proposals, roles, objections, tasks, and explicitly shared evidence projections while participants retain independently owned node state.

A Circle decision remains evidence/governance state. It does not itself mint Sandbox/Grid authority.

A member should be able to determine why the Circle believes it may request a task, which evidence is shared, which state remains private, and how to object/withdraw under the applicable charter and law/policy.

---

## 16. Private data, human subjects, and selective disclosure

Axiom Science must not make “autonomous science” a pretext for centralizing raw participant data.

Where research uses sensitive or private state:

- data remains under the applicable sovereign/domain boundary;
- purpose and disclosure remain separately authorized;
- derived evidence does not imply permission to reveal raw inputs;
- collective/statistical research should prefer the shared privacy-preserving collective-intelligence substrate where applicable;
- audit evidence must not become a secondary identity-correlation database.

This design does not claim legal/ethics-board compliance, clinical-trial authority, biosafety approval, or human-subjects authorization. Those are separate institutional and jurisdictional requirements that future adapters may represent but cannot fabricate.

---

## 17. Publication and scientific communication

Publication is an external effect and a provenance event, not a truth transition.

A future publication action must separately bind:

- exact artifact/version;
- submitting principal;
- destination/journal/repository;
- disclosure policy;
- authorship/contributor assertions;
- applicable approval/consent;
- publication authority;
- receipt.

Peer review, acceptance, correction, expression of concern, retraction, and supersession become append-only source/currentness events and assessments.

Publication status may affect discovery/reputation views. It must not become runtime authority or automatic correctness.

---

## 18. Error and fail-closed semantics

| Condition | Required result |
|---|---|
| invalid science-domain schema | reject |
| missing required provenance | stage/deny canonical admission |
| missing authority for consequential experiment | deny execution |
| semantic classifier uncertainty | retain probability/uncertainty; escalate per profile |
| typed model result conflicts with deterministic evidence | deterministic evidence/policy governs the applicable deterministic property; preserve conflict |
| stale source/code/model/environment | prior evidence remains historical; current applicability narrows |
| unknown replication independence | `unknown`; never assume independent |
| successful run with failed analysis | preserve run evidence; no scientific claim promotion |
| failed run due to tooling | record tool failure; do not call hypothesis falsified |
| private evidence lacks disclosure authority | keep private / deny disclosure |
| Circle/committee approval without runtime grant | no execution authority |
| experiment proposal contains undeclared effects | deny admission/execution until corrected and separately authorized |
| agent attempts to rewrite historical negative result | deny mutation; append supersession/correction only |

---

## 19. Threat model additions

Future Axiom Science work must explicitly test at least:

- source/paper prompt injection;
- provenance laundering;
- publication-prestige laundering;
- model-confidence laundering;
- reproduction-to-truth laundering;
- execution-success-to-truth laundering;
- semantic-classifier-to-authority laundering;
- correlated-agent agreement masquerading as independence;
- shared dataset/code/model masquerading as independent replication;
- selective reporting / failed-run deletion;
- p-hacking or analysis-profile switching without provenance;
- post-outcome preregistration mutation;
- stale model/checkpoint/environment reuse;
- instrument calibration/currentness drift;
- private-data exfiltration through research outputs;
- tool metadata lying about effects;
- research-resource exhaustion;
- continuation packet authority smuggling;
- Circle governance attempting to bypass local non-waivable protections;
- publication action without disclosure/authority.

The design records these threat classes only. It does not authorize dangerous experimental execution or operational red-team activity.

---

## 20. Resource and cost controls

Autonomous research loops can consume unbounded inference, retrieval, compute, laboratory, and human-review resources.

Every future executable research plan must therefore support bounded budgets for the dimensions it can consume, including where applicable:

- model/inference spend;
- tokens/context;
- retrieval/fetch count;
- storage;
- CPU/GPU time;
- wall-clock duration;
- experiment attempts;
- instrument time;
- external API calls;
- network destinations;
- human-review requests.

Unknown budget dimensions fail closed for consequential execution rather than becoming unlimited.

Fast semantic models may reduce routine cost. Cost optimization never reduces evidence, privacy, safety, or authority requirements.

---

## 21. v0 implementation boundary

The first implementation slice must remain **zero-authority and execution-free**.

It may add only inert documentation/contracts/fixtures/verifiers for the smallest new science-domain surface, likely:

- `Science Study v0`;
- `Experiment Proposal v0`;
- `Experiment Run Evidence v0` as an inert evidence contract without a live executor;
- `Replication Assessment v0` / Research Judgment science profiles where the generic Epistemic contracts cannot represent required metadata cleanly;
- synthetic research-graph fixtures;
- authority/epistemic-boundary falsification tests;
- canonical documentation/index/checker registration.

Before implementation, the plan must inspect the exact current Epistemic Fabric contracts and reuse them instead of duplicating `Claim`, `Evidence`, `Assessment`, `Unknown`, or generic `Relationship` semantics.

The first slice must **not** add:

- autonomous paper fetching;
- live web/research ingestion;
- remote MCP/tool connection;
- provider credential access;
- package installation;
- subprocess/container execution;
- model/provider routing in production;
- physical instrument control;
- wet-lab/chemical/biological execution;
- clinical/human-subject execution;
- external spending/procurement;
- publication/submission;
- new Gateway routes;
- `mesh/config/capabilities.json` changes;
- production network widening;
- autonomous truth adjudication;
- production promotion.

---

## 22. Acceptance requirements for the first implementation proposal

At minimum, future executable work must prove:

1. Science-domain objects cannot mint capabilities, consent, grants, or execution authority.
2. Research Capsule and Epistemic Fabric objects are reused rather than copied into a second canonical graph.
3. A source statement can remain exactly preserved while a later assessment marks it unsupported/incorrect/contested.
4. A successful experiment run cannot automatically promote a hypothesis or claim.
5. A failed tool/environment run cannot masquerade as empirical falsification.
6. Historical failed/inconclusive results cannot be silently deleted.
7. A semantic judgment carries exact evaluator/question/input provenance and uncertainty.
8. Semantic confidence cannot grant authority or establish truth.
9. Unknown replication independence remains unknown.
10. Shared code/data/model lineage cannot masquerade as independent replication.
11. Reproducibility claims cannot exceed the exact closure replayed.
12. Stale source/code/model/environment evidence remains historical rather than current by default.
13. A Circle/committee decision cannot bypass ordinary AXIOM execution authority.
14. Continuation packets cannot transfer credentials, grants, consent, spending, experiment, network, repository, or publication authority.
15. Private evidence cannot become public merely because it supports a scientific claim.
16. No first-slice module performs provider I/O, network I/O, subprocess execution, live filesystem mutation beyond tests, or Grid/capability mutation.
17. Clean-kernel, supported-platform, documentation, and security-boundary verification remain intact.

---

## 23. Migration path

Axiom Science should progress through independent gates rather than one autonomy switch.

### S0 — domain contracts

Inert study/proposal/run-evidence/replication/judgment profiles and synthetic fixtures only.

### S1 — local research graph

Owner-local proposal/evidence graph composed from Research Capsules and Epistemic objects. No external effects.

### S2 — bounded semantic pipeline

Optional provider-backed summarization/classification/routing under existing provider authority, exact provenance, budgets, privacy rules, and evaluation gates. Outputs remain epistemic proposals/assessments.

### S3 — computational reproduction sandbox

Separately authorized disposable execution for specifically admitted low-consequence computational research operations. Exact environment/effect receipts required. No physical lab authority.

### S4 — multi-principal Science Circle pilot

Low-consequence collaboration over explicit shared projections, critique, replication, objections, and export.

### S5 — controlled continuous ingestion

Bounded feeds can create source manifests, knowledge projections, semantic judgments, and reassessment proposals. Continuous ingestion still stops before external effects.

### S6 — autonomous research planning

Agents may maintain frontier/continuation state and propose experiments under explicit resource budgets. Proposal autonomy remains distinct from execution authority.

### S7 — separately governed physical/institutional adapters

Only after independent designs, threat models, legal/institutional review, and authority gates. No approval is inherited from S0-S6.

---

## 24. Claim boundary

Approval of this design means only that Axiom Science should be developed as a thin, provenance-preserving, authority-neutral scientific domain over the existing Mesh architecture.

It does **not** establish that AXIOM currently provides:

- autonomous scientific discovery;
- scientific truth determination;
- continuous research ingestion;
- production semantic-model routing;
- laboratory automation;
- clinical or human-subject research authorization;
- remote research-agent execution;
- publication authority;
- independently validated scientific replication;
- production Axiom Science capabilities.

The intended direction is:

> **Let research agents become increasingly autonomous in discovery, planning, analysis, and collaboration while making the evidence, provenance, uncertainty, resource use, and authority boundaries more explicit—not less.**

And the durable system rule is:

> **Fast semantic judgment may reduce reasoning cost. It may not reduce the evidence, privacy, safety, or authority burden.**
