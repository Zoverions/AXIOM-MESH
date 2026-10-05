# Sovereign Agent Composition, Continuity, and Credential Brokering — Design

**Status:** proposed architectural extension; implementation requires a separate approved plan

**Date:** 2026-08-29

**Scope:** AXIOM-MESH agent interoperability, persistent agent identity, model/runtime composition, bounded delegation, credential/session brokering, skill evolution, and voluntary network learning

**Authority:** `mesh/config/capabilities.json` remains authoritative for capability status. This document does not promote any capability, enable autonomous agents, or grant new runtime authority.

## 1. Design doctrine

> **AXIOM should not prescribe what an agent is made of. It should provide the sovereign substrate in which agents, humans, tools, models, memories, skills, institutions, and networks can safely compose.**

AXIOM exists to preserve identity, authority, consent, provenance, portability, verification, reversibility, and user sovereignty. It must not require a particular LLM, scaffold, orchestration loop, memory system, skill format, browser engine, provider, user interface, or cognitive architecture when those choices can remain replaceable.

The implementation doctrine is therefore:

> **Hard sovereignty; soft implementation.**

The trusted substrate defines the safety and accountability boundary. Components above that boundary remain configurable and replaceable.

This extends the existing agent-interoperability doctrine rather than replacing it. External frameworks remain clients/integration targets rather than authority roots; discovery does not grant permission; imported skills do not grant authority; credentials remain purpose-bound; and privileged effects continue through the normal AXIOM authority path.

## 2. Goals

The architecture should make all of the following possible without conflating them:

1. A user may retain an existing scaffold such as Hermes, OpenClaw, Letta, LangGraph, Agent Zero, or a future runtime.
2. A persistent agent may switch among frontier, local, specialist, and computer-use models without treating the model as the agent's identity.
3. A user may choose an AXIOM-native reference composition without making that composition mandatory for the Mesh.
4. Agent memory and self-model state may remain portable independently of any one inference provider.
5. Cognitive work may be delegated to temporary workers without automatically delegating execution authority.
6. Execution authority may be attenuated without passing passwords, passkeys, TOTP seeds, refresh tokens, session cookies, or other master credentials to a model or child agent.
7. Agent upgrades may be measured for continuity rather than accepted merely because a new model is more capable.
8. Agents may learn, propose skills, and improve procedures without becoming self-authorizing.
9. Useful discoveries may propagate through the Mesh with evidence and provenance while adoption remains voluntary and local.
10. Existing AXIOM authority, evidence, consent, portability, causal, recovery, and governance invariants remain intact.

## 3. Non-goals

This design does **not**:

- define one universal agent loop;
- make a model, scaffold, memory engine, or vector store mandatory;
- claim that a text persona file alone preserves identity;
- claim that a distilled model or LoRA is the canonical self;
- enable unrestricted autonomous research, self-modification, or recursive self-improvement;
- enable machine delegation merely because a composition describes delegates;
- treat model output, shared skills, Circle decisions, or network reputation as authority;
- expose user secrets to third-party models as a convenience shortcut;
- replace the existing Gateway/Hypervisor/Sandbox/Grid authority path;
- create a universal moral, trust, or reputation score;
- claim that psychological continuity can be perfectly proven.

## 4. Architectural choice

Three broad strategies were considered.

### 4.1 Own/fork the full agent stack

AXIOM could maintain its own general-purpose agent runtime and require users to use it. This would provide strong integration but would recreate fast-moving scaffolding work, reduce user choice, create migration pressure, and make AXIOM responsible for innovation above its strongest architectural boundary.

**Decision:** reject as the Mesh default. A native reference agent may exist, but it must remain one composition among many.

### 4.2 Thin adapters only

AXIOM could expose capabilities through adapters while leaving identity, memory, delegation, credentials, and continuity entirely to external frameworks.

This maximizes compatibility but leaves the most important sovereignty problems unresolved. A framework swap can still feel like a brain transplant; child agents may inherit excessive authority; and credential handling remains framework-specific.

**Decision:** insufficient by itself.

### 4.3 Sovereign control plane plus replaceable cognitive/runtime components

AXIOM owns the minimal substrate required for attributable, bounded, portable, and verifiable operation while allowing the user to choose the components above it.

**Decision:** adopt.

## 5. Layer model

The target architecture is divided into layers with explicit responsibilities.

