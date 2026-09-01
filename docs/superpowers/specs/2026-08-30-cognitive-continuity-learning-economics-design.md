# Cognitive Continuity, Continual Learning, and Lifetime Cognitive Economics — Design

**Status:** proposed architectural extension; design only, zero new runtime authority

**Date:** 2026-08-30

**Scope:** continual learning across memory, skills, adapters, model recruitment, identity continuity, cognitive-cost accounting, capability topology, consolidation, model promotion, and long-horizon sovereignty

**Project identity:** this is an AXIOM-MESH architecture track/subsystem, **Cognitive Continuity & Learning Economics (CCLE)**. It is not a new foundation model, a separate agent identity, or a parallel product. It integrates the existing Cognitive Topology, Sovereign Agent Composition & Continuity, Self-Bundle, memory, skills, accounting, and Axiom One directions into one governed lifelong-learning loop.

**Builds on:**

- `docs/superpowers/specs/2026-08-29-sovereign-agent-composition-continuity-design.md`
- `docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md`
- `docs/superpowers/specs/2026-08-29-self-bundle-continuity-v0-design.md`
- `docs/architecture/PERSONAL-AGENT-PACK-V2-AND-COMPANION-CONTINUITY.md`
- existing AXIOM memory, consent, receipts, portability, delegation, accounting, recovery, and capability-evidence machinery

**Authority boundary:** `mesh/config/capabilities.json` remains authoritative. This design does not activate continual training, autonomous self-modification, model downloads, network egress, credential access, delegated authority, or provider spend. Learning artifacts, cost observations, routing recommendations, continuity scores, and promotion recommendations are evidence unless separately authorized by existing AXIOM policy.

## 1. Core decision

AXIOM should not define continual learning as continuous rewriting of one canonical model.

The target is a persistent sovereign intelligence whose experience, knowledge, procedures, cognitive components, and identity can evolve at different rates while preserving exact provenance, user ownership, bounded authority, portability, rollback, and explicit economic trade-offs.

The governing doctrine is:

> **Own the continuity. Rent the frontier. Retain the value.**

A frontier-model call may be temporary, but useful value produced by that call should, where policy permits, become a reusable owner-controlled artifact: verified memory, semantic knowledge, a skill, a test, a workflow, a benchmark, a distilled procedure, an adapter candidate, a local specialist, or evidence supporting a later model transition.

The system optimizes neither for minimum inference cost today nor maximum local ownership at any price. It optimizes for safe long-horizon cognitive utility under user-defined sovereignty, quality, latency, privacy, and cost constraints.

## 2. Problem statement

Current frontier systems face three related continual-learning limits:

1. **stability versus plasticity** — rapid weight updates can destroy or distort prior competence;
2. **sample inefficiency and domain interference** — durable neural changes are expensive and can create brittle specialization boundaries;
3. **jagged intelligence** — capability is uneven, so one aggregate model score does not reliably describe competence across contexts.

AXIOM cannot assume these problems will be solved soon, and should not make sovereign continuity depend on their solution.

Instead, AXIOM should provide the substrate in which a persistent agent can keep learning even when its underlying models are static, leased, replaced, retired, adapted, distilled, or only partly owner-controlled.

## 3. Design doctrine: layered plasticity

Learning is divided into layers with different persistence, cost, reversibility, and identity proximity.

```text
slowest / highest promotion burden

stable identity / constitutional state
identity-kernel or equivalent continuity representation
accepted semantic self-model and durable beliefs
skills / workflows / specialist procedures
adapters / local specialist models
exact retained episodic evidence and memory
working neural state / temporary adaptation
context window / active task state
current perception / observations

fastest / lowest promotion burden
```

The governing rule is:

> **Plasticity should decrease as proximity to identity increases.**

A related economic rule is:

> **The more expensive and irreversible the storage tier, the stronger the evidence that repeated future use will justify promotion into it.**

