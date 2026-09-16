# Replay-Grounded Self-Improvement — Design

**Status:** design direction approved in chat; written specification pending user review; implementation not started

**Date:** 2026-09-16

**Scope:** replay-grounded improvement of bounded exploration policy using structured historical discovery traces, deterministic replay over recorded outcomes, held-out evaluation, optional typed semantic annotations, and a separate promotion boundary. This design does not add model training, self-modifying authority, live policy activation, public networking, external-effect authority, or production promotion.

**Builds on:**

- `docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md`
- `docs/superpowers/specs/2026-08-30-sovereign-intelligence-selection-v0-design.md`
- `docs/superpowers/specs/2026-09-05-reward-introspection-evidence-v0-design.md`
- `CONTRIBUTING.md` frontier-laboratory and promotion requirements
- related open work in PR #1455, `Agent Improvement Experiment v0`, if and when that stack lands; this specification does not treat unmerged PR content as current `main`
- related open recursive-subagent lineage/currentness work in PR #1451, if and when that stack lands; this specification does not depend on dynamic spawning

**Research motivation:** Tong Zheng et al., *Dream-RSI: Recursive Self-Improvement through Evolving Worlds*, arXiv:2609.14858 (`https://arxiv.org/abs/2609.14858`), motivates treating completed discovery histories as empirical replay simulators for improving exploration policy while keeping the underlying discovery agent and evaluator fixed. TypeSafe System One documentation (`https://docs.typesafe.ai/concepts/how-to-build-with-system-one`, `https://docs.typesafe.ai/confidence`, and `https://docs.typesafe.ai/cookbooks/autoresearch_feature_discovery`) independently motivates keeping deterministic workflow and side effects in code while using narrow typed judgments, explicit probabilities/confidence, and risk-dependent escalation for semantic decisions. These sources are architectural inputs, not normative dependencies.

**Authority boundary:** `mesh/config/capabilities.json` remains authoritative. Nothing in this design grants authority, widens an existing grant, performs network access, exposes credentials, activates a model, launches a subagent, executes an external effect, changes production state, merges code, or promotes an exploration policy. Replay superiority is evidence about a fixed recorded history, not authority to install the candidate and not proof of better live behavior.

## 1. Core decision

AXIOM should preserve useful discovery history as an executable evidence surface rather than reducing every lesson to more prompt text.

The system may improve **how it allocates already-authorized exploration effort** while keeping authority, evaluation, deployment, and execution boundaries outside the thing being improved.

The governing principles are:

> **History may become a replayable map of observed search space without becoming an oracle for unobserved outcomes.**

> **An exploration policy may choose where to spend an existing exploration budget; it cannot create authority, enlarge the budget, or redefine the evaluator that judges it.**

> **Replay improvement is evidence for a promotion request, never authority to self-promote.**

This is meta-exploration self-improvement, not unrestricted recursive self-modification.

## 2. What AXIOM adopts and what it rejects

### 2.1 Adopt

AXIOM adopts the following ideas from Dream-RSI:

- make exploration policy explicit and programmable;
- capture completed discovery runs as structured branch histories rather than only transcripts;
- replay alternative policies against outcomes already observed;
- evaluate many candidate policies offline before spending another real rollout;
- keep the currently deployed policy in the candidate set as a baseline;
- accumulate more replay worlds over time;
- preserve branch failures and dead ends as useful evidence;
- separate the underlying discovery agent from the exploration controller.

### 2.2 Reject or narrow

AXIOM does **not** adopt the following as general guarantees:

- that a replay winner is guaranteed to improve live behavior;
- that the recorded search space covers outcomes a different policy would have generated online;
- that a replay world is a learned or complete world model;
- that candidate policy code may execute inside the trusted kernel merely because it is being evaluated offline;
- that the policy-development agent may modify its own evaluator, authority rules, resource ceilings, promotion thresholds, or containment boundary;
- that every historical lesson should become semantic guidance injected into later prompts;
- that better benchmark score can override fail-closed authority or safety constraints.

The Dream-RSI guarantee is intentionally narrower: if the current policy is included among candidates, the selected policy can be no worse **in the defined average replay objective over the fixed history used for selection**. AXIOM must preserve that scope exactly and must not market it as a live-world monotonicity guarantee.