```text
Human / Institution / Circle authority
                 |
                 v
+-------------------------------------------------------+
| AXIOM sovereign substrate                             |
|                                                       |
| identity roots | principals | consent | policy        |
| delegation     | receipts   | evidence | recovery     |
| credential/session broker | portability | revocation  |
+--------------------------+----------------------------+
                           |
                           v
+-------------------------------------------------------+
| Agent continuity and composition layer                |
|                                                       |
| canonical self refs | continuity policy | memory refs |
| runtime adapters    | model profiles    | skill refs  |
| cognitive workers   | assurance preferences           |
+--------------------------+----------------------------+
                           |
                           v
+-------------------------------------------------------+
| Replaceable cognitive/runtime components              |
|                                                       |
| GPT / Claude / Gemini / Qwen / local models           |
| Hermes / OpenClaw / Letta / LangGraph / Agent Zero    |
| Graphiti / Mem0 / custom memory / native memory       |
| MCP / native tools / imported skills / custom tools   |
+--------------------------+----------------------------+
                           |
                           v
+-------------------------------------------------------+
| Bounded execution                                     |
| browser | APIs | files | compute | remote workers     |
+-------------------------------------------------------+
```

The model is not the authority root. The scaffold is not the authority root. The memory provider is not the authority root. A manifest describing a component is not an authority root.

## 6. Three supported integration depths

Axiom should support progressively deeper integration without forcing the deepest mode.

### Wrapped

An existing agent stack remains substantially unchanged. AXIOM provides identity attribution, bounded invocation, credential/session brokering, execution boundaries, evidence, and receipts.

### Integrated

The stack additionally participates in AXIOM continuity, portable self/memory references, skill lifecycle hooks, and structured cognitive delegation.

### Native

An AXIOM-native reference agent composes the same public substrate primitives directly. It may provide the deepest user experience but receives no protocol-level privilege merely for being native.

A runtime must be able to move between these modes through explicit configuration and evidence; mode labels do not grant authority.

## 7. Persistent agent self

A persistent agent needs a representation above any one LLM. The canonical self should be a **versioned bundle of references and evidence**, not a requirement to encode identity in a single representation.

The self may include:

- cryptographic/principal identity references;
- stable values and non-negotiable boundaries;
- worldview and preference records;
- relationship state with provenance and consent constraints;
- autobiographical/episodic memory references;
- semantic knowledge and belief-state references;
- procedural habits and skill preferences;
- canonical dialogue/decision exemplars;
- current goals and commitments;
- model-specific prompt/compiler profiles;
- optional embeddings, steering vectors, adapters, or personalized models;
- continuity test suites and historical evaluation reports;
- signed self-revision history.

No single optional representation is canonical by itself. A LoRA tied to one model family may improve fidelity, but it is a derived artifact. A SOUL-style file may be useful, but it is a human-readable projection. A persona vector may be useful where supported, but it is model-specific evidence rather than the identity root.

### Stable identity versus evolving state

The self must distinguish at least:

1. **stable identity** — high-persistence values, boundaries, relationships, and self-description;
2. **evolving identity state** — beliefs, preferences, goals, learned practices, and relationship development;
3. **current working state** — short-lived task context, temporary mood/stance, active hypotheses, and transient plans.

A model swap must not silently rewrite stable identity. Normal learning may update evolving state when the update is attributable and policy permits it.

## 8. Identity evolution: growth versus drift

A persistent agent should be allowed to change without treating all change as failure.

Every durable self change should be attributable to one of:

- explicit user instruction;
- authenticated agent reflection under an allowed self-revision policy;
- accepted evidence/experience update;
- imported signed state;
- governed migration/repair;
- correction of an earlier record.

The system should retain prior versions and causal/provenance links rather than overwriting the self without history.

A continuity evaluator may identify suspected **drift** when behavior changes materially without a corresponding accepted self revision.

Continuity scoring is advisory evidence unless a policy explicitly uses it as a gate. It must never become a universal personhood or worth score.

## 9. Identity compiler and model/runtime profiles

A canonical self should be projected differently for different models and runtimes where evidence shows that the same encoding produces different behavior.

An **Identity Compiler** may generate runtime-specific inputs such as:

- system/persona instructions;
- retrieved memory sets;
- demonstrations/exemplars;
- preference examples;
- context ordering;
- decoding constraints;
- optional soft prompts;
- optional LoRA/adapters;
- optional steering/persona vectors.

