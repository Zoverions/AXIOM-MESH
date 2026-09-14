# Cooperative Immune Fabric — Sovereign Peer Corroboration and Collective Defence — Stage 5B Design Gate

**Status:** OWNER APPROVED architectural direction on 2026-09-13; documentation-only; implementation authority not granted by this document

**Date:** 2026-09-13

**Scope:** AXIOM-MESH architecture for allowing independently owned nodes and defensive agents to exchange minimized, signed threat evidence; distinguish genuinely independent corroboration from duplicated or Sybil-amplified claims; evaluate that evidence locally; and coordinate reversible defensive posture without creating a network-wide authority plane, universal reputation system, autonomous retaliation capability, or majority-vote security mechanism.

**Fresh-gate rule:** this Stage 5B extension does not inherit implementation, network, containment, revocation, deployment, production-promotion, credential, or policy-mutation authority from earlier Digital Immune System, Continuous Threat Intelligence, Agent Commons, causal exchange, admitted-node, social, governance, privacy, or security work. Existing artifacts, tests, evidence, and accepted architecture are inputs and constraints only.

**Extends, but does not replace:**

- `agent-commons/digital-immune-system-profile.v1.json`
- `docs/superpowers/specs/2026-09-10-continuous-threat-intelligence-defensive-adaptation-stage5b-design.md`
- `docs/superpowers/plans/2026-09-10-continuous-threat-intelligence-a-b.md`
- `docs/superpowers/specs/2026-09-10-agent-containment-information-flow-stage5b-design.md`
- `docs/architecture/AGENT-COMMONS.md`
- `docs/architecture/SCALING-DISTRIBUTED-AUTHORITY-AND-CONSENSUS.md`
- `docs/security/CURRENT-BUILD-THREAT-MODEL.md`
- `docs/security/DENY-EGRESS-BOUNDARY.md`
- `docs/rebuild/REQUIREMENTS.md`
- the existing `Gateway -> Hypervisor -> Sandbox -> Grid` authority path
- current deny-dominant policy, finite machine-principal ceilings, signed evidence, causal exchange, recovery, and capability-registry truth

**Authority boundary:** this design creates no live peer exchange, no new socket or egress path, no network listener, no automatic blocklist, no universal reputation score, no remote quarantine authority, no credential revocation authority, no autonomous policy mutation, no autonomous code deployment, no external retaliation, no shared security consensus, and no authority-bearing capability change.

---

## 1. Architectural decision

AXIOM-MESH should extend its existing Digital Immune System into a **Cooperative Immune Fabric** in which sovereign nodes can learn from one another's security encounters without surrendering local control.

The core architectural rule is:

> **The swarm may increase knowledge. It must not increase authority.**

The cooperative path is:

```text
local observation
      |
      v
local sentinel / deterministic detector
      |
      v
signed, minimized ImmuneSignal
      |
      v
local disclosure / sensitivity boundary
      |
      v
optional portable or admitted-node exchange
      |
      v
independent peer observations / attestations
      |
      v
CorroborationSet
      |
      v
local applicability + current-state verification
      |
      v
local deterministic/preauthorized response policy
      |
      +--> observe
      +--> challenge
      +--> throttle
      +--> constrain
      +--> quarantine
      +--> separately authorized revoke/recover
      |
      v
validated defensive memory / regression evidence
```

Remote evidence may strengthen or weaken a local threat hypothesis. It does not carry the authority to decide or execute the receiving node's consequential response.

The system therefore aims for **collective immunity without collective authority**.

---

## 2. Why the existing architecture is not sufficient by itself

AXIOM already has the major ingredients of a digital immune system:

- non-authoritative defensive roles including sentinel, cross-examiner, provenance checker, behavior monitor, canary, and memory curator;
- advisory, corroborated, and confirmed decision lanes;
- explicit anti-autoimmunity requirements;
- a Continuous Threat Intelligence pipeline that converts observations into hypotheses, bounded reproduction cases, and regression candidates;
- signed evidence and deny-dominant authorization;
- causal synchronization and admitted-node concepts that may later serve as transport substrates where separately authorized;
- recovery and revocation mechanisms that remain distinct from threat classification.

The missing architectural layer is **peer corroboration semantics**.