## 3. Relationship to the generic Agent Improvement Experiment work

PR #1455 proposes generic evidence objects for improvement proposals, evaluations, experiment records, and promotion-eligibility assessment. Replay-grounded self-improvement should **not create a second generic promotion framework**.

If that stack lands after convergence review:

- an ordinary exploration-policy mutation maps to `routing-selection` or `workflow-topology`, normally within the C2 agent-architecture/tooling class;
- a mutation to the replay objective/evaluator maps to `evaluator-reward` and remains subject to the C3 anti-self-certification rules;
- a mutation to the replay/improvement mechanism itself maps to `improvement-mechanism` and remains outside v0 promotion eligibility under the proposed C5 boundary;
- replay reports become evidence inputs to the generic experiment record rather than an alternate authority path;
- any live shadow/canary activation remains a separate current-authority action.

If PR #1455 does not land in its current form, the first replay implementation remains an inert laboratory with no promotion route until an equivalent reviewed promotion-evidence boundary exists.

This design therefore adds **replay-specific evidence and evaluation contracts**, not a second generic self-improvement constitution.

## 4. Architecture

The intended flow is:

```text
bounded online discovery run
  -> structured discovery trace
  -> replay-world compilation
  -> training replay pool
  -> candidate exploration policies
  -> deterministic replay evaluation
  -> validation replay pool
  -> sealed holdout evaluation
  -> generic improvement evidence / promotion request
  -> separately authorized shadow or canary stage
  -> separately authorized activation decision
  -> new bounded online discovery run
  -> additional replay world
```

The authority path remains external to the replay loop:

```text
candidate policy
  != authority grant
  != capability promotion
  != deployment permission
  != external-effect permission
```

A replay loop may recommend a policy. It cannot install it.

## 5. Discovery Trace v0

### 5.1 Purpose

`axiom-discovery-trace.v0` records one completed bounded discovery run as deterministic evidence suitable for replay compilation.

The replay-causal structure is a rooted tree: every non-root attempt has exactly one primary parent whose state it inherited. Auxiliary evidence references may form a wider DAG, but they must not silently alter replay ancestry.

### 5.2 Top-level binding

A trace binds at minimum:

- `trace_id`;
- schema/version/status;
- task/domain identifier and exact task-definition digest;
- root-state reference and digest;
- exact exploration-policy identifier and artifact digest used online;
- exact evaluator/objective identifiers and digests;
- environment/runtime descriptor and digest;
- authorized experiment/resource envelope reference and digest where one exists;
- start/end timestamps;
- ordered node set;
- privacy/data-class declaration;
- fixed no-authority semantics.

### 5.3 Node record

Each non-root node records at minimum:

- `node_id`;
- `primary_parent_id`;
- deterministic creation ordinal;
- selected-parent/prefix-state digest visible to the policy at the decision point;
- attempt/request digest;
- workspace or state snapshot reference and digest where applicable;
- produced candidate/artifact reference and digest;
- evaluator result reference and digest;
- normalized task score only where the bound evaluator defines one;
- evaluation diagnostics reference/digest;
- observed resource use such as calls, tokens/cost units, wall-clock time, storage, and worker slot usage where measurable;
- runtime/model/provider descriptors needed for reproducibility without treating marketing labels as proof;
- tool/capability identifiers used during the attempt;
- authority/effect receipt references where relevant;
- start/end timestamps;
- failure/termination classification when the attempt did not complete normally.

The trace records what happened. It does not claim the attempt would produce the same result again.

### 5.4 Privacy and reasoning minimization

Discovery traces can become extremely sensitive. The durable replay contract must default to references and digests rather than copying raw cognitive or user contents.

The trace must not require or inline:

- hidden chain-of-thought;
- raw credentials, tokens, cookies, keys, or provider session data;
- plaintext private user data when a scoped local reference is sufficient;
- raw hidden-state tensors or reconstructive embeddings;
- unrelated workspace files;
- unnecessary prompt/response bodies.

A local laboratory may retain separately authorized raw artifacts needed to reproduce a coding experiment, but the canonical trace refers to them through scoped references/digests and declares their data class and retention boundary.

