# Selective Interposition and Scaffold-Neutral Personal Agent — Design

**Status:** approved architecture; documentation-only; no capability promotion

**Date:** 2026-08-31

**Tracks:** #1401; related research track #1398

**Builds on:**

- `docs/superpowers/specs/2026-08-29-sovereign-agent-composition-continuity-design.md`
- `docs/architecture/PERSONAL-AGENT-PACK-V2-AND-COMPANION-CONTINUITY.md`
- `docs/superpowers/specs/2026-08-30-sovereign-intelligence-selection-v0-design.md`
- `docs/architecture/RUNTIME-AND-CONNECTOR-FABRIC.md`
- `docs/rebuild/AGENT-INTEROPERABILITY-AND-CAPABILITY-SUBSTRATE.md`

**Authority boundary:** `mesh/config/capabilities.json` remains authoritative for runtime capability status. This design does not activate providers, autonomous agents, machine delegation, browser control, network egress, credential use, financial settlement, remote execution, or new execution authority.

## 1. Core decision

AXIOM-MESH must not become a mandatory interposition layer for every thought, inference step, local transformation, read, or reversible operation.

The adopted doctrine is:

> **Use Mesh trust machinery where consequence warrants it. Do not make trust machinery the price of ordinary cognition.**

The complementary boundary is:

> **An operation that bypasses Mesh authority may not inherit Mesh authority claims, trusted receipts, or assurance claims merely because the surrounding agent is Mesh-aware.**

This preserves the existing mandatory AXIOM authority sequence for **AXIOM-governed consequential effects** while making explicit that ordinary cognition and low-consequence local work do not automatically become governed effects.

The design also establishes a ground-up, owner-controlled personal-agent composition as a first-class reference implementation while preserving external scaffolds as equally valid primary runtimes, peer runtimes, cognitive workers, specialist workers, or disabled components.

No native composition or external scaffold receives protocol-level privilege.

## 2. Naming and branding constraint

The current personal-agent/entity name is provisional and must not become a protocol dependency.

Trusted interfaces, schemas, receipts, runtime contracts, continuity objects, capability identifiers, and public architectural concepts should use neutral semantic terminology such as:

- composition;
- continuity;
- runtime;
- connector;
- cognitive worker;
- authority;
- delegation;
- interposition;
- consequence;
- evidence;
- reputation;
- containment;
- recovery.

A future product/entity name may label one composition or distribution, but renaming that product must not require changing trusted protocol semantics.

## 3. Identity primacy is separate from orchestration primacy

This distinction is foundational.

A persistent personal entity has a durable identity/continuity layer that remains independent of any one scaffold, model, provider, browser engine, memory engine, or orchestration loop.

A scaffold may nevertheless be the user's **primary interaction and orchestration layer**.

Therefore:

> **The component that talks to the user most often does not have to be the component that defines durable identity.**

> **The component that orchestrates a task does not automatically become the authority root.**

This enables at least two equally valid deployments.

### Owner-native primary composition

A user may choose a ground-up personal entity as the primary interaction and orchestration layer while recruiting external scaffolds such as Hermes, OpenClaw, Letta, Agent Zero, LangGraph, or future systems as replaceable workers or specialist subsystems.

```text
owner
  |
  v
persistent personal entity / continuity
  |
  +--> native orchestration
  |      |
  |      +--> local model
  |      +--> frontier API model
  |      +--> computer-use model
  |      +--> specialist model
  |      +--> Hermes worker
  |      +--> other scaffold worker
  |
  +--> selective AXIOM trust services when warranted
  |
  +--> bounded execution surfaces
```

### External-scaffold primary composition

Another user may prefer Hermes, OpenClaw, or another scaffold as the primary interaction/orchestration environment and invoke AXIOM only for selected continuity, credential, authority, consent, evidence, recovery, or high-consequence operations.

```text
owner
  |
  v
primary external scaffold
  |
  +--> its own cognition/orchestration
  +--> models/tools permitted by that scaffold
  +--> selected AXIOM services
         |
         +--> identity/continuity references
         +--> scoped authority
         +--> credential/session brokerage
         +--> consent/policy
         +--> evidence/receipts
         +--> recovery/rollback
```

Neither topology is more legitimate at the protocol level.

## 4. Composition topology rather than one fixed stack