Experience may change instantly. Durable knowledge changes cautiously. Identity changes slowly and with explicit lineage.

## 4. Learning types remain distinct

AXIOM should represent at least these learning classes independently:

1. **episodic learning** — what happened;
2. **semantic learning** — what appears to be true or believed;
3. **procedural learning** — how to perform a task;
4. **personal learning** — what works for this user or agent relationship;
5. **context learning** — what matters during the current task/session;
6. **adapter learning** — bounded neural specialization;
7. **base-model learning** — broad changes to underlying representation;
8. **developmental learning** — long-horizon improvement from grounded interaction with environments.

No class silently implies another. Recording an event does not make it a belief. A belief does not install a skill. A successful skill does not justify a model fine-tune. A fine-tune does not become identity. A stronger model does not grant authority.

## 5. Exact retained evidence versus lossy synthesis

Neural adaptation, test-time training, summarization, embeddings, and semantic compression may all be useful but are inherently lossy representations.

AXIOM therefore treats retained source evidence and synthesized understanding separately.

Here, **exact** or **lossless** means exact relative to the artifact AXIOM actually captured and retained. It does not imply complete capture of an event, environment, person's experience, or external reality. Provenance must preserve that distinction.

### 5.1 Exact retained layer

Where policy permits, exact or content-addressed source evidence remains recoverable with:

- source identity;
- timestamp or causal position;
- digest;
- consent/provenance metadata;
- relationship to derived memories;
- retention policy;
- redaction/export rules.

### 5.2 Synthesized layer

Derived artifacts may include:

- summaries;
- semantic memories;
- belief-state updates;
- embeddings;
- skill candidates;
- adaptation corpora;
- model-generated conclusions;
- compressed project state.

Every derived artifact should retain lineage to the evidence it summarizes or transforms where feasible.

The design rule is:

> **Lossy cognition may guide behaviour; it must not silently erase the exact retained record it was derived from.**

## 6. Consolidation pipeline

Durable learning should move upward through a governed consolidation pipeline rather than through immediate permanent mutation.

```text
observation / experience
  -> evidence capture
  -> temporary interpretation
  -> candidate semantic/procedural learning
  -> contradiction and provenance checks
  -> reuse/value estimate
  -> target-tier proposal
  -> evaluation / tests
  -> accepted durable artifact
  -> monitoring
  -> revision, demotion, or rollback
```

A candidate may remain unpromoted indefinitely. Failure to promote is not information loss if the underlying evidence remains retained according to policy.

The consolidation pipeline should support both automated proposals and explicit user-directed learning, but promotion to consequential tiers remains policy-governed.

## 7. Cognitive storage tiers

The same learned value may be stored in different forms. AXIOM should choose the cheapest durable tier that satisfies quality and sovereignty requirements.

### Tier 0 — active context

- extremely cheap to create;
- highly temporary;
- no durability assumption;
- suitable for current-task reasoning.

### Tier 1 — retrievable memory

- low marginal reuse cost;
- high provenance value;
- suitable for exact-retained or semi-structured durable facts and events.

### Tier 2 — semantic consolidation

- moderately more expensive to create and verify;
- cheaper repeated retrieval than replaying all retained history;
- suitable for stable concepts, preferences, relationships, beliefs, and summaries.

### Tier 3 — skills and workflows

- higher creation/test cost;
- very low repeated execution/reasoning cost when reusable;
- suitable for deterministic or semi-deterministic procedures, tool chains, prompts, policies, and evaluators.

### Tier 4 — adapters and specialist models

- meaningful training/evaluation/storage cost;
- potentially large marginal inference savings or quality gains at scale;
- suitable only when reuse, privacy, latency, capability, or provider-independence justify the investment.

### Tier 5 — identity-kernel / durable personalized model revision

- high evaluation and continuity burden;
- infrequent;
- suitable only for stable, repeatedly demonstrated personal/cognitive patterns that belong in a continuity-oriented model representation.