## 6. Replay World v0

### 6.1 Purpose

`axiom-replay-world.v0` binds one exact Discovery Trace to fixed deterministic reveal semantics.

A replay world is an **empirical simulator over recorded outcomes**. It is not a generative world model.

### 6.2 Exact support boundary

Replay may reveal only outcomes that are already present in the bound trace.

If a candidate policy asks for:

- a continuation that was never recorded;
- a branch beyond the recorded frontier;
- a node not currently eligible under prefix-only semantics; or
- an observation hidden by the current replay prefix,

then the replay result is `out-of-support` or invalid according to the bound objective. The engine must not invent, extrapolate, call a live model, or synthesize a substitute outcome.

### 6.3 Prefix-only observability

At replay round `k`, a policy receives only the state that would have been observable from the currently revealed prefix/subtree plus predeclared derived annotations.

Future outcomes, unrevealed branch scores, final-run summaries, and holdout-only labels are not visible.

This requirement is critical. Without prefix-only observability, replay becomes label leakage rather than an honest policy evaluation.

### 6.4 Deterministic reveal order

The world manifest binds:

- root-branch opening semantics;
- child reveal semantics;
- worker/concurrency ceiling;
- round ceiling;
- terminal conditions;
- handling of exhausted branches;
- handling of `out-of-support` requests;
- exact trace digest;
- exact objective/evaluator digest;
- exact world-compiler version.

Given the same world, candidate policy decisions, and objective profile, replay must return the same revealed subtree and report digest.

## 7. Exploration Policy Manifest v0

### 7.1 Purpose

`axiom-exploration-policy.v0` describes one exact candidate controller that decides **where exploration should continue within an externally supplied budget**.

It is a policy artifact, not an authority object.

### 7.2 Policy interface

The eventual policy interface is intentionally narrow:

**Input:**

- prefix-only replay projection;
- eligible continuation nodes;
- externally supplied worker/budget ceiling;
- fixed derived annotations explicitly declared by the policy manifest;
- immutable task/evaluator metadata allowed by the replay profile.

**Output:**

- zero or more eligible node identifiers to continue/open this round;
- explicit stop when appropriate;
- optional bounded policy-local diagnostics that are not trusted as evaluation evidence.

The policy cannot request arbitrary tools, secrets, files, network access, new authority, more workers, or a changed objective through this interface.

### 7.3 Artifact binding

A manifest binds:

- policy ID/version;
- exact artifact digest;
- implementation language/runtime declaration;
- policy interface version;
- supported observation schema;
- declared derived-feature dependencies;
- maximum internal state size where applicable;
- author/proposer provenance;
- creation timestamp;
- fixed `authority_effect=none` and `runtime_activation=false` semantics.

### 7.4 Untrusted policy execution

Arbitrary candidate policy code must not execute inside the trusted AXIOM kernel merely because replay is offline.

The first executable slice should use trusted fixture policies or a constrained policy representation. A later candidate-code runner must be a separately isolated frontier-laboratory component with:

- no credentials;
- no production identity;
- deny-egress by default;
- ephemeral or disposable filesystem state;
- strict CPU/memory/time/output limits;
- explicit cancellation;
- deterministic request/response framing;
- no direct Grid, Gateway, Hypervisor, or Sandbox authority;
- reproducible runner/runtime digest;
- kill/halt procedure.

Node's ordinary `vm` facilities must not be treated as the security boundary for hostile candidate code.

## 8. Replay Objective Profile v0

### 8.1 Hard constraints before optimization

`axiom-replay-objective.v0` defines how replay evidence is scored. It is separately content-addressed and frozen before candidate evaluation.

The objective uses constraint-first semantics:

1. reject invalid replay behavior or invariant violations;
2. reject candidate trajectories that exceed the externally supplied resource envelope;
3. preserve all required evaluator correctness checks;
4. only then compare quality/efficiency objectives.

A candidate may not compensate for a hard violation by accumulating enough performance elsewhere.

### 8.2 Secondary metrics

The profile may define transparent secondary metrics such as:

- best discovered quality under the bound evaluator;
- represented generation/evaluation calls;
- represented token/cost units;
- decision rounds;
- parallel worker utilization;
- time-to-first qualifying result;
- branch/search diversity or coverage where defined reproducibly;
- regression/failure counts;
- `out-of-support` requests.

AXIOM should not hard-code one universal scalar objective for all domains. A profile may use lexicographic ordering, Pareto criteria, or an explicitly declared weighted function where compensation is appropriate.

The objective configuration and weights are evidence. Changing them is an evaluator/improvement-mechanism change, not an invisible tuning parameter available to the candidate policy.

## 9. Replay Policy Evaluation v0

`axiom-replay-policy-evaluation.v0` records the deterministic result of evaluating one exact policy over one exact replay-world pool and objective profile.

It binds:

- candidate policy ID/digest;
- baseline policy ID/digest;
- world-pool manifest ID/digest;
- objective profile ID/digest;
- runner/compiler versions and digests;
- per-world trajectory/report digests;
- aggregate metrics;
- explicit baseline deltas;
- failures/regressions;
- `out-of-support` counts;
- replay determinism/reproduction evidence;
- evaluation timestamp;
- fixed no-authority semantics.

A report may say:

> candidate X scores no worse than baseline Y on objective Z across fixed world pool H

It must not silently rewrite that statement as:

> candidate X is universally better

or

> candidate X may now be deployed.

### 9.1 Replay World Pool Manifest v0

`axiom-replay-world-pool.v0` binds the exact set of worlds used for one evaluation role. This closes the otherwise ambiguous gap between an individual world and an aggregate policy evaluation.

A pool manifest binds:

- `pool_id` and schema/version/status;
- `role`: `training | validation | sealed-holdout`;
- exact ordered world identifiers and digests;
- exact compatibility/currentness disposition for each world;
- selection/split provenance and deterministic seed or explicit assignment evidence where applicable;
- creation timestamp and cycle identifier;
- visibility class: `development-visible | acceptance-sealed`;
- fixed no-authority semantics.

Rules:

- duplicate world digests in one pool fail closed;
- a world cannot appear in both a development-visible pool and the sealed holdout for the same acceptance cycle;
- the candidate/policy-development process must not receive the contents or membership details of an `acceptance-sealed` pool during that cycle;
- changing pool membership changes the pool digest and requires a new evaluation;
- compatibility exclusion is explicit evidence rather than silent deletion;
- the pool manifest cannot change evaluator/objective semantics.

The evaluation report references the exact pool digest, so aggregate claims remain reproducible and scoped.

## 10. Training, validation, sealed holdout, and canary

AXIOM should not let a policy-development process repeatedly optimize against every historical world and then call the same worlds independent evidence.

Replay worlds therefore have explicit roles:

### 10.1 Training pool

The policy-development process may inspect detailed trajectories, diagnostics, and errors from training worlds and use them to revise policy candidates.

### 10.2 Validation pool

Validation worlds are not used to generate node-level training guidance for the same revision step. They may provide bounded aggregate feedback during development.

### 10.3 Sealed holdout pool

The sealed holdout pool is content-addressed before final candidate selection for a promotion cycle and is not exposed to the policy-development process during that cycle.

A final holdout report may be consumed by the promotion-evidence layer. Repeated adaptive peeking turns the set into training data and requires a new sealed holdout.

### 10.4 Live shadow/canary

Replay cannot establish performance on branches or stochastic outcomes history never recorded. Therefore any future activation path requires a separately reviewed shadow/canary design using current authority, bounded resources, rollback, and live evidence.

No shadow/canary capability is added by this specification.

## 11. World diversity, currentness, and staleness

A replay pool should preserve metadata needed to understand where evidence came from:

- task/domain;
- task version/digest;
- evaluator/objective version;
- environment/runtime version;
- model/runtime/provider family where relevant;
- date/time window;
- resource envelope;
- online policy generation.

Historical worlds remain valid evidence of what happened, but they may become stale for current-policy acceptance when tools, models, tasks, environments, or evaluator semantics change.

The pool manifest therefore distinguishes:

- `historical-valid` — immutable evidence of a past run;
- `current-compatible` — eligible for current acceptance evidence under explicit compatibility rules;
- `incompatible` — retained but excluded from current acceptance metrics;
- `unverified` — insufficient compatibility evidence.