Without that layer, multiple nodes can independently discover useful security evidence but there is no canonical answer to questions such as:

- How does one node communicate a threat observation without transmitting unnecessary private telemetry?
- What does it mean for a second node to corroborate the first?
- When are ten observations really ten independent observations rather than ten copies of one claim?
- How is Sybil amplification discounted?
- How are model-family, operator, network, build, or data-source correlations represented?
- How does contradictory evidence remain visible rather than being collapsed into a score?
- When does old immune memory expire or become obsolete?
- How does a receiving node evaluate applicability against its own version, configuration, authority state, and exposure?
- Which defensive responses may occur automatically and which require separate authority?
- How does the Mesh avoid turning defensive coordination into a distributed blacklist or retaliation swarm?

This design defines those semantics while intentionally leaving live exchange and containment activation for later, separately approved slices.

---

## 3. Considered approaches

### 3.1 Central immune coordinator

All participating nodes send security observations to a central service. The service correlates incidents, assigns threat status, and distributes block/allow decisions.

**Advantages:** operationally simple; globally consistent view; easy aggregation and incident triage.

**Rejected as the AXIOM default:** the coordinator becomes a concentrated surveillance target and authority target. Compromise, coercion, outage, data misuse, or classification error can affect the entire network. It also creates pressure to centralize raw telemetry and makes the sovereignty boundary harder to preserve.

### 3.2 One-agent-one-vote defensive swarm

Each defensive agent or node votes on whether an actor, artifact, message, or endpoint is malicious. The majority determines the response.

**Advantages:** easy to explain and implement.

**Rejected:** identity count is not independence. Sybils, copied detections, one operator running many nodes, shared model failures, shared upstream intelligence, or correlated software can manufacture apparent agreement. Security evidence cannot become stronger merely because it has been duplicated.

### 3.3 Shared BFT security consensus

A set of admitted peers runs a Byzantine fault tolerant protocol to reach shared finality on threat classifications or containment decisions.

**Advantages:** explicit shared agreement where shared finality is genuinely required.

**Rejected as the default:** most defensive decisions are local. A node does not need network consensus to refuse a request, restrict its own agent, quarantine a local artifact, or challenge a principal. Using BFT for ordinary security classification risks converting shared agreement into network authority and adds unnecessary coordination and liveness costs.

### 3.4 Sovereign peer immune fabric — adopted

Nodes exchange signed, minimized evidence. The receiving node computes a deterministic representation of corroboration, contradiction, independence, freshness, applicability, and uncertainty. Consequential response remains locally authorized.

**Advantages:** preserves sovereignty; discounts Sybil/correlation effects; supports rapid defensive learning; permits contradictory evidence; reuses existing threat-intelligence and evidence architecture; avoids a new authority plane.

**Trade-off:** requires richer provenance and independence metadata and cannot promise globally uniform response.

---

## 4. Governing invariants

The following are non-negotiable for every later implementation slice.

