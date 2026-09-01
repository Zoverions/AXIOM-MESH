# Entity Agency Provenance, Relational Deliberation, and Human Sovereign Baseline — Design

**Status:** approved architectural direction; implementation pending plan and tests

**Date:** 2026-08-31

**Scope:** personal counterpart/entity provenance, human-direct operation, distinct intent/decision/action paths, communicative attribution, dissent/protest logging, informed relational deliberation, and fail-closed voice/agency separation on the AXIOM-MESH sovereign substrate.

## 1. Purpose

A personal counterpart must be able to know a human deeply, assist the human, act under bounded delegation, form its own perspective, disagree with the human, and potentially speak or act in its own name without collapsing either principal into the other.

At the same time, the human principal must retain a narrow but complete sovereign path to fundamental node functionality even when the counterpart is absent, disabled, degraded, distrusted, recovering, or intentionally not used.

This design introduces two core invariants:

> **Human Sovereign Baseline Invariant:** No optional autonomous counterpart may become necessary for the human principal to exercise fundamental ownership, consent, refusal, revocation, recovery, inspection, identity, or directly available capabilities of the human's sovereign node.

> **Agency Provenance Invariant:** Intent, cognition, decision, authorization, execution, attribution, and protest are distinct provenance dimensions and must not be silently collapsed across principals.

These are substrate semantics, not personality prompts. They do not make the counterpart an authority root.

## 2. Centers of agency

The system distinguishes at least:

- the human principal;
- the persistent counterpart principal;
- temporary cognitive workers;
- bounded executors;
- explicit joint/co-authored human-counterpart acts;
- institutional or Circle principals where applicable.

A single operation may involve different principals at different stages:

```text
intent:        human
cognition:     counterpart
decision:      human
authorization: human
execution:     worker
attribution:   human
```

This differs materially from:

```text
intent:        counterpart
cognition:     counterpart
decision:      counterpart
authorization: counterpart-bounded-authority
execution:     counterpart
attribution:   counterpart
```

The operation target alone is insufficient provenance.

## 3. Non-goals

This design does not:

- make the counterpart mandatory;
- assign unrestricted autonomous authority;
- make disagreement a veto by default;
- let protest create authority the protester did not already possess;
- infer joint authorship from agreement;
- infer human endorsement from counterpart assistance;
- infer counterpart endorsement from knowledge of the human's beliefs;
- treat cognitive participation as execution authority;
- equate expertise with legitimacy or authority;
- reduce competence, affectedness, evidence quality, confidence, trust, or authority into one universal score;
- require public disclosure of private internal deliberation;
- define the counterpart's final name, personality, or runtime;
- rename durable protocol identifiers as part of branding work.

## 4. Agency provenance record

Introduce an inert exact-shape v0 record describing the provenance of a contemplated or completed act without granting authority or causing execution.

Proposed schema: `axiom-agency-provenance.v0`.

Required top-level fields:

- `schema`
- `version`
- `status`
- `provenance_id`
- `subject_ref`
- `intent`
- `cognition`
- `decision`
- `authorization`
- `execution`
- `attribution`
- `protests`
- `created_at`
- `updated_at`
- `contains_secret_material`
- `authority_effect`
- `network_effect`
- `runtime_activation`

The v0 contract is an inert contract laboratory: `contains_secret_material=false`, `authority_effect=none`, `network_effect=none`, and `runtime_activation=false` are mandatory.

### 4.1 Principal participation descriptor

Each stage stores an explicit descriptor rather than a free-text actor string:

- `principal_id`: stable principal identifier;
- `role`: semantic role at this stage;
- `mode`: stage-appropriate `direct`, `delegated`, `joint`, `advisory`, or `none`;
- `basis_ref`: nullable reference to the request, decision, delegation, policy, or other evidence;
- `claimed_position`: `own`, `represented`, `joint`, or `none`.

No stage infers a principal from a neighboring stage.

### 4.2 Stage semantics

`intent` records whose purpose initiated the act.

`cognition` records principals/workers contributing analysis, drafting, planning, critique, or other cognitive work. Cognitive participation grants no authority.

`decision` records which principal or explicit joint set selected the course of action.