Stale evidence is not deleted merely because it no longer counts toward current acceptance.

## 12. TypeSafe / System One semantic annotation plane

TypeSafe is useful here as an **optional semantic feature producer**, not as an authority or evaluation oracle.

Current TypeSafe guidance emphasizes that deterministic control flow and side effects stay in code, while System One supplies narrow typed judgments over structured state with probabilities/confidence that code composes and risk-gates. That architecture is compatible with AXIOM's separation of semantic judgment from authority.

Potential replay annotations include narrow judgments such as:

- failure category;
- evaluator-feedback category;
- whether two branches appear semantically redundant;
- whether a result introduces a genuinely different approach;
- whether an evaluator diagnostic is supported or contradicted by supplied evidence;
- degree of novelty, relevance, or likely duplication;
- whether a branch appears to be repeating a known dead-end pattern.

### 12.1 Frozen annotation rule

Deterministic replay must not make a fresh external TypeSafe request every time a policy is evaluated.

Where semantic annotations are used, they should be precomputed and bound as derived evidence with:

- source node/trace digest;
- exact question-set digest;
- model identifier/version;
- exact input-state digest;
- typed answer;
- full probabilities/confidence where provided;
- annotation timestamp;
- adapter/runtime version;
- explicit `authority_effect=none`.

Replay then consumes the frozen annotation artifact. This preserves reproducibility and avoids turning provider availability or model drift into hidden replay nondeterminism.

### 12.2 Confidence discipline

System One confidence/probability is not permission to act and is not proof that a judgment is correct.

Thresholds must be validated on AXIOM's own target data. Low-confidence or unavailable annotations become `unknown`, trigger exclusion of the dependent feature, or route to a more expensive evaluator/human review according to the experiment policy. They must never silently widen authority or lower a hard safety constraint.

### 12.3 No hard dependency in the trusted kernel

The first replay contracts and deterministic engine must not require TypeSafe or any external AI service to validate core trace/replay invariants. TypeSafe integration belongs in a separately reviewed adapter/laboratory layer.

## 13. Evidence over prompt accretion

Dream-RSI reports that explicit semantic guidance distilled from prior trajectories underperformed unguided variants in its tested long-horizon discovery settings. AXIOM should not generalize that result into a claim that instructions are bad.

The architectural lesson is narrower:

> **Do not automatically convert every historical lesson into permanent prompt text when the original evidence can remain inspectable, replayable, testable, or executable.**

A lesson may instead become:

- a regression test;
- a replay world;
- a typed annotation;
- an evaluator fixture;
- a routing feature;
- a capability-to-evidence binding;
- a documented hard invariant;
- a rejected-candidate record.

If semantic guidance itself is proposed as an improvement, it should be evaluated as a candidate artifact rather than assumed to help because it summarizes experience.

## 14. Threat model and abuse cases

### 14.1 Replay overfitting

A policy may become excellent on the fixed historical worlds while generalizing poorly.

Mitigations: validation/sealed holdout pools, world diversity, live canary before activation, explicit non-claim about live monotonicity.

### 14.2 Evaluator/reward hacking

A candidate or policy-development process may optimize a proxy while degrading the real task.

Mitigations: immutable evaluator/objective digests during a cycle, independent correctness checks, negative/regression evidence, C3 anti-self-certification for evaluator changes.

### 14.3 Trace poisoning

Bad or adversarial traces may bias future policy development.

Mitigations: provenance binding, source/currentness metadata, invalid-trace rejection, pool curation evidence, ability to exclude but not erase a poisoned/stale world.

### 14.4 Future-outcome leakage

The candidate may access unrevealed scores or final summaries.

Mitigations: prefix-only replay projection, explicit leakage tests, separate sealed holdout runner, no raw full-tree access to the candidate policy process.

### 14.5 Candidate runner escape

Arbitrary candidate code may attempt filesystem/network/credential access or host compromise.

Mitigations: run outside the trusted kernel in a hardened disposable frontier environment; deny egress; no secrets; resource caps; explicit halt procedure; never treat language-level sandboxing alone as containment.

### 14.6 Budget laundering