### Tier 6 — foundation/base-model training

- extraordinary cost and risk;
- outside the ordinary personal-agent learning loop;
- treated as research/infrastructure activity rather than routine memory.

## 8. Lifetime cognitive cost model

The system should evaluate cognitive decisions over a time horizon rather than only at the current call.

AXIOM must keep **measured resource cost** separate from **policy-weighted cognitive utility** unless a user explicitly defines a common normalization. Currency, tokens, joules, GPU-seconds, storage, and bandwidth are not interchangeable with privacy, sovereignty, resilience, latency, or quality.

For a candidate learning artifact `a`, define an advisory resource-cost vector or unit-preserving total where conversion is legitimate:

```text
ResourceCost(a, tier) = C_create
                      + C_validate
                      + C_store
                      + C_maintain
                      + C_migrate
                      + C_risk_resource
                      + Sum(expected future use cost)
```

And retain policy utility separately:

```text
PolicyUtility(a, tier) = {
  reuse,
  quality,
  latency,
  privacy,
  sovereignty,
  resilience,
  portability,
  reversibility
}
```

A user or policy may supply explicit weights or exchange assumptions to produce an advisory decision score, but the underlying components and units must remain inspectable. AXIOM must not fabricate a single monetary value for privacy, sovereignty, or resilience.

The important comparison is between alternatives, for example:

- repeatedly calling a frontier model with large context;
- storing exact retained memory and retrieving it;
- converting repeated reasoning into a reusable skill;
- training a local adapter;
- distilling a specialist;
- acquiring released weights;
- maintaining provider-bound persistence.

A more expensive option now may be preferred when expected reuse or user-valued quality, sovereignty, privacy, latency, or resilience makes the long-horizon trade-off better.

## 9. Cognitive return on investment

AXIOM should support an evidence-relative **Cognitive ROI** rather than a crude token-cost score.

Possible dimensions include:

- expected invocation frequency;
- frontier calls avoided;
- context tokens avoided;
- latency saved;
- quality improvement;
- privacy improvement;
- offline availability;
- provider-failure resilience;
- maintenance burden;
- evaluation burden;
- portability;
- rollback cost;
- adaptation risk.

No universal weighting is mandated. A user may value privacy or sovereignty above direct monetary savings.

The system should be able to explain why it recommends `retrieve`, `consolidate`, `skillify`, `adapt`, `distill`, `acquire`, or `leave ephemeral`.

## 10. Time pays down successful learning investments

A durable artifact should be viewed as an investment whose effective per-use cost can fall as reuse rises.

For a reusable artifact with fixed creation cost `F` and marginal reuse cost `m` measured in compatible units:

```text
average_cost_after_n_uses = (F / n) + m
```

This does not mean every task should be localized. It means repeated external cognition should create a signal that the system may be paying rent for the same capability many times.

Axiom should make that signal visible.

Examples:

- repeated long-context reconstruction -> semantic/project consolidation candidate;
- repeated frontier reasoning for the same procedure -> skill candidate;
- repeated specialist API usage -> local-model or adapter evaluation candidate;
- repeated provider-specific personalization -> mirrored/exported continuity candidate where technically possible;
- repeated model replacement failures -> stronger identity-kernel or continuity-test investment candidate.

## 11. Recruitment, retention, and promotion

The existing Cognitive Topology engagement modes remain authoritative for topology description. This design adds a learning/economic interpretation.

A model/component may move conceptually through:

```text
recruit
  -> observe
  -> retain for session
  -> persistent specialist
  -> preferred provider/component
  -> owner-controlled acquisition where available
  -> adaptation/distillation candidate
  -> accepted descendant
  -> deprecated / archived / rollback source
```

Transitions are proposals until governed by applicable AXIOM policy.

Temporary recruitment should be cheap and reversible. Permanent augmentation should require evidence that the component contributes enough durable value to justify dependence, maintenance, and continuity burden.