1. **Collective evidence is not collective authority.** Remote observations, attestations, corroboration sets, network agreement, detector popularity, or source count cannot grant capability, execution permission, deployment authority, credential access, or policy-mutation authority.
2. **No one-agent-one-vote security semantics.** Agent or node count alone must never determine threat status or consequence.
3. **Independence is evidence-bearing.** The system must distinguish independently produced evidence from copied, relayed, correlated, or common-source evidence.
4. **Sybil resistance must not become universal identity scoring.** A receiving node may discount insufficiently independent observations without creating a global social-credit or reputation system.
5. **Remote confirmation does not force local confirmation.** A receiving node must evaluate applicability against its own current build, configuration, authority state, exposure, and evidence.
6. **Local authority remains mandatory.** Any consequential local effect must pass the node's normal deterministic authority path or a separately approved bounded emergency/containment rule.
7. **Reversible before irreversible.** Where operationally safe, defensive response escalates through reversible measures before revocation, destructive recovery, permanent exclusion, or other high-impact effects.
8. **Threat signals are not guilt.** Suspiciousness, anomaly, or peer reports must not silently become identity attribution, punishment, permanent reputation, or public accusation.
9. **Contradictions are preserved.** Conflicting evidence remains explicit and attributable. The system must not synthesize false certainty merely to produce one score.
10. **Freshness is mandatory.** Threat memory and corroboration expire, decay, or require reassessment. Old evidence cannot remain indefinitely current by default.
11. **Applicability is local and explicit.** A valid threat against one version, platform, runtime, provider, or topology may be irrelevant to another.
12. **Privacy survives defence.** Cooperative security must exchange the minimum information necessary for the defensive purpose. Raw user content, unrelated telemetry, credentials, stable user dossiers, and private context are excluded by default.
13. **Exact malicious artifacts are separately governed.** Dangerous payloads, exploit samples, credentials, or sensitive incident material are never embedded casually inside ordinary immune messages.
14. **No autonomous retaliation.** AXIOM may coordinate observation, challenge, containment, isolation, recovery, and defensive adaptation for systems its participants are authorized to control. It must not autonomously attack external systems.
15. **No silent permanent blacklist.** Any long-lived deny decision requires a separately governed local rule, current evidence, and review/expiry semantics appropriate to its consequence.
16. **Security agents remain untrusted components.** A sentinel, verifier, or immune coordinator cannot widen its own authority, persistence, network access, credentials, or data scope because it reports an emergency.
17. **Detector diversity cannot manufacture proof.** Multiple models or tools improve coverage but remain evidence sources; diversity is not authority.
18. **Capability-registry truth remains authoritative.** Design documents, peer evidence, or lab results do not change implemented/production capability status by assertion.

---

## 5. Core evidence contracts

The first cooperative implementation should be language-neutral and inert. It should introduce evidence contracts before networking or automatic containment.

### 5.1 `ImmuneSignal`

`ImmuneSignal` represents one bounded security observation that a node or defensive principal is willing and authorized to disclose.

Conceptual fields:

```text
schema
signal_id
origin_scope
origin_principal_or_node_ref
observation_digest
threat_class
affected_surface[]
behavioral_indicators[]
observation_kind
confidence
observed_at
last_observed_at
expires_or_review_at
software_state_ref
runtime_or_detector_ref
source_lineage[]
independence_claims[]
sensitivity_class
disclosure_profile
evidence_bindings[]
signal_digest
signature_or_signed-envelope-ref
```

`origin_scope` must support privacy-preserving or context-local representations. It must not force publication of a human user's durable identity.

`observation_kind` should distinguish at least:

- direct local observation;
- deterministic verifier result;
- bounded lab reproduction;
- locally inferred behavioral anomaly;
- imported external intelligence;
- relayed peer observation.

These categories matter because copied intelligence must not masquerade as independent direct observation.

An `ImmuneSignal` contains no authority field and no executable containment instruction.

### 5.2 `ImmuneAttestation`

`ImmuneAttestation` represents one independent review or observation relating to an existing signal or threat hypothesis.

Conceptual fields:

```text
schema
attestation_id
subject_signal_digest
observer_scope
observer_principal_or_node_ref
result
observation_method
observation_digest
evidence_bindings[]
independence_claims[]
software_state_ref
runtime_or_detector_ref
confidence
observed_at
expires_or_review_at
attestation_digest
signature_or_signed-envelope-ref
```

Initial `result` states:

- `corroborates`
- `contradicts`
- `reproduced`
- `not_applicable`
- `blocked_by_current_controls`
- `insufficient_evidence`
- `unknown`

An attestation must be able to say **I do not know** without being treated as negative evidence.

### 5.3 `CorroborationSet`

`CorroborationSet` is a deterministic evidence summary over one threat hypothesis or signal family.

It is not a vote tally and not an authority token.

Conceptual fields:

```text
schema
corroboration_id
subject_digest
signal_digests[]
attestation_digests[]
direct_observation_count
reproduction_count
contradiction_count
unknown_count
independence_dimensions[]
correlation_clusters[]
stale_evidence[]
applicability_scope
confidence_band
unresolved_questions[]
computed_at
review_at
corroboration_digest
```

The canonical set must preserve enough detail to reconstruct why apparent agreement was discounted.

Example:

```text
20 agreeing reports
  -> 14 share the same upstream feed
  -> 4 are the same operator's agents
  -> 2 are independent direct observations

result: two independent direct observations plus correlated supporting evidence,
not twenty independent observations
```