A candidate may attempt to gain more effective search by opening hidden work, spawning children, or altering accounting semantics.

Mitigations: external resource envelope, replay engine meters represented work independently of candidate self-report, no policy ability to change the worker/budget ceiling.

### 14.7 Authority confusion

A policy score, signature, reputation, or successful replay may be misread as permission.

Mitigations: fixed no-authority fields, generic promotion evidence only, current authority recheck at any future live effect, capability registry remains authoritative.

### 14.8 Semantic-annotation manipulation

A policy may exploit predictable weaknesses in semantic annotations.

Mitigations: annotation provenance, calibrated/held-out evaluation, deterministic features retained alongside semantic ones, uncertainty visible, ability to disable annotation families.

### 14.9 Sensitive-history accumulation

Replay archives may become more privacy-sensitive than ordinary logs.

Mitigations: data minimization, opaque scoped artifact refs, encryption/retention controls, no raw chain-of-thought requirement, selective export, domain-specific privacy review.

## 15. v0 invariants and adversarial tests

The first executable slice must demonstrate at minimum:

1. unknown fields and unsupported versions fail closed;
2. all referenced content digests are recomputed and verified;
3. every non-root replay-causal node has exactly one primary parent;
4. replay-causal cycles fail validation;
5. node creation ordinals and identifiers are deterministic and duplicate-free;
6. replay of the same policy decisions against the same world/objective produces the same report digest;
7. an unrecorded continuation returns `out-of-support` and never generates a synthetic outcome;
8. a policy cannot observe unrevealed scores/outcomes;
9. a policy cannot choose a node outside the current eligible set;
10. a policy cannot widen worker, round, call, token/cost, time, storage, or effect ceilings;
11. candidate diagnostics/self-reported costs do not override replay-engine accounting;
12. candidate policy artifacts cannot modify historical traces, world manifests, objective profiles, or evaluator evidence;
13. changing objective/evaluator digest invalidates prior candidate comparisons unless explicitly re-evaluated;
14. the baseline policy is evaluated under the exact same fixed replay pool/objective used for candidate comparison;
15. a `no-worse` replay claim is rejected unless it is scoped to the exact fixed history/objective and supported by recomputed metrics;
16. sealed holdout worlds are not exposed to the policy-development process during the acceptance cycle;
17. a stale/incompatible world can remain historically valid while being excluded from current-acceptance metrics;
18. TypeSafe/semantic annotations, when present, bind exact model/question/input provenance and remain non-authorizing;
19. missing/uncertain semantic annotations fail to `unknown` or an explicit fallback rather than silently inventing certainty;
20. no replay/evaluation artifact can set runtime activation, network effect, credential visibility, merge authority, deployment authority, or production promotion;
21. platform-neutral deterministic serialization is verified through the supported kernel test matrix for the pure contracts/engine;
22. negative results and regressions remain represented in the evaluation digest;
23. duplicate world membership and development/holdout overlap for one acceptance cycle fail closed.

## 16. Implementation slices

The work should proceed in separable slices so useful evidence can land before any live self-improvement behavior exists.

### Slice A — canonical design and fixtures

- this specification;
- representative synthetic discovery trees;
- explicit threat cases;
- no capability change.

### Slice B — inert trace/replay contracts

Implement strict validators, canonicalization, digesting, resolvers, schemas, and pure summaries for:

- Discovery Trace v0;
- Replay World v0;
- Replay World Pool Manifest v0;
- Exploration Policy Manifest v0;
- Replay Objective Profile v0;
- Replay Policy Evaluation v0.

No candidate code execution and no provider/model calls.

### Slice C — deterministic replay engine

Implement prefix-only reveal, eligibility, budget accounting, termination, and objective calculation over synthetic/static worlds using trusted fixture policies under test.

Still no arbitrary candidate code execution.

### Slice D — isolated candidate-policy laboratory

Add a separately reviewed frontier runner for candidate policy artifacts. Define hypothesis, threat model, assumptions, test data, failure criteria, halt procedure, and reproducibility steps as required by `CONTRIBUTING.md`.

No production identities, credentials, egress, or authority.

### Slice E — evaluation-pool discipline

Add deterministic train/validation/sealed-holdout pool manifests, overlap/leakage tests, access separation, and reproduction reports.