## 12. Composition instead of hard domain routing

Mixtures of rigid domain adapters can fracture tasks that span multiple disciplines.

AXIOM should therefore model cognitive capability as a graph of composable competencies rather than mutually exclusive domain buckets.

A task may require simultaneously:

- biology knowledge;
- programming;
- statistics;
- simulation;
- literature retrieval;
- visualization;
- security review.

The cognitive router should be able to compose multiple workers, skills, memories, and evaluators.

Routing chooses **who or what contributes cognition**. Existing authority policy continues to decide **what effects may occur**.

## 13. Capability topology and jagged intelligence

A model should not be represented by one scalar intelligence score.

AXIOM should accumulate a versioned **capability topology** from observed evidence.

A capability observation should be contextualized by at least:

- model/component version;
- capability/task family;
- environment/tool availability;
- difficulty;
- evaluation method;
- evidence digest;
- date/recency;
- observed reliability;
- known failure modes.

A component may be excellent in one nearby task and poor in another. The router should use this evidence when deciding whether to rely on one model, compose specialists, request an evaluator, or escalate to a stronger provider.

Capability topology is advisory evidence and grants no authority.

## 14. Working neural state and test-time adaptation

Future TTT-style components may be used as **ephemeral neural working state**.

Such a component may adapt rapidly during a task or project, but its internal state is not automatically permanent.

At task end it may emit candidates such as:

- learned patterns;
- semantic-memory proposals;
- skill proposals;
- benchmark evidence;
- adapter candidates;
- useful synthetic training examples.

Those candidates enter the normal consolidation pipeline.

The design rule is:

> **Fast plasticity may propose permanence; it does not receive permanence by default.**

## 15. Durable neural promotion lifecycle

A permanent adapter, distilled model, or identity-kernel update should be treated like a governed software/model release.

```text
candidate corpus
  -> source authorization
  -> isolated train/distill
  -> privacy and memorization review
  -> task benchmark
  -> cross-domain regression
  -> continuity/fidelity evaluation
  -> adversarial evaluation
  -> cost/benefit comparison
  -> artifact digest and lineage
  -> shadow/canary use where appropriate
  -> approval
  -> topology/self-bundle revision
  -> monitoring
  -> rollback if needed
```

A candidate that improves one benchmark but damages important unrelated capability should not be promoted merely because its average score is higher.

## 16. Identity kernel placement

The optional identity kernel remains a continuity-oriented component, not the whole agent and not the authority root.

This design further constrains its learning role:

- it should not absorb every episodic detail;
- it should not be the authoritative database;
- it should not be updated merely because a frontier model produced a persuasive output;
- its update cadence should be slower than ordinary memory and skill learning;
- candidate updates should be derived from repeated, accepted evidence or explicit user direction;
- predecessor artifacts and continuity evaluations should remain available.

The identity kernel may become more personalized and useful over time while remaining small enough to be owner-controlled and locally runnable where the user chooses that architecture.

## 17. Developmental and multimodal grounding

AXIOM should remain compatible with future systems that learn through continuous multimodal interaction, simulation, world models, robotics, or predictive embedding architectures.

The Mesh should not prescribe one developmental-learning architecture.

It should provide the continuity substrate around such systems:

- consent-governed sensor inputs;
- provenance of observations;
- bounded retention;
- local/private processing where configured;
- evidence-linked semantic consolidation;
- model/component lineage;
- capability observations;
- authority separation;
- recovery and rollback.

Grounded perception may improve cognition without becoming an excuse for unrestricted collection or ambient authority.

## 18. Containment remains orthogonal to learning

More capable or better-adapted cognition must not silently gain more power over the environment.

The existing doctrine remains:

> **Cognitive delegation does not imply authority delegation. Authority delegation does not imply credential delegation.**

This design adds:

> **Learning does not imply authority expansion.**

