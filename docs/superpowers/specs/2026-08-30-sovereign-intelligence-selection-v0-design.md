# Sovereign Intelligence Selection v0 — Design

**Status:** approved architecture; current-main convergence updated 2026-09-06 for evidence-aware task routing

**Original date:** 2026-08-30  
**Convergence update:** 2026-09-06

**Scope:** routing-relevant cognitive capability metadata bound to the existing runtime/provider catalog, deterministic hard-constraint eligibility, task-specific empirical capability evidence, and an inert evidence-aware recommendation layer. No model invocation, network access, credential use, authority grant, runtime activation, or external effect is created by this design.

**Builds on:**

- `docs/architecture/PERSONAL-COMPUTE-FABRIC-AND-LOCAL-TRUST.md`
- `docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md`
- `docs/superpowers/specs/2026-08-29-extensible-agent-provider-substrate-design.md`
- `mesh/config/runtime-provider-catalog.v0.json`
- `mesh/src/lib/runtime-connector-fabric-contracts.mjs`
- `mesh/src/lib/cognitive-capability-profile.mjs`
- `mesh/src/lib/cognitive-selection-proposal.mjs`
- `mesh/src/lib/ai-provider-invoke.mjs`
- historical Capability Observation / Capability Surface work from PRs #1393 and #1395, to be reconstructed on current `main` rather than merged wholesale

**Authority boundary:** `mesh/config/capabilities.json` remains authoritative. Routing evidence and recommendations are descriptive/evaluative only. They do not promote `ai.providers`, install or start providers, activate models, read credentials, perform egress, spend funds, mutate Cognitive Topology, mint a capability, approve an effect, or turn model quality into authority.

> **Discovery is not authority. Eligibility is not recommendation. Recommendation is not authorization. Selection authorization is not execution authorization.**

## 1. Core decision

AXIOM treats models, hosted providers, local inference backends, compute nodes, and agent runtimes as replaceable cognitive capabilities around a persistent sovereign identity, memory, policy, and authority substrate.

The routing architecture separates six questions:

1. **What candidate exists?** — runtime/provider catalog.
2. **What stable routing-relevant properties are declared for that exact candidate?** — Cognitive Capability Profile v0.
3. **Is that candidate allowed for this request?** — deterministic hard-constraint eligibility.
4. **What has been empirically observed for this exact candidate on this exact task/evaluation cell?** — Capability Observation and Capability Surface evidence.
5. **Which eligible candidate is recommended under the explicit routing policy?** — evidence-aware inert selection proposal.
6. **May the recommended candidate actually run or produce an effect?** — separate AXIOM authorization and effect paths.

The design deliberately refuses to collapse these questions into one score or one model-router decision.

## 2. Current-main convergence finding

The original 2026-08-30 design anticipated a later measured-evidence router. By 2026-09-06, current `main` already contains most of the substrate:

- Cognitive Capability Profile v0;
- Candidate Eligibility Request v0;
- deterministic candidate eligibility;
- Cognitive Selection Policy v0 and inert selection proposals;
- the Personal Compute Fabric rule that privacy, consent, jurisdiction, destination, capability, and budget are hard filters before quality/latency/reliability/cost/energy optimization;
- AI-001's fail-closed provider invoke/receipt envelope and local deterministic organizer wedge.

The missing piece is not another routing architecture. It is the executable evidence bridge between task-specific observations and the existing selector/provider boundaries.

Historical PRs #1393 and #1395 contain useful Capability Observation / Capability Surface work, but they are not current-main runtime truth. Their semantics should be reconstructed on current `main`, retaining only the parts that survive present contracts and verification.

No new competing "Model Routing Fabric" should be introduced.

## 3. External model rankings are discovery inputs, not policy

Claims such as "model A is best for browser use" or "model B is best for coding" are potentially useful research signals, but they are not durable AXIOM policy.

A provider/model ranking may change because of:

- a model revision;
- a provider-side serving change;
- a new harness or agent runtime;
- a different toolset;
- a different task distribution;
- price or latency changes;
- context-window behavior;
- data-retention or training-policy changes;
- local hardware changes;
- evaluation drift;
- a newly discovered failure mode.

Therefore:

- vendor names and current leaderboard winners MUST NOT be hard-coded as task-routing law;
- an external ranking MAY trigger a new local or reviewed evaluation;
- model/provider versions MUST be exact when evidence is recorded;
- dated observations MAY expire;
- a model's reputation or marketing declaration MUST NOT substitute for measured evidence when the routing mode requires measured evidence.

The durable principle is:

> **Own the routing policy and evidence; rent whichever intelligence currently earns the job.**

## 4. Cognitive Capability Profile v0 remains the stable declaration layer

Schema identifier:

`axiom-cognitive-capability-profile.v0`

A profile binds to exactly one runtime/provider catalog entry using:

- `entry_id`;
- `entry_version`;
- canonical `entry_digest`.

It also identifies an `offering_ref` for the exact model/service/local-runtime offering being described.

The v0 closed capability vocabulary remains:

- `reasoning`
- `coding`
- `vision`
- `computer-use`
- `research`
- `planning`
- `critique`
- `summarization`
- `embedding`
- `tool-use`
- `agent-orchestration`
- `other`

Input/output modalities remain separately declared from:

- `text`
- `image`
- `audio`
- `video`
- `embedding`

Routing-relevant deployment posture remains coarse and descriptive:

**Locality**

- `owner-local`
- `owner-remote`
- `provider-remote`
- `hybrid`

**Access mode**

- `local-runtime`
- `api`
- `remote-runtime`
- `hybrid`

Data posture remains explicit rather than inferred from branding:

**Retention** — `none | transient | persistent | unknown`  
**Training use** — `excluded | possible | unknown`  
**Exportability** — `none | partial | full | unknown`

Economic/performance declarations remain coarse:

**Cost class** — `none | low | medium | high | unknown`  
**Latency class** — `local-fast | interactive | slow | batch | unknown`  
**Context class** — `small | medium | large | very-large | unknown`

Weight access remains:

- `closed`
- `open-remote`
- `open-acquired`
- `local-proprietary`
- `not-applicable`

Assurance ceiling remains:

- `none`
- `self-asserted`
- `behavioral`
- `cryptographic`
- `hardware-rooted`

Every profile continues to require:

```text
authority_effect = none
network_effect = none
credential_visibility = none
runtime_activation = false
selection_effect = eligibility-only
```

Capability Profile v0 is deliberately not expanded into a fast-changing benchmark scorecard.

## 5. Candidate Eligibility Request v0 remains the hard-filter layer

Schema identifier:

`axiom-cognitive-eligibility-request.v0`

The existing request contains explicit constraints for:

- required capabilities;
- allowed integration classes;
- allowed localities;
- allowed retention classes;
- allowed training-use classes;
- allowed weight-access classes;
- maximum cost class;
- maximum latency class;
- minimum assurance ceiling;
- minimum context class;
- exact request identity/time;
- no-authority boundary fields.

`evaluateCognitiveCandidates()` remains the first routing gate.

A candidate rejected here MUST NOT be restored by stronger benchmark evidence. High model quality cannot compensate for forbidden egress, disallowed retention, insufficient assurance, unavailable locality, incompatible context, or an exceeded budget class.

This is lexicographic routing:

1. satisfy hard constraints;
2. admit evidence;
3. compare eligible candidates;
4. recommend;
5. authorize separately;
6. execute separately.

## 6. Reconstruct Capability Observation v0 on current main

The first convergence implementation should reconstruct the useful semantics from historical #1393 into a current-main, inert evidence contract.

Schema identifier remains:

`axiom-cognitive-capability-observation.v0`

Each observation MUST bind to one exact Cognitive Capability Profile by:

- `profile_id`;
- exact canonical `profile_digest`.

It MUST also bind the exact evaluation cell, including as applicable:

- capability;
- task family/class;
- context class or exact context basis;
- task difficulty/bucket;
- execution environment;
- runtime/harness identity;
- toolset identity;
- evaluation-suite identity and version;
- metric set and units;
- threshold definition;
- evaluation method;
- evaluator/evidence provenance;
- observation creation time and freshness/expiry information.

Observation outcomes remain threshold-relative rather than universal intelligence claims:

- `pass`
- `degraded`
- `fail`
- `indeterminate`

Resource observations remain unit-preserving. Unlike resources MUST NOT be collapsed into one synthetic cost/intelligence score.

Every observation remains mechanically non-authorizing:

```text
contains_secret_material = false
authority_effect = none
network_effect = none
training_effect = none
spend_effect = none
runtime_activation = false
selection_effect = evidence-only
```

An observation records what was measured under one exact method. It does not prove provider-wide truth, general intelligence, availability, independence of evaluators, or fitness for another task cell.

## 7. Reconstruct Capability Surface Report v0 on current main

The second convergence slice should reconstruct the useful semantics from historical #1395 as an evidence aggregation layer above exact observations.

Schema identifier remains:

`axiom-cognitive-capability-surface-report.v0`

A report MUST bind to one exact Cognitive Capability Profile and a bounded exact observation set.

For an explicit `assessment_at`, it MUST classify evidence as:

- `current`
- `stale`
- `future`
- `not-yet-recorded`

The report MUST preserve every profile-declared capability, including declared-but-unobserved capabilities.

Observations may be grouped as directly comparable only when the complete evaluation cell is identical: capability, task/context/difficulty/environment/toolset/suite/metrics/threshold/method identity.

The report MUST distinguish:

- direct same-cell agreement;
- direct same-cell conflict;
- cross-cell contextual variation;
- missing evidence.

It MUST NOT emit:

- a universal model score;
- a provider-wide rank;
- a majority-vote truth claim;
- inferred evaluator independence;
- a routing weight;
- an authority result.

Aggregation does not amplify authority.

## 8. Evidence-aware selection successor

Existing `axiom-cognitive-selection-policy.v0` and the current inert `axiom-cognitive-selection-proposal.v0` remain valid and unchanged for compatibility.

The evidence-aware path MUST NOT silently widen or reinterpret their current schema semantics in place.

The successor implementation should expose a separate evidence-aware proposal function and use a new proposal schema identifier:

`axiom-cognitive-selection-proposal.v1`

The v1 proposal composes:

- the exact v0 eligibility request/report;
- the exact selection policy;
- an explicit routing mode;
- an explicit task/evaluation target;
- current Capability Surface evidence for each eligible candidate;
- stable rejection/exclusion reasons;
- deterministic comparison evidence;
- ambiguity/tie state;
- an optional recommendation.

The first implementation remains pure and effect-inert.

## 9. Routing modes and evidence requirements

The Personal Compute Fabric already defines `Private`, `Balanced`, `Best`, and `Budget` modes. Evidence-aware selection should preserve those meanings rather than invent another public vocabulary.

### Private

- owner-approved local locality is a hard constraint;
- empirical quality evidence may compare eligible local candidates;
- evidence can never widen locality or permit remote fallback;
- if an explicit quality floor is required and current evidence is absent, fail closed rather than silently cross an egress boundary.

### Balanced

- local candidates are preferred only after satisfying the same hard constraints;
- a remote candidate is eligible only when owner policy already permits that destination/data posture;
- local-to-remote fallback requires full re-evaluation of privacy, destination, retention, training use, budget, and current evidence;
- no hidden commercial preference may influence the result.

### Best