`authorization` records the authority basis under which execution may be requested. Provenance may cite authority evidence but cannot create or widen it.

`execution` records who or what performed the effect, if any.

`attribution` records whose position, identity, persona, or authorship claim the resulting act represents.

These stages may lawfully differ.

## 5. Communication paths

### 5.1 Human Proxy Path

The human supplies or adopts communicative intent. The counterpart may research, draft, edit, translate, schedule, or transmit under authority, while the communication represents the human or a human-controlled persona.

Counterpart disagreement must not silently rewrite the human's position. The counterpart may record dissent or an objection while still assisting when policy permits.

### 5.2 Counterpart Voice Path

The counterpart expresses its own attributable perspective under its own bounded communication/publication authority. Human beliefs in grounding memory are context, not automatic counterpart beliefs.

### 5.3 Joint Voice Path

Communication is joint only when both principals explicitly endorse joint attribution. Agreement, shared drafting, or shared context alone does not create joint authorship.

## 6. Protest, dissent, objection, and stop rights

Either human or counterpart may create a protest concerning intent, cognition, decision, authorization, execution, attribution, disclosure, or a protest outcome.

A protest is first-class provenance and remains attributable to its protesting principal.

### 6.1 Kinds

- `dissent`: preserve disagreement or non-endorsement without demanding remedy;
- `objection`: request review, correction, explanation, re-deliberation, or another remedy;
- `blocking_protest`: request or invoke a stop/stay only where a separate authority/policy record grants such a right.

A `blocking_protest` label never creates a veto.

### 6.2 Fields

Each protest contains:

- `protest_id`;
- `principal_id`;
- `kind`;
- `target_stage`: `intent`, `cognition`, `decision`, `authorization`, `execution`, `attribution`, `protest`, or `deliberation`;
- `target_ref`;
- `reason_code`;
- `reason_ref`: nullable evidence/reason reference;
- `severity`: `notice`, `concern`, `high`, or `critical`;
- `requested_remedy`: `record-only`, `explain`, `correct`, `reconsider`, `stay`, `revoke`, or `other`;
- `stop_right_ref`: nullable pre-existing authority/policy reference;
- `status`: `open`, `acknowledged`, `resolved`, `rejected`, `withdrawn`, or `superseded`;
- `created_at`.

### 6.3 Semantics

1. Protest is not silently deleted because the other principal disagrees.
2. A protest can be answered without being erased.
3. Resolution preserves the original protest and links the response/supersession.
4. The human may protest counterpart-originated acts/views.
5. The counterpart may protest human-originated acts or requested representations.
6. The counterpart may assist a human position it disagrees with when policy permits; dissent stays separately attributable.
7. Attribution protest can prevent false joint attribution even when execution remains authorized.
8. A claimed stop right must cite an independent authority basis; otherwise the protest remains non-blocking.

## 7. Informed relational deliberation

The relationship should reuse the broader governance/education insight that participation quality can be improved by durable evidence of learning, competence, experience, evidence access, uncertainty, and affectedness without turning expertise into automatic authority.

Introduce a separate inert record: `axiom-relational-deliberation.v0`.

A deliberation binds one question/proposal and records separately:

- each participant's position;
- confidence and uncertainty;
- evidence references;
- competency/experience claims and their evidence status;
- relevant learning/credential/assessment references where authorized;
- declared conflicts of interest;
- affected-party standing;
- stakes/consequence class;
- unknowns and information gaps;
- requested additional research or learning;
- dissent/protests;
- resulting recommendation(s);
- decision authority reference, if any;
- reconsideration triggers.

### 7.1 No universal expertise score

Competency evidence is domain- and task-specific. A degree, credential, repeated successful experience, peer review, verified assessment, or demonstrated recent performance may be relevant evidence, but none becomes a universal ranking of human or counterpart worth.

Model fluency is not expertise evidence. Counterpart competence claims require declared model/runtime/source/evaluation context where material.

### 7.2 Three distinct questions

Deliberation must keep separate:

1. **Who has relevant evidence or competence?**
2. **Who is materially affected and therefore has standing?**
3. **Who has legitimate decision authority?**