A memory, skill, adapter, identity-kernel revision, provider transition, or successful evaluation cannot create or widen execution authority merely by existing or being judged useful.

## 19. Economic sovereignty metrics

Axiom One or a future agent console should eventually be able to show a user the economic and sovereignty posture of their cognition.

Useful metrics may include:

- monthly external-model spend;
- local compute/storage spend estimate;
- provider concentration;
- percentage of repeated tasks resolved by owner-controlled artifacts;
- context reconstruction cost;
- memory retrieval savings;
- skill reuse count;
- frontier-call avoidance estimate;
- owner-controlled versus provider-bound cognitive dependencies;
- cost of restoring a degraded topology;
- expected break-even point for candidate localizations/adaptations;
- stale or unused persistent artifacts.

These metrics are explanatory and advisory. They do not authorize purchases, downloads, training, or provider changes.

## 20. First executable slice: Cognitive Learning Ledger v0

The first implementation should be deliberately inert, local, deterministic, and evidence-only.

It should not train a model, invoke a provider, decide automatically what is true, or perform a network effect.

### 20.1 Purpose

`axiom-cognitive-learning-ledger.v0` records candidate learning and its proposed placement in the layered plasticity/economic model.

It proves that AXIOM can distinguish:

- raw retained evidence;
- derived learning;
- target learning tier;
- expected reuse;
- exact-retained versus lossy representation;
- estimated cost posture;
- promotion state;
- evaluation evidence;
- lineage.

### 20.2 Proposed fields

The exact schema may be refined during implementation, but v0 should include:

- exact schema/version/status;
- learning-record identifier;
- bound AXIOM principal or composition reference where applicable;
- source evidence references/digests;
- derived-artifact reference/digest;
- learning class;
- representation class: `exact-retained | lossy | mixed`;
- current tier;
- proposed target tier;
- proposal reason;
- expected reuse class or bounded numeric estimate;
- observed/estimated creation, validation, storage, maintenance, and per-use cost fields with explicit currency/resource units or `unknown`;
- separate expected sovereignty/privacy/latency/quality/resilience benefit descriptors;
- evaluation references/digests;
- promotion state: `observed | candidate | evaluated | accepted | rejected | superseded | rolled-back`;
- predecessor/successor lineage references;
- timestamps;
- explicit no-authority/no-secret/no-network/no-training boundary fields;
- deterministic digest.

### 20.3 Mandatory v0 invariants

1. A learning record cannot create a principal.
2. A learning record cannot create or widen authority.
3. A learning record cannot activate a skill, adapter, model, route, credential, or provider.
4. Cost estimates may be `unknown`; missing data must not be fabricated.
5. A `lossy` artifact must not be represented as the exact retained source record.
6. Accepted promotion must reference applicable evidence/policy but v0 does not itself execute the promotion.
7. Source evidence and derived artifacts remain distinguishable.
8. Identity-tier proposals require stronger explicit evaluation references than ordinary memory-tier proposals.
9. Unknown fields fail closed under the exact v0 schema.
10. Secrets are forbidden.
11. Network locations may appear only as opaque references where existing AXIOM privacy rules permit; v0 performs no fetch.
12. Numeric cost fields are observations/estimates with explicit units, not authority to spend.
13. Resource costs and policy utility remain separately inspectable unless an explicit user/policy normalization is supplied.

## 21. Companion evidence contracts after v0

Only after Learning Ledger v0 proves useful should AXIOM consider separate adjuncts such as:

- **Cognitive Cost Observation v0** — records actual provider/local compute/storage usage attributable to a cognitive action;
- **Learning Promotion Evaluation v0** — compares a candidate artifact against predecessor/baseline capability and continuity evidence;
- **Capability Observation v0** — records contextual model/skill capability evidence;
- **Cognitive Reuse Report v0** — derives reuse and avoided-recomputation evidence;
- **Learning Placement Recommendation v0** — advisory recommendation for retain/retrieve/consolidate/skillify/adapt/distill/acquire/archive.