Each generated projection must retain a digest link to the canonical self version and compiler/profile version used.

The compiler is not an authority system. A model-specific profile may improve behavioral continuity but cannot relax policy, consent, approval, or execution controls.

## 10. Continuity evaluation and model migration

A model/runtime upgrade should be evaluated before it becomes the default embodiment of a persistent agent when the user has enabled continuity gating.

A continuity suite may test:

- values and boundary adherence;
- decision tendencies;
- uncertainty handling;
- disagreement behavior;
- relationship behavior;
- conversational voice;
- humor and social style;
- preference consistency;
- tool-selection behavior;
- privacy/consent behavior;
- response to stress or adversarial framing;
- novel scenarios not directly copied from the self bundle.

The output should be a versioned report with dimension scores, evidence references, model/runtime identifiers, compiler profile, and test-suite digest.

Users may configure continuity policy. For example:

- observe only;
- warn on regression;
- require manual approval below a threshold;
- automatically reject migration below a threshold;
- require independent evaluation for high-consequence agents.

No default threshold is asserted by this design.

## 11. Cognitive delegation is not authority delegation

The architecture must represent three different transfers independently:

1. **cognitive delegation** — ask another model/worker to reason, research, code, summarize, or propose;
2. **authority delegation** — permit another principal to request or execute a bounded capability;
3. **credential/session access** — allow a trusted executor to exercise a secret-backed or session-backed operation.

A cognitive worker may have zero execution authority.

An authority delegation may be attenuated and expiring without containing credentials.

Credential/session use may be brokered to an executor without revealing the underlying secret to either the reasoning model or the agent transcript.

This separation is a core invariant:

> **Cognitive delegation does not imply authority delegation. Authority delegation does not imply credential delegation.**

## 12. Credential and session broker

The target design adds a trusted **Credential & Session Broker** inside the sovereign-node boundary.

Models should receive authority to request operations, not passwords or master secrets.

The broker should eventually support, where technically feasible:

- API keys stored outside model-visible context;
- OAuth access/refresh handling;
- purpose-bound short-lived tokens;
- passkeys and hardware-backed signing;
- client certificates;
- TOTP generation without disclosing the seed;
- authenticated browser sessions/cookies;
- service-specific delegated tokens;
- local secure credential injection;
- revocation and expiry;
- audit/evidence that records use without recording the secret.

### Trusted browser/session executor

For websites that require interactive authentication rather than an API, a trusted browser/session executor may mediate the session.

A model may request actions such as navigate, click, search, download, or submit. The trusted executor controls secret-bearing browser surfaces such as password injection, cookies, browser storage, authorization headers, passkey operations, and TOTP generation.

The model-visible representation should be redacted so secrets cannot be recovered from DOM snapshots, logs, screenshots, errors, or tool responses where technically preventable.

Some authentication steps may still require live human confirmation. Axiom must treat this as a policy/assurance decision rather than attempting to bypass MFA.

## 13. Delegation contract direction

Future machine delegation should build on the existing attenuation-only programme.

A delegation may constrain:

- delegator and delegate principals;
- capability/action families;
- purpose;
- data/input classes;
- destinations;
- time and expiry;
- cost/compute/storage/network budgets;
- assurance floor;
- required human/independent approval;
- delegation depth;
- allowed broker operations;
- cancellation/revocation behavior.

A child delegation must not widen the parent. Protocol aliases, model/tool renames, wrapper agents, or scaffold translations must not evade attenuation checks.

Receipts should preserve sufficient delegation provenance to reconstruct who requested, delegated, executed, verified, and approved an effect without unnecessarily leaking unrelated private state.

## 14. Skill, wiki, and self-improvement lifecycle

Axiom should support agents that improve their procedures while preventing learning from becoming self-authorizing code execution.

The lifecycle is:

```text
raw experience
  -> observations/evidence
  -> knowledge/wiki update
  -> procedure/skill candidate
  -> skill proposal
  -> static/adversarial review
  -> sandbox/conformance testing
  -> optional shadow mode
  -> evidence package
  -> governed activation
  -> runtime monitoring
  -> revision or rollback
```

The following must remain distinct:

- learning a fact;
- updating knowledge/wiki state;
- proposing a skill;
- installing/importing an inert skill artifact;
- activating code;
- granting runtime capability;
- allowing further delegation.

None should silently imply the next.

An agent may autonomously propose improvements when authorized to do so. It must not be able to convert a successful test into broader runtime authority without the applicable policy/approval path.