- current task-specific measured evidence is mandatory;
- static profile declarations or provider marketing are insufficient to produce a "best" recommendation;
- missing, stale, future, incompatible, or unresolved conflicting evidence fails closed for that candidate;
- if no candidate has adequate current evidence, return no recommendation rather than fabricate one.

### Budget

- candidates must first satisfy the declared quality/task floor using current evidence when such a floor is configured;
- cost optimization applies only among candidates that meet that floor and every hard constraint;
- lower cost cannot compensate for insufficient task evidence, privacy, assurance, or capability.

## 10. Evidence admission rules

Evidence-aware selection MUST fail closed when required evidence is:

- absent;
- stale at the request's evaluation time;
- future-dated;
- bound to another profile digest;
- bound to another model/provider/runtime version;
- bound to another task/evaluation cell;
- bound to incompatible metric units or methods;
- structurally ambiguous;
- internally contradictory in a required same-cell comparison;
- supplied with unknown security/authority fields;
- represented only as a provider self-declaration when policy requires measured evidence.

The selector MUST NOT silently average away conflicts.

Where policy requires stronger assurance, conflicting evidence remains unresolved until the required independent/review evidence exists. Repeated outputs from the same correlated evaluator/runtime do not become independent merely by count.

## 11. Deterministic evidence-aware comparison

For each request, the selector performs this order:

1. validate the exact routing request/context and policy;
2. run existing v0 hard-constraint eligibility;
3. reject every candidate that failed hard eligibility;
4. resolve the exact Capability Surface Report for each remaining profile;
5. admit only evidence valid for the requested assessment time and exact task cell;
6. apply the routing mode's evidence floor;
7. compare threshold outcomes and explicitly policy-selected comparable metrics only where units/methods/cells are identical;
8. apply stable policy preferences for non-performance dimensions only among candidates still eligible;
9. expose any meaningful unresolved equivalence as an explicit owner-choice/ambiguous state;
10. emit an inert recommendation only when the evidence and policy actually distinguish a candidate.

The evidence-aware successor MUST NOT use `profile_id` lexical ordering to manufacture a substantive winner from semantically equivalent candidates. Lexical ordering may stabilize presentation only.

A tie is a result, not an error to hide.

## 12. No universal scalar intelligence score

AXIOM should not convert browser use, coding, planning, video generation, cost, privacy, latency, context, and assurance into one global model score.

The same exact model may be:

- strong for one task family;
- weak for another;
- acceptable only with a particular tool/runtime harness;
- preferable locally despite lower benchmark performance;
- disallowed for sensitive data despite superior quality;
- too expensive for one workflow but optimal for another.

Selection therefore remains contextual and policy-bound.

Measured metrics may participate in ranking only when:

- the policy names them;
- directionality is explicit;
- comparison units are identical;
- evaluation methods/cells are compatible;
- freshness is valid;
- no hard constraint is being traded away.

## 13. Fallback and substitution semantics

Fallback is not permission to substitute any model that happens to answer.

Changing any of these requires a fresh placement/recommendation evaluation:

- provider;
- model or model version;
- runtime/harness;
- compute node;
- locality;
- destination;
- retention/training-use posture;
- task/evaluation cell;
- material budget/latency constraint.

Crossing from local to remote is always a new eligibility decision, never a transparent retry.

A same-candidate retry for an uncertain provider invocation may reuse the existing idempotency/recovery semantics only when the exact provider/model/runtime/node/request binding remains unchanged and the provider contract permits that retry.

A recommended candidate becoming unavailable does not authorize the next-ranked candidate automatically. The candidate set must be re-evaluated under current evidence and policy.

## 14. Selection evidence and receipts

The evidence-aware proposal MUST make the reasoning inspectable without copying private prompt/content data into telemetry.

It should bind at least:

- request ID/digest;
- routing mode;
- task/evaluation target;
- policy ID/digest;
- v0 eligibility-report digest;
- exact candidate profile IDs/digests;
- admitted Capability Surface report IDs/digests;
- evidence freshness state;
- rejected/excluded candidate reason codes;
- comparable metric/threshold basis actually used;
- ambiguity/tie state;
- recommended profile ID/digest when one exists;
- `requires_gateway_authorization = true`;
- no-authority/no-network/no-runtime-activation constants.

Operational telemetry MUST NOT include raw prompts, audio, credentials, identity attributes, payment data, memory objects, or other private high-cardinality content merely to explain routing.

The user-facing explanation should be able to answer:

- Why was this candidate eligible?
- Why were others rejected?
- What evidence was current?
- Which policy preference mattered?
- Was there a meaningful tie?
- Did fallback cross a data or network boundary?

## 15. AI-001 provider integration boundary

AI-001 already supplies the correct downstream shape for provider invocation and receipts: exact provider/model, purpose, data scope, budget, timeout, cancellation, retention, input digest, output/outcome evidence, and explicit integrity-vs-truth non-claims.

The later provider-execution bridge should bind an authorized provider invocation to the exact evidence-aware selection proposal digest.

At effect/invocation time, substitution of:

- provider;
- model;
- runtime/harness;
- node/destination;
- purpose;
- data scope;
- budget;
- retention;
- selection proposal

must fail closed or require a fresh selection/authorization path.

The first evidence-aware routing implementation does NOT promote `ai.providers`; current `adapter_required` status remains unchanged until separate provider/runtime authority and conformance gates are satisfied.

Model output remains data. A model selected because it performs well cannot approve its own execution, write memory, publish, spend, alter policy, operate a device, or create another grant.

## 16. Authorization separation

Historical cognitive-selection authorization work such as PR #1379 is provenance/design input only unless reconstructed on current `main` under current authority contracts.

The evidence-aware selector itself MUST remain incapable of:

- calling Gateway to self-authorize;
- creating a capability token/grant;
- activating a runtime;
- invoking a provider;
- spending funds;
- mutating Grid state;
- authorizing external effects.

If/when selection authorization is reconstructed, it must authorize adoption of one exact inert recommendation only. Provider/model execution still requires a separate fresh authorization under then-current policy/currentness/resource state.

## 17. Threat model and adversarial cases

The implementation programme must include regressions for at least:

1. **Leaderboard laundering** — an external "best model" claim cannot become policy without evidence.
2. **Stale benchmark reuse** — expired task evidence cannot satisfy `Best`.
3. **Task mismatch** — coding evidence cannot satisfy browser/computer-use routing merely because the profile supports both.
4. **Model/version substitution** — evidence for one model/version cannot rank another.
5. **Runtime/harness substitution** — evidence gathered under one harness cannot silently transfer to another when harness identity is part of the cell.
6. **Metric-unit mismatch** — unlike units cannot be compared/averaged as if equivalent.
7. **Method mismatch** — incompatible evaluation suites/methods cannot be ranked as one cell.
8. **Conflict suppression** — conflicting same-cell evidence cannot be hidden by majority count.
9. **Provider self-assertion** — self-declared capability cannot satisfy a measured-evidence requirement.
10. **Hard-constraint override** — superior measured performance cannot restore a privacy/budget/locality/assurance-rejected candidate.
11. **Hidden fallback** — unavailable top candidate cannot silently trigger remote/provider substitution.
12. **Local-to-cloud drift** — fallback crossing an egress/data-policy boundary requires fresh evaluation.
13. **Semantic tie laundering** — lexical profile ordering cannot manufacture a winner.
14. **Authority laundering** — recommendation or benchmark success cannot mint execution/effect authority.
15. **Telemetry leakage** — routing evidence cannot require raw user content in shared telemetry.
16. **Commercial bias** — affiliate/provider margin cannot be an undeclared ranking factor.
17. **Correlated evaluator inflation** — repeated same-lineage evaluations do not become independent assurance.
18. **Unavailable/stale observation** — declared capability is not measured availability.

## 18. Testing strategy