These should remain separate rather than overloading one universal score or one mutable learning object.

## 22. Axiom One product direction

Axiom One should eventually expose a human-readable **Cognition** surface rather than hide these decisions in model plumbing.

Possible views:

- **Continuity** — principal, self-bundle, identity-kernel, topology, fidelity;
- **Memory** — exact retained evidence versus summaries/semantic state;
- **Skills** — reusable procedures and their test/usage history;
- **Models** — temporary, persistent, provider-bound, owner-controlled;
- **Learning** — recent candidates and promotion decisions;
- **Economics** — what cognition costs now, what has been retained, and where repeated rent may justify durable investment;
- **Capability map** — known strengths, weaknesses, and uncertainty;
- **Recovery** — what remains if a provider disappears.

This surface should explain rather than auto-optimize away user choice.

## 23. Project decomposition

This design should be implemented as a sequence of bounded subprojects rather than one autonomous-learning feature.

### Phase A — evidence model

1. Cognitive Learning Ledger v0 schema/library/tests.
2. Capability Observation v0.
3. Cognitive Cost Observation v0.
4. Derived deterministic reports for reuse, cost, and learning placement evidence.

### Phase B — consolidation

5. Explicit exact-retained-memory versus synthesized-memory lineage.
6. Semantic consolidation proposal lifecycle.
7. Skill proposal linkage to accepted evidence and reuse observations.
8. Learning promotion evaluation.

### Phase C — routing and economics

9. Capability-topology reports.
10. Cost-aware routing recommendations.
11. Break-even/localization recommendations.
12. Axiom One Cognition/Economics views.

### Phase D — model adaptation

13. Adapter/distillation candidate pipeline using existing adaptation authorization.
14. Cross-domain regression and continuity evaluation.
15. Shadow/canary promotion and rollback evidence.
16. Optional identity-kernel adaptation pipeline.

### Phase E — advanced continual cognition

17. TTT/working-neural-state adapters.
18. Multi-worker compositional cognitive routing.
19. Multimodal/developmental-learning integrations.
20. Voluntary network publication of verified learning artifacts and negative tests.

Each phase must preserve the existing capability/evidence/authority boundary and should not require later phases to validate earlier ones.

## 24. Success criteria

The architecture is successful when AXIOM can demonstrate all of the following without relying on one permanently mutable model:

1. the agent can preserve retained experience/evidence independently of model weights;
2. synthesized understanding retains provenance to source evidence;
3. repeated useful cognition can become a reusable owner-controlled artifact;
4. temporary cognition can remain temporary without losing accepted durable learning;
5. a model can be replaced while continuity/fidelity degradation is measured rather than hidden;
6. jagged capability is represented as contextual evidence rather than one intelligence score;
7. durable neural adaptation is regression-tested and reversible;
8. the user can see whether cognition is owned, rented, provider-bound, or reconstructable;
9. the system can compare current spend against long-horizon reuse/localization options without conflating unlike units or values;
10. no learning artifact can grant itself authority;
11. no provider or model is required to be the permanent self;
12. the architecture remains useful even if frontier continual-learning research changes substantially.

## 25. Final doctrine

AXIOM's role is not to solve continual learning entirely inside neural weights.

Its role is to make lifelong cognition governable.

The persistent agent owns its continuity, evidence, learning lineage, and authority state. It may rent extraordinary intelligence from frontier providers, run local models, compose specialists, preserve provider-bound persistence, acquire released weights, distill descendants, and develop an optional identity kernel. The valuable results of those interactions should become progressively more reusable where economics, quality, privacy, and sovereignty justify doing so.

The long-horizon objective is therefore:

> **Experience once. Preserve retained evidence exactly. Understand progressively. Reuse cheaply. Promote cautiously. Own what becomes worth owning.**

That is the AXIOM continual-learning model.