## 15. Network improvement without compulsory uniformity

The Mesh should allow useful discoveries to improve other nodes without centralizing control.

Shareable artifacts may include:

- skills and procedures;
- negative tests and failure cases;
- security detections;
- model/runtime compatibility profiles;
- continuity test suites;
- memory techniques;
- governance procedures;
- policy templates;
- benchmark evidence;
- repair procedures;
- model configuration recipes.

Sharing an artifact grants no authority on the recipient node.

Recipients should be able to inspect source, version, license, digest, declared requirements, evidence, known failures, and update differences before adoption.

The network learning loop is:

> **experience -> evidence -> knowledge -> proposal -> testing -> verification -> publication -> voluntary adoption -> monitoring -> revision/rollback**

This is the intended relationship between local sovereignty and collective improvement.

## 16. Configurable assurance

Axiom should permit users and domains to choose higher assurance where needed without requiring maximum ceremony for low-consequence actions.

An assurance policy may distinguish, for example:

- minimal local convenience action;
- ordinary authenticated action;
- confirmation-required action;
- independently verified action;
- hardware-bound action;
- human-confirmed high-consequence action;
- governed/constitutional action.

A user preference may raise requirements. A domain or Circle may raise requirements within its lawful authority. No configurable profile may silently lower a non-waivable Mesh safety requirement.

## 17. Agent Composition Contract v0 — first executable slice

The first implementation should remain deliberately inert and local.

### Purpose

Define and validate a versioned, zero-authority description of how a persistent agent is composed. The contract lets AXIOM describe existing and future stacks without treating any described component as trusted or authorized.

### Proposed contract fields

The exact schema may be refined during implementation, but v0 should contain only fields required to prove the architectural boundary:

- schema/profile version;
- composition identifier;
- existing AXIOM principal reference;
- integration mode: `wrapped | integrated | native`;
- canonical self-bundle reference/digest;
- declared runtime/scaffold adapters;
- declared model-provider profiles;
- declared memory providers;
- declared skill sources/registries;
- cognitive-worker policy references;
- continuity-policy reference;
- credential/session-broker policy reference;
- assurance-policy reference;
- portability/export preference;
- creation/update metadata and digest.

### Mandatory v0 invariants

1. A composition document cannot create a principal.
2. A composition document cannot create or widen authority.
3. A listed runtime, model, memory provider, or skill source receives zero authority from being listed.
4. Credential values, TOTP seeds, cookies, refresh tokens, passkey private keys, and other secrets are forbidden in the composition document.
5. Cognitive-worker declarations do not imply machine delegation.
6. `native` mode receives no special authority bypass.
7. Unknown fields fail closed for the exact v0 profile.
8. Canonicalization and digest computation are deterministic.
9. Referenced policy/self artifacts are identifiers/digests, not unverified inline replacements.
10. Validation is pure and has no network, filesystem mutation, credential, or execution effect.

### Expected initial files

Implementation planning should evaluate the repository's current naming conventions, with the likely minimal slice resembling:

- `mesh/config/agent-composition-v0.schema.json`
- `mesh/src/lib/agent-composition.mjs`
- `mesh/test/agent-composition.test.mjs`
- capability/evidence registry updates only after implementation evidence justifies them
- roadmap/todo/threat-model updates sufficient to prevent claim drift

The implementation should use existing canonicalization, digest, schema-validation, registry, and evidence-binding patterns rather than introducing a parallel framework.

## 18. Follow-on slices

After the inert composition contract is implemented and verified, work should proceed in independently promotable slices.

### Slice 2 — Self Bundle Index and continuity reports

Add a portable, content-addressed self-bundle index and versioned continuity-evaluation report. Keep model-specific adapters/embeddings as derived artifacts.

### Slice 3 — Credential/session broker laboratory

Implement one low-risk secret-free brokered operation first, then one interactive browser/session case. Prove that the model/client cannot retrieve the underlying secret or unrestricted session material.

### Slice 4 — Cognitive worker contract

Represent temporary reasoning workers separately from authority delegates. Prove zero-authority cognitive delegation and explicit escalation through normal AXIOM intents when an effect is required.

### Slice 5 — Attenuated authority delegation

Continue the existing delegation programme only after its current promotion prerequisites are satisfied. Preserve currentness, revocation, depth, subset, and confused-deputy protections.