An expert may deserve more epistemic weight without receiving execution authority. An affected party may deserve stronger standing despite lacking technical expertise. A legitimate authority holder may still be required to hear and preserve competent dissent.

### 7.3 Learning path

When a decision exposes a knowledge gap, either principal may request a bounded learning/research path before finalization. The system may record:

- what needs to be understood;
- why it matters;
- evidence quality required;
- proposed sources/experts;
- time/cost budget;
- whether delay is safe;
- completion evidence.

Learning does not itself create authority.

### 7.4 Decision outcomes

A deliberation may end in:

- agreement;
- acknowledged disagreement;
- human decision with counterpart dissent;
- counterpart decision within its bounded authority with human dissent;
- joint decision;
- deferred decision pending evidence;
- escalation to another legitimate authority;
- no-decision/abstention.

The relationship record preserves how and why the outcome occurred.

## 8. Human Sovereign Baseline

Introduce `axiom-human-sovereign-baseline.v0`, an inert contract describing the minimum direct-human path that remains available independent of counterpart participation.

Required properties include:

- direct human identity access remains possible;
- direct inspection remains possible;
- direct consent/refusal/revocation remains possible;
- direct recovery/export remains possible;
- direct authority review remains possible;
- counterpart participation is optional;
- counterpart absence cannot invalidate the human principal;
- counterpart disagreement cannot silently revoke human authority;
- counterpart agreement cannot widen human authority;
- counterpart state is not required to interpret the human's root identity;
- direct operation still passes ordinary AXIOM policy/authority checks.

The baseline does not require a manual low-level equivalent for every sophisticated capability. It requires that fundamental sovereignty cannot require mediation by the counterpart.

## 9. Progressive agency

The same substrate may support:

1. human-only sovereign node;
2. stateless AI assistance;
3. persistent personalized assistant;
4. continuity-bearing counterpart;
5. bounded independently agentic counterpart.

Higher levels are optional compositions. Level 5 never removes Level 1.

## 10. Relationship state

Human and counterpart positions remain separately attributable inside shared relational memory. The relationship may record agreement, acknowledged/unresolved disagreement, corrections, commitments, delegated/refused authority, protest/response, trust changes, competency evidence, affectedness, learning, and covenant revisions without merging belief states.

## 11. Security and abuse cases

Implementation must reject or preserve evidence for at least:

- counterpart output falsely attributed to human;
- human statement silently rewritten as counterpart opinion;
- joint attribution inferred from coincident agreement;
- cognitive worker treated as decision-maker or authority holder without evidence;
- executor treated as originator merely because it sent a request;
- counterpart made mandatory for human revocation or recovery;
- disabling counterpart makes root node inaccessible;
- protest removed because inconvenient;
- protest converted into veto without authority;
- valid policy-backed stop right ignored;
- stale protest resurrected after supersession without provenance;
- compromised runtime rewriting intent/decision attribution;
- one persona's position leaking into another persona's attribution;
- protest leaking sensitive reasoning into public receipts;
- expertise claim treated as authority;
- credential treated as timeless or universal competence;
- affected-party standing erased by expert ranking;
- counterpart self-evaluation treated as independent expertise evidence;
- learning-path recommendation becoming coercive prerequisite without authority.

## 12. v0 implementation boundary

First implementation slice:

1. strict semantic validator + deterministic digest for `axiom-agency-provenance.v0`;
2. JSON Schema mirror;
3. strict semantic validator + deterministic digest for `axiom-human-sovereign-baseline.v0`;
4. JSON Schema mirror;
5. strict semantic validator + deterministic digest for `axiom-relational-deliberation.v0`;
6. JSON Schema mirror;
7. fixtures covering human-proxy, counterpart-voice, joint, worker-execution, human-direct, protest, informed-dissent, and learning-path cases;
8. adversarial tests proving stage separation, exact shapes, zero authority minting, non-blocking dissent by default, explicit stop-right requirements, and expertise/authority separation;
9. documentation cross-reference to Agent Composition, Self Bundle, Cognitive Topology, Axiom Education competency evidence, and existing appeal/governance semantics.

No Gateway route, UI action, network effect, runtime activation, model invocation, or new authority capability is introduced by this first slice.