The convergence implementation must preserve TDD and current repository verification discipline.

### Capability Observation

Tests must prove:

- strict unknown-field rejection;
- exact profile ID/digest binding;
- declared capability binding;
- exact task/context/environment/toolset/suite/metric/threshold/method identity;
- canonical deterministic digest;
- freshness chronology;
- unit-preserving resource observations;
- hard no-authority/no-network/no-training/no-spend/runtime-activation boundaries;
- no provider invocation, network, credentials, filesystem, process, Grid, or runtime effect.

### Capability Surface

Tests must prove:

- exact observation-set binding;
- current/stale/future/not-yet-recorded classification at explicit assessment time;
- no hindsight leakage;
- declared-but-unobserved capability representation;
- direct same-cell conflict distinct from contextual variation;
- no inferred evaluator independence;
- no universal score/rank/routing weight;
- unit-preserving aggregation.

### Evidence-aware selector

Tests must prove:

- v0 hard eligibility runs before empirical ranking;
- `Best` fails closed without current exact-cell evidence;
- static declaration cannot override measured failure;
- stale/conflicting/wrong-cell evidence is rejected;
- deterministic comparison on compatible evidence;
- meaningful ties remain explicit rather than lexical winners;
- Private/Balanced/Best/Budget semantics preserve hard boundaries;
- fallback/substitution boundaries are explicit;
- selection proposal has zero authority/network/runtime effect;
- inputs are not mutated;
- source imports no effect-capable provider/network/credential/Grid/process surface.

### Provider binding

A later slice must prove:

- the actual invoke/receipt binds the exact accepted selection proposal;
- provider/model/runtime/node substitution fails;
- altered purpose/data scope/budget/retention fails;
- uncertain same-candidate retry does not become candidate substitution;
- provider result cannot authorize a Mesh effect.

## 19. Implementation sequence

The approved current-main sequence is:

1. **Reconstruct Capability Observation v0** from the useful semantics of #1393 onto current `main`, with fresh RED -> GREEN evidence.
2. **Reconstruct Capability Surface Report v0** from #1395, consuming only the reconstructed observation contract.
3. **Add evidence-aware Cognitive Selection Proposal v1** beside the existing v0 selector; do not mutate v0 semantics in place.
4. **Bind selection evidence to AI-001 provider invoke/receipt contracts** without activating a production provider.
5. **Reconstruct selection authorization only if required** under current Gateway/Hypervisor/Sandbox/Grid contracts; do not merge historical #1379 wholesale.
6. **Expose understandable routing explanations in AXIOM One** only after the inert/evidence contracts are stable and verified.
7. **Promote provider execution separately** through the ordinary capability/authority/evidence process.

Each slice must be independently reviewable and must leave `mesh/config/capabilities.json` unchanged unless and until a separate explicit promotion gate is satisfied.

## 20. Explicit non-claims

This design does not claim or provide:

- a production model router;
- a production external model provider;
- a globally correct "best model" list;
- universal intelligence scoring;
- automatic benchmark ingestion from the internet;
- autonomous provider procurement;
- hidden dynamic fallback;
- credential brokerage;
- runtime installation/model acquisition;
- provider availability truth from declaration alone;
- exact price truth without current evidence;
- evaluator independence from distinct IDs alone;
- model-output truth;
- selection authority from evidence alone;
- provider execution authority from selection alone;
- external-effect authority from model quality;
- principal, legal, or subjective identity continuity from model choice;
- capability-registry promotion.

## 21. Final invariant

AXIOM should be able to replace the cognitive engine without replacing the person, agent, memory, policy, authority, or evidence system around it.

The model chosen today may not be the model chosen tomorrow. That is expected.

What must remain stable is the decision discipline:

> **Hard constraints first. Current task-specific evidence second. Explicit policy comparison third. Recommendation fourth. Authorization and execution remain separate. Intelligence never implies authority.**