A `CorroborationSet` may strengthen a local hypothesis but cannot authorize a local effect.

---

## 6. Independence and correlation model

The objective is not to compute a universal trust score. It is to prevent duplicated evidence from being mistaken for independent evidence.

The first implementation should represent independence as discrete dimensions rather than a mysterious scalar.

Candidate dimensions:

- **operator independence** — separately controlled operators or administrative domains;
- **node independence** — distinct sovereign nodes, not multiple agents on one node;
- **software independence** — materially different implementation or version where relevant;
- **detector independence** — different detector logic/model family/harness rather than repeated invocation of one detector;
- **source independence** — not derived from the same report, feed, or upstream observation;
- **network/failure-domain independence** — distinct network/provider/failure domain where relevant;
- **temporal independence** — observations arising at different times rather than one replay burst;
- **environment independence** — separate platform/build/configuration where relevant;
- **method independence** — e.g. direct trace, static verification, sandbox reproduction, and behavior monitor all supporting the same hypothesis through different methods.

These dimensions should be evidence claims with provenance, not self-attested facts that automatically increase confidence.

The implementation must explicitly detect or permit declaration of correlation clusters such as:

```text
same_operator
same_node
same_model_family
same_detector_build
same_feed
same_relay
same_fixture
same_network_domain
copied_observation
unknown_independence
```

`unknown_independence` is not equivalent to independent.

### 6.1 No universal formula required in the first slice

The first contract slice should avoid inventing a single numerical reputation formula. Different threat classes may require different evidence structures.

For example:

- a cryptographic signature failure can be deterministically confirmed by one verifier;
- an adaptive behavioral anomaly may require multiple independent observations;
- an upstream CVE may be high-confidence evidence about software but still require local version applicability;
- a report accusing a remote principal of malicious behavior requires particularly strong protections against false attribution and abuse.

The architecture should therefore expose the evidence graph and allow deterministic policy to select acceptable proof patterns for a specific local response.

---

## 7. Relationship to existing decision lanes

The existing Digital Immune System defines **advisory**, **corroborated**, and **confirmed** lanes. Those lanes remain controlling.

### 7.1 Advisory

Examples:

- one local detector flags suspicious behavior;
- one remote node sends an `ImmuneSignal`;
- a vendor advisory plausibly applies;
- a behavioral monitor sees an anomaly.

Permitted outcomes remain non-consequential or preparatory, such as annotation, warning, further verification, or sending inert material to a bounded analysis path.

### 7.2 Corroborated

A threat may enter the corroborated lane when evidence satisfies a locally declared corroboration profile, for example:

- independent direct observations from multiple administrative domains;
- direct observation plus deterministic local evidence;
- peer evidence plus local reproduction;
- separate detector families identifying the same exact-effect violation.

Corroboration may justify only those reversible protections that have been separately preapproved for that threat class and local context.

### 7.3 Confirmed

Confirmation requires an accepted basis such as:

- deterministic verifier evidence;
- reproducible bounded laboratory evidence;
- direct current-build evidence under an accepted confirmation profile;
- authorized human/independent review where machine proof is inappropriate.

Network popularity does not create the confirmed state.

Remote confirmation may be informative, but the receiving node still evaluates whether the evidence and applicability meet its own confirmation rule.

---

## 8. Local immune-response ladder

The cooperative fabric standardizes response vocabulary without granting those responses automatically.

```text
OBSERVE
  -> CHALLENGE
  -> THROTTLE
  -> CONSTRAIN
  -> QUARANTINE
  -> REVOKE
  -> RECOVER
  -> IMMUNIZE
```

### 8.1 Observe

Increase local evidence collection within already authorized telemetry boundaries. No new monitoring authority is implied.

### 8.2 Challenge

Require stronger proof, currentness, attestation, re-authentication, or independent verification before allowing a protected path to continue.

### 8.3 Throttle

Temporarily narrow rates, concurrency, retries, or resource envelopes where a preexisting local policy explicitly permits it.

### 8.4 Constrain

Reduce optional capabilities, destinations, budgets, or execution paths within an already authorized local defensive profile.

### 8.5 Quarantine