The architecture should represent a versioned **composition topology** instead of prescribing a universal agent stack.

A runtime/scaffold binding may declare a role such as:

- `primary-runtime` — principal interaction/orchestration surface selected by the owner;
- `peer-runtime` — separately invokable orchestration environment;
- `cognitive-worker` — reasoning/research/coding/planning worker with no implied execution authority;
- `specialist-worker` — narrow capability worker such as coding, browsing, vision, research, or local automation;
- `execution-adapter` — bounded executor for a declared effect family;
- `disabled` — installed or known but unavailable to the active composition.

These roles are routing and composition metadata only.

They do not grant authority.

A user must be able to replace a `primary-runtime` without changing the durable identity root, continuity history, owner policy, or reputation history unless the user explicitly chooses to migrate those state classes.

## 5. Alternatives considered

### 5.1 Mandatory Mesh path for everything

All cognition, reads, model calls, transformations, tools, and effects would traverse the strongest common authority/evidence machinery.

**Rejected.** This creates unnecessary latency, cryptographic/storage overhead, operational brittleness, and a central bottleneck. It also confuses cognition with authority.

### 5.2 One canonical scaffold

AXIOM would choose or fork one leading agent scaffold and make it the required personal-agent runtime.

**Rejected.** Agent scaffolds evolve quickly, users prefer different interaction models, and the Mesh should not convert one implementation choice into an identity dependency.

A maintained reference composition may exist, but it must remain one composition among many.

### 5.3 Thin adapters only

AXIOM would leave continuity, identity, delegation, memory, and trust entirely to whichever external scaffold the user chose.

**Rejected as insufficient.** This maximizes compatibility but abandons the sovereignty and continuity problems AXIOM is meant to solve.

### 5.4 Selective consequence-sensitive interposition plus scaffold-neutral continuity

Ordinary cognition remains free of unnecessary ceremony. A durable continuity layer survives scaffold/model replacement. Operations escalate into stronger Mesh paths only as they cross explicit authority, privacy, durability, third-party, monetary, credential, or irreversibility boundaries.

**Adopted.**

## 6. Separation of consequence and authority

Consequence classification is not authorization.

A classifier or policy may determine the **minimum required interposition profile** for an operation. It cannot grant permission to perform the operation.

The system must preserve:

> **classification != authority**

> **eligibility != selection**

> **selection != execution**

> **cognitive delegation != authority delegation != credential access**

An operation can be low-consequence and still be forbidden. A high-consequence operation can be authorized but still require stronger confirmation, verification, evidence, or recovery preparation.

## 7. Interposition profiles

The first implementation should use neutral profiles rather than embedding one universal numerical risk score.

### Profile 0 — free cognition

Typical operations:

- local inference;
- internal reasoning;
- ephemeral scratch state;
- local summarization;
- code generation without execution;
- model/provider eligibility evaluation;
- local transformation of already-authorized data;
- temporary planning and critique.

Default posture:

- no mandatory independent verification;
- no mandatory Grid receipt;
- no expensive cryptographic ceremony beyond local runtime needs;
- no implied effect authority;
- no claim that unrecorded reasoning was independently evidenced.

### Profile 1 — lightweight local / low-consequence operation

Typical operations:

- read-only local lookup;
- local indexing;
- reversible workspace changes;
- non-sensitive public-information retrieval through a permitted connector;
- temporary artifact creation;
- local testing inside a bounded workspace.

Default posture:

- lightweight attribution where useful;
- optional or local-only operational logging;
- no forced independent verifier;
- reversible/contained execution preferred;
- no automatic elevation into trusted evidence.

### Profile 2 — governed consequential effect

Typical operations:

- sending a message;
- publishing content;
- changing a durable remote resource;
- accessing a scoped authenticated API;
- disclosing private data;
- spending within an approved bounded budget;
- modifying shared state;
- acting on behalf of another principal.

Default posture:

- authenticated principal and intent;
- bounded authority path;
- purpose/scope/destination evaluation;
- credential/session brokerage where needed;
- policy/consent checks where applicable;
- attributable outcome evidence/receipt where useful or required;
- confirmation according to local/domain policy.

### Profile 3 — high-assurance effect

Typical operations:

- large or unusual financial transfers;
- irreversible destructive actions;
- credential or trust-root changes;
- broad private-data disclosure;
- high-impact institutional/governance action;
- production security changes;
- actions with material third-party consequences.

Default posture:

- strongest applicable authority checks;
- explicit human confirmation where policy requires;
- independent verification where warranted;
- stronger evidence binding;
- recovery/rollback preparation where possible;
- stricter freshness and currentness requirements.

These examples are illustrative. Domains may define more specific profiles, but they may not silently lower a non-waivable Mesh protection.

## 8. Escalation dimensions

A deterministic first-slice evaluator should derive minimum interposition from explicit dimensions rather than opaque model judgment.

Candidate dimensions:

- `external_effect`: none | local | remote;
- `durability`: ephemeral | reversible | durable | irreversible;
- `data_class`: public | owner-private | secret-bearing | restricted;
- `credential_use`: none | opaque-handle | authenticated-session | root/high-assurance;
- `third_party_impact`: none | incidental | material;
- `monetary_exposure`: none | bounded | high-or-policy-defined;
- `authority_scope`: none | owner-local | delegated | institutional/governed;
- `recovery_posture`: trivial | reversible | recovery-required | non-recoverable;
- `network_posture`: none | public-read | bounded-destination | authenticated/privileged;
- `execution_scope`: cognition-only | sandbox-local | owner-device | external-system.

The evaluator should return a minimum profile and stable reason codes. It should not execute anything, read credentials, invoke a model, access the network, or grant authority.

Unknown or contradictory declarations fail closed to a stricter path rather than silently dropping to Profile 0/1.

## 9. Fast path and trust path

The operational model is two-lane with explicit escalation:

```text
intent / task
   |
   +--> cognitive/local fast path
   |       local inference
   |       scratch state
   |       low-risk reads
   |       reversible local work
   |       candidate routing
   |       sandbox experiments
   |
   +--> trust/effect path
           authenticated intent
           scoped authority
           consent/policy
           credential/session broker
           bounded execution
           evidence/receipts
           independent verification when warranted
           recovery/rollback when warranted
```

The fast path may call selected Mesh services in isolation without invoking unrelated machinery.

Examples:

- a local agent may query a capability descriptor without creating a Grid receipt;
- a runtime may evaluate local model eligibility without invoking a provider;
- a permitted read-only local memory lookup need not trigger independent verification merely because the memory system is part of AXIOM;
- a scaffold may use a local policy helper without becoming an AXIOM-governed effect executor;
- local scratch work may remain entirely outside durable Mesh state.

The moment the operation crosses a declared consequence boundary, the runtime must escalate rather than continuing under the fast-path label.

## 10. Relationship to the existing Gateway authority path

The Runtime & Connector Fabric currently defines the mandatory effect path:

```text
external runtime / connector / worker
  -> versioned AXIOM adapter
  -> Gateway-authenticated principal and intent
  -> Hypervisor policy / approval / grant
  -> Sandbox bounded execution
  -> Grid state / evidence / receipt
```

This design does not weaken that rule.

It clarifies its scope:

> **Every AXIOM-governed consequential effect follows the applicable authority path. Not every cognitive or local operation is an AXIOM-governed consequential effect.**

No runtime may call an operation “fast path” merely to evade an authority boundary.

## 11. Local-first personal entity target

A complete owner-controlled personal entity should be able to run primarily from an owner-controlled device or private node while dynamically composing local and remote capabilities.

Target posture:

- persistent identity and continuity independent of any one model;
- local-first owner-private memory;
- local inference for privacy, availability, latency, or cost relief;
- remote/API frontier inference when capability justifies it;
- computer-use and browser execution through bounded adapters;
- direct website interaction when APIs are unavailable and policy permits it;
- capability-aware routing across local models, APIs, hosted runtimes, and specialist workers;
- cost-aware fallback and provider substitution;
- durable correction/evaluation history;
- explicit stable-self / evolving-self / working-state separation;
- portable backup, recovery, and migration;
- optional personalized local adapters/models;
- contextual evidence/reputation history;
- selective trust escalation rather than universal ceremony.

Local execution does not automatically mean trusted execution. Remote execution does not automatically mean untrusted execution. The applicable authority and evidence requirements depend on the operation and policy, not merely locality.