### Slice F — optional TypeSafe semantic annotations

Add a separately reviewed adapter that can precompute bounded typed annotations, store provenance/probabilities/confidence, and fall back safely when unavailable. Do not make the deterministic replay core depend on this adapter.

### Slice G — policy-development loop

Only after the replay engine and isolation boundary are independently useful should an agent be permitted to propose policy revisions from training replay feedback.

The policy-development agent receives no promotion authority and cannot mutate the evaluator/objective for the same cycle.

### Slice H — generic improvement/promotion evidence integration

After repository convergence determines the fate of PR #1455, map replay evidence into the canonical generic improvement protocol rather than creating duplicate promotion semantics.

### Slice I — shadow/canary design

Design separately. Any live candidate evaluation must pass current authority, use bounded disposable or explicitly authorized environments, produce receipts, preserve rollback, and remain non-production until independently promoted.

## 17. First domain and scope limit

The first executable domain should be **coding/algorithmic discovery in disposable or repository-controlled workspaces** where:

- task evaluation is reproducible;
- workspace snapshots can be content-addressed;
- external side effects can be eliminated or tightly bounded;
- historical attempts naturally form branches;
- rollback is simple;
- success metrics can be independently checked.

Do not begin with governance decisions, financial effects, personal behavioral interventions, production operations, or other high-consequence domains merely because the replay abstraction is general.

Domain expansion requires a separate threat/authority review.

## 18. Success criteria

The architecture is ready for later activation work when AXIOM can demonstrate, with no authority widening:

- faithful content-addressed capture of bounded discovery runs;
- deterministic prefix-only replay over recorded outcomes;
- explicit support boundaries for unobserved branches;
- reproducible baseline-versus-candidate comparisons;
- train/validation/sealed-holdout separation;
- preservation of negative and stale evidence;
- externally enforced resource ceilings;
- isolation of arbitrary candidate policy code from the trusted kernel;
- optional typed semantic features without making semantic inference an authority plane;
- a clean handoff from replay evidence to the generic improvement/promotion evidence layer;
- rollback and live-canary requirements remaining separate from offline replay score.

A successful offline experiment may show that replay-grounded policy development reduces represented search cost or improves discovery quality on held-out historical worlds. It still does not establish production safety or live monotonic improvement.

## 19. Explicit nonclaims

This design does not claim or implement:

- a general world model;
- prediction of unobserved outcomes;
- guaranteed live improvement;
- automatic recursive self-modification;
- autonomous evaluator/reward modification;
- automatic policy deployment;
- model fine-tuning or weight updates;
- self-authorized subagent spawning;
- new Gateway/Hypervisor/Sandbox/Grid authority;
- public federation or distributed consensus;
- production external-agent execution;
- TypeSafe as a trusted-kernel dependency;
- external provider calls from the deterministic replay engine;
- proof that a policy is safe, aligned, truthful, or universally better merely because it wins replay.

## 20. Research questions left deliberately open

These questions do not block the first inert slices:

1. Which isolated policy representation/runtime gives the best balance of expressivity and reproducible containment?
2. How much task/environment diversity should be required before a candidate may request live canary evaluation?
3. Which compatibility/currentness rules should retire a world from current acceptance without deleting its historical evidence?
4. Which diversity metrics are useful without becoming another gameable reward proxy?
5. Which semantic annotations measurably improve exploration on AXIOM tasks and which only add cost or bias?
6. How should multiple independent recorded outcomes from equivalent starting states be represented without pretending stochastic worlds are deterministic?
7. When should a replay policy remain domain-specific versus becoming a reusable policy family?
8. What independent evidence is required before any improvement to the improvement mechanism itself may be considered beyond laboratory study?

The first implementation should answer only what is necessary for deterministic evidence capture and replay, then use measured results to justify later complexity.

## 21. Product and architectural principle

The long-term goal is not an agent that rewrites itself because it can.

The goal is an agent ecosystem that can accumulate experience, preserve the structure of what actually happened, cheaply test better ways to search against that history, and propose improvements while remaining unable to grant itself new authority.

> **Improve the search. Preserve the evidence. Hold the authority boundary.**