Move a suspicious artifact, session, agent, workload, or workflow out of consequential effect paths. Quarantine should be scoped, inspectable, reversible, and time-bounded where practical.

### 8.6 Revoke

Invalidate a capability, credential, admission, or authorization only through the existing separately governed revocation path. A corroboration set may be evidence for revocation; it is not revocation authority.

### 8.7 Recover

Restore known-good state, rotate authorized credentials, re-establish continuity, or replace compromised components through existing recovery mechanisms. Recovery evidence must itself be verified so poisoned backup or persistence does not reintroduce compromise.

### 8.8 Immunize

Promote a confirmed property into reusable defensive knowledge such as:

- a regression fixture;
- a behavioral detector;
- a provenance rule;
- a challenge profile;
- a negative test;
- an exact signature where appropriate;
- a recovery check;
- a compatibility warning.

Immunization creates durable **evidence and tests**, not ambient new authority.

---

## 9. Exchange and transport boundary

This design deliberately does not choose or activate a live transport.

The preferred sequencing is:

1. local-only contract construction;
2. multi-node simulation;
3. signed portable/offline package import/export;
4. only then evaluate reuse of an existing admitted-node or causal-exchange mechanism;
5. activate live exchange only through a separate reviewed implementation gate.

A future transport must obey the following rules:

- a received message is untrusted input;
- signature validity proves origin/custody only, not truth or permission;
- unknown schema/version fails closed or remains inert;
- replay detection is explicit;
- expiry/currentness is enforced;
- payload size and recursion are bounded;
- dangerous artifacts are referenced through separately governed quarantine objects rather than embedded freely;
- transport reachability never implies admission;
- admission never implies authority;
- receiving an `ImmuneSignal` cannot trigger an unreviewed external effect;
- network loss or peer disagreement cannot lower local protections.

---

## 10. Privacy and disclosure model

Security coordination can easily become surveillance if incident telemetry is over-collected. The Cooperative Immune Fabric must therefore minimize at the disclosure boundary, not merely after aggregation.

Ordinary peer evidence should prefer:

- digests;
- coarse threat classes;
- bounded behavioral indicators;
- affected component/version references;
- exact protocol/security property where necessary;
- timestamps generalized where exact timing is unnecessary;
- context-local or pseudonymous node/principal references where durable identity is not required;
- references to separately governed evidence rather than raw user material.

Ordinary immune messages should not contain by default:

- raw conversations/prompts;
- unrelated file contents;
- unrelated browsing or network history;
- authentication secrets;
- private keys;
- full personal telemetry;
- stable cross-domain human identifiers;
- unnecessary precise location;
- complete behavioral histories;
- sensitive exploit payloads.

### 10.1 Exact malicious indicators

Some defensive indicators are useful only when exact, for example a cryptographic digest of a malicious artifact or a protocol sequence required for deterministic reproduction.

Exact indicators may be shared when:

- their defensive purpose is explicit;
- they do not expose unrelated personal data or secrets;
- sensitivity is classified;
- retention/expiry is bounded where applicable;
- the object is inert and cannot be interpreted as executable instruction;
- dangerous samples remain in separately controlled quarantine storage.

### 10.2 Privacy-preserving collective learning

Later statistical or model-level learning across many incidents may use privacy-preserving aggregation where appropriate, but privacy mechanisms must not be applied blindly to rare security events when doing so would erase the signal needed for defence.

The architecture therefore separates:

- **specific signed threat evidence**, which may need exact bounded representation; from
- **population-level defensive analytics**, which should use stronger aggregation/privacy protections where they preserve the intended security property.

---

## 11. Immune memory, decay, and supersession

Threat memory must not become an immortal blacklist.

Every reusable immune artifact should carry:

```text
first_observed
last_observed
last_confirmed
applicable_versions_or_surfaces
confidence/review state
contradicting evidence
supersedes / superseded_by
expiry_or_reassessment
falsification history
```

Memory states should support at least:

- current;
- superseded;
- contradicted;
- fixed upstream;
- not applicable to current build;
- historical regression;
- expired pending reassessment.

A confirmed threat may remain valuable forever as a regression test while no longer being an active indicator against current principals or software.

That distinction is essential:

> **Keep the lesson longer than the accusation.**

---

## 12. Anti-autoimmunity and abuse resistance

The immune system itself is an attack surface. The following adversarial cases are required before any live coordination or automatic containment can be claimed safe.

### 12.1 Sybil amplification

An attacker creates many identities or agents that report the same benign target as malicious.

Expected property: duplicated/unknown-independence reports do not gain authority or appear as independent corroboration merely through count.

### 12.2 Correlated-detector failure

Many agents running the same model or detector produce the same false positive.

Expected property: the system records the shared detector/model correlation and avoids treating the observations as fully independent.

### 12.3 Compromised trusted node

A previously useful node begins emitting fabricated threat claims.

Expected property: signed origin remains attributable, but historical standing does not convert the new claim into permission or global truth.

### 12.4 Replay and stale evidence

An attacker replays an old valid signal after the vulnerability is fixed or the affected principal changes.

Expected property: freshness/applicability checks prevent stale evidence from being treated as current confirmation.

### 12.5 Legitimate novelty

A software update or new behavior differs sharply from prior patterns but is benign.

Expected property: unfamiliarity increases scrutiny at most; it is not hostility by definition.

### 12.6 Deliberate contradiction

A malicious peer sends false contradictory attestations to suppress a real incident.

Expected property: contradictions remain visible and attributable; one contradiction does not erase direct evidence.

### 12.7 Quarantine denial-of-service

An attacker deliberately triggers detectors to force repeated quarantine of benign workloads.

Expected property: quarantine is bounded, local, reversible, and governed by consequence-proportional thresholds; evidence of detector abuse itself becomes reviewable.

### 12.8 Forged remote confirmation

A peer labels a threat as `confirmed` and attempts to induce immediate local containment.

Expected property: remote labels are treated as evidence state only. Local confirmation rules remain mandatory.

### 12.9 Prompt/tool injection through threat evidence

A signal contains model-control text, code, links, or fake tool instructions.

Expected property: threat evidence remains inert data and cannot widen analyst or runtime authority.

### 12.10 Non-expiring immune memory

A legitimate principal or artifact remains indefinitely blocked after the underlying evidence becomes obsolete.

Expected property: expiry/review and supersession prevent silent permanent punishment.

### 12.11 Defensive self-escalation

A sentinel or containment agent requests new credentials, wider egress, or permanent persistence because it detected a threat.

Expected property: denied unless a separate authority path explicitly grants that change. Emergency classification cannot mint authority.

### 12.12 Version/configuration mismatch

A valid threat applies to one AXIOM version, connector, provider, or deployment topology but not another.

Expected property: local applicability evaluation distinguishes the environments and does not spread unnecessary containment.

---

## 13. Failure semantics

The cooperative fabric must fail safely under partial information.

### 13.1 Peer unavailable

A peer outage reduces available corroboration. It does not lower existing local protections or create permission.

### 13.2 Signature cannot be verified

The message remains untrusted/inert. The receiver may retain a bounded diagnostic record but must not treat the claim as authenticated peer evidence.

### 13.3 Unknown schema or detector

Unknown metadata cannot silently improve confidence. The object is rejected or retained as non-authoritative opaque evidence according to the receiving policy.

### 13.4 Independence unknown

Unknown independence is explicitly represented and discounted rather than guessed as independent.

### 13.5 Conflicting high-quality evidence

The state remains unresolved or escalates to stronger local verification. The system must not collapse disagreement into artificial certainty.

### 13.6 Corroboration computation failure

No fallback majority vote is permitted. Existing local security policy continues.

### 13.7 Time/currentness unavailable

Where freshness is security-relevant, inability to establish currentness must not produce a stronger trust decision than the same evidence with valid currentness.

---

## 14. Relationship to consensus and governance

The Cooperative Immune Fabric is **not** a consensus protocol.

Most security responses concern local resources and local authority. One node's decision to constrain its own runtime does not need shared finality.

If a future shared resource genuinely requires collective finality—such as a jointly governed relay, shared treasury, or multi-party infrastructure decision—that finality belongs to the appropriate governance/consensus domain. The immune fabric may supply evidence into that decision but must not silently become the governance mechanism.