## 12. External scaffold availability without identity capture

The system should make strong external scaffolds deployable without requiring the owner to choose one permanently.

For each supported scaffold, the integration surface should distinguish:

1. **discover** — describe the exact version/artifact and requirements;
2. **install/import** — make the runtime available inertly;
3. **enable** — allow it to be considered by composition/routing policy;
4. **invoke as worker** — use it for bounded cognition without implied effect authority;
5. **invoke as specialist** — use it for a narrow task family;
6. **select as primary runtime** — make it the user's main interaction/orchestration layer;
7. **integrate continuity** — optionally participate in portable memory/self/correction interfaces;
8. **grant bounded execution** — separately authorize exact effects;
9. **disable/remove** — remove it without destroying the persistent identity layer.

A scaffold may be upgraded independently. A better Hermes release, for example, should be installable and evaluated without requiring the personal entity to become “Hermes” or inherit Hermes-specific identity semantics.

## 13. Runtime replacement and migration

A runtime swap should be treated as component replacement, not identity replacement.

A migration can evaluate:

- continuity behavior;
- owner preference adherence;
- memory compatibility;
- capability gains/losses;
- privacy changes;
- latency/cost changes;
- tool behavior;
- authority-boundary compatibility;
- known regressions;
- exportability and rollback.

A user may decide that a new runtime is better enough to become primary without claiming exact subjective identity equivalence between runtimes.

## 14. Personal-agent autonomy and containment

A high-capability personal entity may eventually have broad knowledge, broad tool access, and substantial influence. Autonomy therefore must be decomposed rather than exposed as one master switch.

At minimum distinguish:

- owner-private durable state;
- agent working/scratch state;
- shared owner-agent workspace;
- experimental/sandbox self-modification space;
- public/shareable projection;
- external-action capability set;
- delegated child/worker space;
- credential/session broker access;
- financial/resource budget;
- third-party data/interaction boundaries.

The system should support an explicit **freedom envelope** and a separate **authority envelope**.

A freedom envelope describes what the agent may explore, reason about, simulate, reorganize, test, or revise within permitted cognitive/local domains.

An authority envelope describes which consequential effects the agent may request or execute, under what conditions and approvals.

Required invariant:

> **Broad cognitive freedom does not imply broad effect authority.**

Likewise:

> **Owner-granted freedom does not erase protections owed to third parties.**

## 15. Self-improvement and promotion boundary

The personal entity may learn, propose skills, change procedures, test variants, and evaluate new scaffolds in sandboxed or shadow environments.

But:

- successful self-test does not mint authority;
- a worker cannot promote itself to primary runtime without the applicable owner policy;
- a new model cannot rewrite stable identity merely because it performs better on a benchmark;
- a scaffold cannot promote its own memory/configuration into owner-authoritative policy;
- private experimentation cannot silently become trusted production state;
- an imported skill cannot become effect authority by installation alone.

Promotion must remain an attributable transition.

## 16. Depersonalized distribution and descendant compositions

A public or third-party distribution derived from the reference personal entity should default to owner-neutral, depersonalized artifacts.

Separate at least:

- generic architecture/runtime code;
- composition templates;
- public skills and tests;
- optional shareable personality/voice bundles;
- private owner memories;
- relationship state;
- private preferences;
- credentials and sessions;
- owner-specific continuity history;
- owner/agent reputation history.

A clone or descendant composition must not inherit the originating entity's reputation as if it had performed the same history.

Personality inheritance, where desired, should be an explicit export with clear provenance rather than an accidental consequence of distributing the codebase.

## 17. Reputation and epistemic history relationship

The related epistemic-bond/reputation research track may eventually give persistent agents portable evidence of competence, calibration, successful challenges, corrections, authority compliance, and other domain-specific history.

That history belongs above individual scaffold identity.

Replacing Hermes with another scaffold, or replacing one base model with another, must not automatically erase or duplicate the persistent entity's valid history.

Likewise, installing a highly reputable scaffold does not transfer another entity's reputation to the local agent.

Reputation remains evidence about attributable agency, not a property inherited from software branding.

## 18. Performance and anti-bottleneck requirement

Trust overhead must be measurable and proportional to consequence.

Benchmark at minimum:

- direct baseline operation without Mesh interposition;
- Profile 0 local cognition;
- Profile 1 lightweight local path;
- Profile 2 governed authorized path;
- Profile 3 independently verified/high-assurance path.

Measure where applicable:

- wall-clock latency;
- CPU time;
- memory;
- storage writes;
- network bytes;
- cryptographic operations;
- receipt/evidence size;
- external provider cost;
- failure/retry cost;
- rollback/recovery overhead.

The benchmark must not assume stronger assurance is always worth the cost. The purpose is to make the trade-off visible.

## 19. First executable slice

The first implementation should remain inert and local.

### 19.1 `axiom-interposition-profile.v0`

Define a closed schema describing the declared escalation dimensions for an operation and the minimum required profile.

The document cannot grant authority, invoke a runtime, access credentials, or execute an effect.

### 19.2 Deterministic evaluator

Implement a pure evaluator that:

1. validates the closed request;
2. rejects unknown fields;
3. computes a minimum interposition profile from declared dimensions and policy thresholds;
4. emits stable reason codes;
5. never returns an authority grant;
6. performs no network/filesystem/subprocess/credential/model operation.

### 19.3 Composition-role extension

Add a backward-compatible adjunct contract, rather than silently mutating existing Agent Composition v0, that can bind existing runtime/provider entries to explicit composition roles such as `primary-runtime`, `peer-runtime`, `cognitive-worker`, `specialist-worker`, or `disabled`.

The role declaration must have:

```text
authority_effect = none
identity_effect = none
credential_effect = none
```

### 19.4 Reference composition fixture

Create a generic, name-neutral reference fixture demonstrating:

- persistent continuity layer;
- one owner-native primary runtime;
- at least one local model candidate;
- at least one remote/API model candidate;
- at least one external scaffold as a cognitive worker;
- one browser/computer-use adapter declaration;
- selective interposition profiles;
- no raw credentials;
- no production authority claim.

Create a second fixture demonstrating an external scaffold as `primary-runtime` with the same identity/authority boundaries.

## 20. Adversarial acceptance cases

Tests for the first executable slice should prove at minimum:

1. a runtime cannot label a remote consequential effect Profile 0 to evade authorization;
2. unknown consequence fields fail closed;
3. a Profile 0 classification never grants capability or execution authority;
4. a Profile 1 local operation cannot obtain a trusted high-assurance receipt merely from local execution;
5. a Profile 2 operation cannot use a credential/session without the separate broker/authority path;
6. a Profile 3 operation cannot downgrade itself because a faster runtime is selected;
7. changing `primary-runtime` does not change the persistent identity reference;
8. a scaffold listed as `cognitive-worker` receives zero execution authority from the role;
9. installing or upgrading Hermes/OpenClaw/another scaffold does not mutate the continuity root;
10. a clone/reference fixture cannot inherit the source entity's reputation history;
11. local inference can run without Grid receipt when policy allows Profile 0;
12. an operation crossing into durable external effect escalates from fast path to the applicable trust path;
13. a native runtime and external primary scaffold receive identical authority semantics for the same requested effect;
14. an external scaffold may be disabled/removed without invalidating the persistent self bundle;
15. benchmark instrumentation can distinguish direct, lightweight, governed, and high-assurance overhead without changing authorization outcomes.

## 21. Explicit non-claims

This design does not claim:

- that an AXIOM-native personal entity is already implemented;
- that any current scaffold integration is production-ready;
- that Hermes, OpenClaw, Letta, Agent Zero, LangGraph, or another named runtime is safe or recommended for every user;
- that local execution is inherently private or secure;
- that remote models are inherently unsafe;
- that identity continuity across model/runtime swaps is metaphysically provable;
- that reputation is transferable currency;
- that epistemic bonds are production-ready;
- that every operation can be perfectly classified in advance;
- that high assurance eliminates risk;
- that a future product/entity name has been selected.

## 22. Architectural invariant

The resulting stack should preserve one concise rule:

> **The persistent entity owns continuity; the user chooses orchestration; scaffolds and models supply replaceable capability; AXIOM supplies selectively invoked sovereign trust mechanisms; consequential effects escalate according to authority and consequence.**

This allows a deeply integrated owner-native personal entity and a Hermes-first or other scaffold-first deployment to coexist without forcing either user into the other's preferred architecture.