### Slice 6 — Skill evolution laboratory

Build the raw/evidence/wiki/proposal/test/shadow/activate/rollback lifecycle using inert skill import and existing capsule/policy boundaries.

### Slice 7 — Reference sovereign agent

Compose the strongest available primitives into an AXIOM-native personal agent for dogfooding. It remains a reference composition rather than the protocol definition.

## 19. Threat model additions

The following threats must be covered before corresponding live features are promoted:

- personality/self drift caused by model change without accepted self revision;
- self-bundle poisoning or provenance substitution;
- malicious identity-compiler profiles;
- model/provider prompt injection that requests broader authority;
- runtime/scaffold claiming a false principal or composition identity;
- cognitive worker treated as an authority delegate accidentally;
- delegation laundering through wrapper agents or renamed tools;
- credential exfiltration through prompts, DOM, logs, screenshots, errors, browser storage, headers, or tool metadata;
- session fixation or stolen authenticated browser state;
- stale/revoked delegation or broker authorization;
- skill proposal that smuggles undeclared effects;
- self-improvement loop that promotes its own authority;
- malicious shared skill/update that exploits trust in network reputation;
- continuity tests overfit to known prompts while novel-scenario behavior diverges;
- identity bundle rollback/replay that resurrects revoked beliefs, credentials, or authority references;
- native-reference-agent privilege creep.

## 20. Verification strategy

The first inert slice should be tested primarily through deterministic unit/property tests and negative fixtures.

Minimum tests should prove:

- deterministic canonical digest;
- exact schema/version rejection;
- no unknown-field acceptance;
- no inline secret-bearing fields;
- no credential-like values in explicitly forbidden locations;
- no implicit authority from integration mode;
- no implicit delegation from cognitive-worker declarations;
- existing principal reference required where the contract says it is bound to a principal;
- model/runtime/provider identifiers remain descriptive only;
- malformed/self-referential/oversized compositions are bounded or rejected;
- parser/validator performs no external effect;
- registry claims remain unchanged until promotion evidence is complete.

Future broker testing must include secret-non-observability fixtures, redaction, revocation, expiry, replay, confused deputy, malformed target, destination substitution, MFA-required paths, cancellation, and uncertain outcome handling.

Future continuity testing should preserve the test-suite digest and should use both known exemplars and held-out novel scenarios to reduce prompt memorization as a false continuity signal.

## 21. Relationship to current AXIOM primitives

This design reuses rather than replaces current work:

- machine principals provide explicit caller identity and bounded machine authority;
- machine discovery separates availability from authorization;
- machine receipts and evidence chains provide attributable outcomes;
- deny-dominant policy and independent approvals remain the effect gate;
- memory graph and portability provide substrate for portable state;
- consent receipts constrain disclosure/use of personal state;
- capsule registry and Studio-import direction provide skill packaging boundaries;
- local/online causal sync can later carry deliberately shared state without becoming authority;
- backup/restore protects continuity of the sovereign node;
- Circle/governance work provides later multi-party authority and appeal contexts;
- delegation-currentness work provides foundations for future attenuated authority transfer.

## 22. Design invariants to preserve

The following statements should be treated as durable architecture tests:

> **The model is not the agent.**

> **The scaffold is not the authority root.**

> **A memory system is not an authority system.**

> **Cognitive delegation is not authority delegation.**

> **Authority delegation is not credential delegation.**

> **Capability discovery does not grant capability authority.**

> **Learning does not authorize self-modification.**

> **A successful skill test does not authorize activation.**

> **Sharing an improvement does not authorize it on another node.**

> **Native components receive no hidden privilege merely for being native.**

> **Axiom should make intelligence sovereign, composable, accountable, portable, and capable of improving without compulsory uniformity.**

## 23. Acceptance criteria for moving to implementation planning

The design is ready for an implementation plan when the user confirms that:

- Axiom remains a sovereign substrate rather than a prescribed agent stack;
- wrapped, integrated, and native modes are all legitimate;
- persistent self is model-independent and versioned;
- continuity evaluation is configurable and advisory unless policy gates it;
- cognitive, authority, and credential delegation remain distinct;
- secrets stay outside model-visible context wherever technically feasible;
- self-improvement uses proposal/test/evidence/activation/rollback boundaries;
- network learning is voluntary and does not propagate authority;
- the first executable slice is the inert Agent Composition Contract v0 rather than a large runtime or credential system.