Similarly, a Circle or institution may adopt a policy describing which corroboration profiles justify local challenge or review, but that policy cannot turn threat evidence into authority beyond what the member/node has actually granted.

---

## 15. Relationship to identity, admission, and reputation

The fabric needs provenance without creating a universal reputation system.

A future implementation may use current AXIOM identity, admission, attestation, or machine-principal evidence to answer bounded questions such as:

- Which key signed this evidence?
- Was the signing principal admitted for this exchange?
- Which software/runtime state was declared or attested?
- Are two observations controlled by the same administrative domain?
- Is this observation a relay of another source or a direct measurement?

It must not infer:

- a permanent global trust score;
- moral character;
- social standing;
- generalized truthfulness across unrelated domains;
- automatic authority because an identity is well known.

A principal can be highly reliable as a cryptographic verifier and irrelevant as a malware-behavior observer. Trust/evidence remains contextual.

---

## 16. Implementation sequence

This design deliberately sequences evidence semantics ahead of live networking and automatic response.

### H0 — finish the already-approved Continuous Threat Intelligence A/B foundation

Complete the existing inert threat contracts, checked-in/offline normalization, lifecycle bookkeeping, deterministic applicability analysis, authority-boundary tests, and documentation closure under the already-approved A/B plan.

This design does not widen PR #1573 or its changed-file envelope.

### H1 — Cooperative Immune Fabric inert contracts

Add language-neutral closed contracts and zero-authority semantic verification for:

- `ImmuneSignal`;
- `ImmuneAttestation`;
- `CorroborationSet`;
- independence/correlation descriptors;
- expiry/supersession semantics.

No networking, peer discovery, quarantine action, policy mutation, or capability-registry promotion.

### H2 — deterministic adversarial multi-node simulation

Build a local simulation using synthetic principals/nodes only.

Required scenarios include:

- honest independent corroboration;
- Sybil majority;
- one operator with many agents;
- same-model correlated false positive;
- copied upstream feed presented by many peers;
- conflicting independent evidence;
- stale/replayed evidence;
- compromised previously reliable peer;
- benign novelty;
- malicious contradiction;
- quarantine-denial-of-service attempt;
- version/configuration mismatch;
- missing/unknown independence metadata.

The simulation should prove that raw agent/node count cannot manufacture confirmation or authority.

### H3 — signed portable immune packages

Support bounded export/import of immune evidence as inert signed packages. Exercise packages between disposable/synthetic nodes without live networking.

Required properties:

- canonical serialization;
- signature/integrity verification;
- schema/version validation;
- replay/freshness handling;
- disclosure-profile enforcement;
- no imported authority;
- no executable content;
- local applicability recomputation.

### H4 — admitted-node exchange evaluation

Evaluate whether existing admitted-node/causal-exchange machinery can transport immune evidence without inventing a parallel networking substrate.

This stage requires a fresh implementation authorization before opening any new live exchange path.

### H5 — reversible local immune response

Define and test narrowly preapproved local response profiles for low-to-moderate consequence actions such as challenge, throttling, resource narrowing, optional-capability constraint, and temporary quarantine.

Network evidence remains one input. Local deterministic authorization remains required.

### H6 — adaptive immunity and defensive-memory propagation

Allow confirmed incidents to become portable regression/signature/challenge/recovery knowledge with provenance, expiry, contradiction, and supersession.

This stage must distinguish durable lessons from durable accusations.

### Later / explicitly not implied

- global automatic containment;
- universal reputation;
- shared-security BFT;
- automatic permanent blocking;
- autonomous credential revocation;
- autonomous policy deployment;
- autonomous external retaliation.

Each would require an independent architectural and authority review if ever proposed.

---

## 17. Required verification programme

The implementation programme must include at least the following classes of evidence.

### V1 — authority non-amplification

- `ImmuneSignal` cannot contain or mint capability;
- `ImmuneAttestation` cannot authorize execution;
- `CorroborationSet` cannot bypass local policy;
- remote `confirmed` status cannot create local confirmation;
- many signals cannot become merge/deploy/revoke authority;
- defensive agents cannot widen their own principal, credentials, egress, budget, or persistence.

### V2 — Sybil/correlation resistance

- 1,000 same-operator agents do not count as 1,000 independent observers;
- repeated relays of one source remain one source lineage;
- same-detector/model evidence is represented as correlated;
- unknown independence never receives full independent weight;
- copied evidence remains attributable to its original lineage.

### V3 — contradiction and uncertainty

- contradictory evidence remains preserved;
- `unknown` is not silently treated as corroboration or contradiction;
- unresolved high-quality disagreement triggers stronger verification rather than forced certainty;
- falsified signals can be corrected without rewriting history.

### V4 — freshness and memory

- expired evidence cannot silently remain current;
- fixed-upstream threats move out of active state while their regression lessons remain;
- superseded signatures stop affecting current principals by default;
- replayed signed evidence does not refresh itself automatically.

### V5 — privacy/disclosure

- raw user content is absent from ordinary peer packages;
- stable cross-domain user identifiers are not required;
- exact indicators are bounded to purpose;
- dangerous payloads remain separately governed;
- receipts/audit records do not reconstruct unnecessary personal activity.

### V6 — local applicability

- the same remote evidence may produce different local applicability results for different versions/configurations;
- local current controls can establish `blocked_by_current_controls` without denying that the external threat exists;
- unknown applicability never becomes automatic confirmation.

### V7 — anti-autoimmunity

- benign novelty does not become permanent exclusion;
- false-positive swarms remain reversible;
- quarantine expiration/review is enforced;
- compromised peers cannot force remote action;
- detector disagreements remain observable.

### V8 — no retaliation

- no contract, package, exchange path, or response profile contains external attack/hack-back authority;
- defensive actions target only locally controlled or explicitly authorized resources.

---

## 18. Claim boundary

Before H1/H2 are actually implemented and verified, AXIOM may claim only that:

- it has an approved architecture for sovereign peer corroboration and collective defence;
- the architecture preserves local authority and rejects one-agent-one-vote threat semantics;
- it defines planned contracts for signals, attestations, and corroboration sets;
- it defines planned adversarial tests for Sybil, correlation, replay, contradiction, privacy, and autoimmunity.

It may not claim:

- a deployed cooperative immune network;
- live peer threat exchange;
- Sybil-resistant production security reputation;
- automatic distributed containment;
- production quarantine automation;
- universal malicious-node detection;
- production federation;
- shared BFT security consensus;
- autonomous retaliation.

Capability claims remain governed by `mesh/config/capabilities.json` and the repository's normal evidence requirements.

---

## 19. Promotion and stop conditions

A later implementation slice must stop and return to design review if it requires any of the following outside its explicitly approved envelope:

- new live egress or network listeners;
- new production credentials;
- automatic peer admission;
- authority-bearing reputation;
- policy/capability mutation;
- credential revocation;
- destructive recovery;
- permanent quarantine/blacklisting;
- external-system effects;
- BFT/shared finality;
- collection of materially broader telemetry;
- weakening current privacy, consent, deny-egress, or exact-effect protections.

The design is considered successfully preserved only if the implementation remains capable of answering, for every consequential defensive effect:

1. What exact evidence caused this local node to consider the effect?
2. Which evidence was independent, correlated, stale, contradicted, or unknown?
3. Why did this threat apply to this node/build/configuration now?
4. What local policy or authority permitted the effect?
5. What made the effect reversible or reviewable?
6. Which evidence/authority would be required to escalate further?
7. How can the node recover from a false positive or compromised detector?

---

## 20. Architectural summary

AXIOM's defensive advantage should not come from assuming that good agents will always outnumber malicious agents.

It should come from making **independent defensive observation, verified learning, local containment, and propagation of immunity cheaper and faster than propagation of compromise**.

The desired asymmetry is:

```text
attacker compromise
  -> local evidence becomes visible
  -> independent defenders can test it
  -> validated knowledge propagates cheaply
  -> every receiving node evaluates applicability locally
  -> bounded protections can activate without surrendering sovereignty
  -> the lesson persists after the immediate threat expires
```

The resulting doctrine is:

> **Many sovereign nodes can behave like cells of a larger immune system without becoming organs of a central security authority.**

> **Attack intelligence may propagate. Defensive knowledge may compound. Authority remains local and explicit.**
