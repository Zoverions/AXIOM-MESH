# Adaptive Assurance and Plural Authority Architecture

**Status:** approved long-horizon architecture; not an implemented capability claim

**Adopted:** 2026-08-03

**Applies to:** AXIOM-MESH product definition, roadmap, governance, evidence, Circles, future institutional and sovereign deployments

**Current-build boundary:** the supported `0.12.0-dev.3` kernel remains a single-node local authority and transparency log. This document reserves architecture and promotion gates. It does not claim production Circles, federation, distributed consensus, national infrastructure, treaty interoperability, or sovereign adoption.

## Purpose

AXIOM-MESH is intended to become more than a secure execution kernel. Its long-horizon purpose is to provide a common foundation through which people, voluntary groups, institutions, jurisdictions, and sovereign states can exercise authority while preserving independent control, explicit delegation, portable evidence, visible uncertainty, and truthful claims.

The architecture must support two requirements that can appear to conflict:

1. high assurance, accountability, and independent verification where consequences justify them; and
2. low-friction, high-speed execution where deep verification would cost more than the action warrants.

It must also allow different communities and states to retain their own governance structures rather than forcing every participant into one constitutional model.

The resulting doctrine is:

> **Verify in proportion to consequence. Preserve enough provenance to reconsider. Keep authority explicit and scoped. Allow plural governance without surrendering independent control. Never advertise beyond the evidence.**

## 1. Four dimensions that must remain separate

AXIOM-MESH must not collapse the following concepts into one trust score:

### 1.1 Authority

Who or what is permitted to attempt an action, under which delegation, policy, jurisdiction, purpose, duration, and resource limit.

### 1.2 Assurance

How strongly the request, execution, output, and evidence have been authenticated, reproduced, reviewed, corroborated, or independently verified.

### 1.3 Finality

Whether the result is provisional, locally accepted, challengeable, institutionally binding, judicially reviewable, or collectively finalized.

### 1.4 Retention

What evidence must be retained, for how long, by whom, under which privacy and disclosure constraints.

A low-assurance action may still be properly authorized. A highly verified observation may still lack authority to bind anyone. A final decision may later be appealed without rewriting the original record. These distinctions are foundational.

## 2. Mandatory authority path

Adaptive assurance does not create a bypass around the trusted runtime.

Every privileged or externally visible effect continues to follow the mandatory path:

```text
Gateway
  -> authenticate and validate
  -> Hypervisor policy and authority evaluation
  -> explicit plan and required approvals
  -> short-lived scoped grant
  -> Sandbox bounded execution
  -> Grid state and evidence commitment
  -> readable result and receipt
```

The amount and depth of evidence may vary, but ambient authority, silent policy bypass, or unverifiable mutation do not become acceptable merely because an action is labelled low risk.

## 3. Adaptive assurance profiles

The following ladder is a planning model. Exact names, schemas, and thresholds require implementation and conformance tests before registry promotion.

| Profile | Meaning | Typical use |
|---|---|---|
| **A0 — Ephemeral** | Best-effort, reversible, no durable claim beyond optional local telemetry | brainstorming, previews, disposable simulation |
| **A1 — Attributable** | Authenticated principal, scoped authority, lightweight receipt | personal organization, reversible local changes |
| **A2 — Auditable** | Inputs, policy decision, grant, execution identity, output digest, and evidence continuity retained | persistent automation, selective sharing, Circle tasks |
| **A3 — Independently verified** | Separate approval, verifier, reproducible execution, witness, or equivalent corroboration | financial, legal, identity, administrative, sensitive governance |
| **A4 — Collectively finalized** | Threshold or chamber decision, explicit quorum, challenge and dispute rules, finality record | constitutional changes, shared treasury, binding collective commitments |

The effective assurance requirement should be the maximum applicable floor:

```text
required_assurance = max(
  kernel_safety_floor,
  owner_policy,
  Circle_or_institution_policy,
  jurisdiction_or_domain_policy,
  adapter_requirement,
  action_risk_requirement
)
```

A higher-level domain may raise an assurance requirement. It may not lower a non-waivable kernel safety floor or silently defeat a member's stronger local protection.

## 4. Fast paths without abandoning accountability

AXIOM-MESH should support efficiency through controlled mechanisms rather than an unbounded "unverified mode":

- optimistic execution for reversible, low-consequence actions;
- asynchronous post-execution verification for provisional results;
- receipt batching and Merkle or equivalent commitment structures;
- sampling of routine activity under published sampling policy;
- anomaly-triggered escalation;
- value, risk, privacy, irreversibility, or jurisdiction thresholds;
- challenge windows during which stronger evidence may be demanded;
- compensation, rollback, or corrective transactions where reversal is reliable;
- cached conformance evidence for immutable executors, models, policies, or binaries;
- declared degraded modes with visible limitations and expiry.

Speed optimizations must preserve attribution, declared assurance, and the distinction between provisional and final outcomes.

## 5. Retrospective reassessment

Low-assurance records may later be reassessed, corroborated, challenged, or superseded. Reassessment must append a linked record; it must never rewrite history to suggest that stronger verification existed at execution time.

A reassessment record should eventually carry:

```text
original_event_id
assurance_at_execution
reviewer_or_verifier
review_authority
reviewed_material
review_method
review_time
review_assurance
outcome
limitations
challenge_status
superseding_or_corrective_links
```

Permitted review outcomes may include:

- corroborated;
- partially corroborated;
- contradicted;
- unverifiable;
- accepted despite uncertainty;
- rejected;
- superseded by correction;
- reopened on new evidence.

The assurance of a later review is not retroactive assurance of the original event.

## 6. Plural authority domains

A Circle is not sufficient to represent every form of collective authority. AXIOM-MESH should reserve distinct governance scopes.

### 6.1 Personal node

The independently controlled root for a person's identity, consent, memory, preferences, credentials, delegations, private evidence, and participation decisions.

### 6.2 Circle

A primarily voluntary or contractual association such as a family, team, cooperative, community, research group, creator collective, or project.

A Circle may define membership, roles, proposals, tasks, approvals, shared policies, evidence visibility, conflict handling, and exit, while members retain independently owned nodes and records.

### 6.3 Institution

A formally constituted organization with offices, regulated duties, internal procedures, records obligations, employment or fiduciary roles, and possibly public responsibilities.

Examples include companies, charities, universities, hospitals, unions, courts, agencies, and professional bodies.

### 6.4 Jurisdiction

A public-law domain with territorial, subject-matter, or population scope. It may contain municipalities, provinces or states, Indigenous governments, courts, agencies, and public service systems.

### 6.5 Sovereign domain

A constitutional root for national public authority, including citizenship or residency relationships, public offices, legislative and executive procedures, courts, emergency powers, amendment, succession, and national trust anchors.

A sovereign domain is not simply a large Circle because participation may not be fully voluntary and the state may exercise coercive legal powers.

### 6.6 Treaty domain

A negotiated interoperability and shared-governance domain among sovereign or sub-sovereign participants. It may define recognized credentials, signatures, evidence, dispute procedures, data-transfer rules, standards, shared measurements, and withdrawal.

A treaty domain must not imply a universal global authority.

## 7. Constitutional mapping, not constitutional replacement

A nation adopting AXIOM-MESH infrastructure should not be required to adopt a prescribed political model.

The architecture should be able to represent, without endorsing as legitimate merely by representation:

- parliamentary and presidential systems;
- constitutional monarchies and republics;
- federal, confederal, unitary, and devolved structures;
- bicameral and unicameral legislatures;
- courts, administrative tribunals, independent agencies, and auditors;
- municipalities, provinces, states, territories, and Indigenous governments;
- referenda, citizen assemblies, delegated rulemaking, and public consultation;
- emergency powers, expiry, review, and restoration of ordinary authority;
- constitutional amendment and institutional succession.

The mesh does not decide who lawfully possesses authority. It records the asserted source, scope, delegation, procedure, action, evidence, objection, review, and outcome so those claims can be independently inspected.

## 8. Sovereignty-preserving interoperability

Sovereign deployments may retain independent:

- constitutional structures;
- legal systems and evidentiary standards;
- identity and citizenship rules;
- cryptographic trust anchors;
- data residency and privacy requirements;
- public institutions and policy priorities;
- language, accessibility, and records obligations;
- deployment, operational, and security control.

Interoperation should occur through explicit bilateral, multilateral, regional, or treaty profiles that define exactly what is recognized and for what purpose.

Possible profiles include:

- credential recognition;
- educational and professional qualification recognition;
- customs, tax, and trade records;
- migration and work authorization;
- cross-border legal evidence requests;
- environmental and scientific measurements;
- public-health coordination;
- disaster response;
- standards conformance;
- treaty decisions and disputes.

No imported policy, governance module, credential, or record acquires authority merely because it is technically readable.

## 9. Governance-pattern exchange and institutional learning

AXIOM-MESH should make governance mechanisms observable and reusable without making them self-authorizing.

A governance pattern may include:

- proposal and amendment procedure;
- role and delegation structure;
- quorum and voting rule;
- citizen review or participatory budgeting process;
- procurement workflow;
- conflict-of-interest control;
- appeal and remedy path;
- emergency procedure;
- measurement and evaluation method.

The safe lifecycle is:

```text
observe
  -> import as inert pattern
  -> verify provenance and claims
  -> simulate with local data or synthetic fixtures
  -> adapt to local law and culture
  -> review independently
  -> authorize through the receiving domain's own procedure
  -> activate within an explicit scope
  -> measure outcomes
  -> retain rollback and appeal
```

Governance patterns should support comparative evidence without reducing political legitimacy to a single metric.

## 10. Comparative outcome infrastructure

Where participants consent and legal obligations permit, domains may publish interoperable measurements such as:

- proposal-to-decision and decision-to-implementation time;
- administrative cost and workload;
- participation, representation, and accessibility;
- appeal, reversal, correction, and remedy rates;
- emergency-power frequency and duration;
- procurement competition and delivery performance;
- service access and distributional outcomes;
- forecast accuracy and promise completion;
- conflict-of-interest and corruption indicators;
- citizen or member comprehension and satisfaction;
- privacy, exclusion, and false-positive harms.

Every metric must declare provenance, coverage, missingness, methodology, uncertainty, and incentives. AXIOM-MESH must not present a governance score as objective truth when it encodes contested values.

## 11. Non-waivable technical invariants

Plural governance must not allow every operator to redefine verification until it becomes meaningless. A conforming AXIOM implementation should preserve at least these technical truths:

- records are not silently rewritten;
- signatures are not falsely attributed;
- delegated authority identifies its source and scope;
- emergency authority is distinguishable from ordinary authority;
- expiry, revocation, and supersession remain visible;
- uncertainty, conflict, and missing evidence remain visible;
- later review does not falsify original assurance;
- imported records preserve provenance and do not silently become local truth;
- independently verifiable exports do not require trusting the producing operator;
- technical authorization is not represented as proof of legal legitimacy;
- installation, simulation, or observation does not grant runtime authority;
- one domain cannot silently acquire ambient authority over independently owned nodes.

## 12. Rights, coercion, and authoritarian misuse

Nation-state infrastructure creates the greatest accountability opportunity and the greatest misuse risk.

Threats include:

- population-scale surveillance;
- compulsory identity correlation;
- political loyalty or social scoring;
- automated exclusion from essential services;
- predictive policing without contestability;
- irreversible blacklists;
- covert policy changes;
- coercive capture of personal nodes;
- unreviewable emergency powers;
- falsification or selective erasure of public history.

Future sovereign profiles must therefore address:

- purpose limitation and data minimization;
- targeted rather than ambient authority;
- due process, notice, contestability, and human appeal;
- independent courts, auditors, ombuds, or equivalent review authorities;
- expiry and mandatory reauthorization;
- public-interest disclosure and protected secrecy boundaries;
- split control over population-scale queries and exports;
- anti-correlation and selective-disclosure designs;
- transparent degraded or emergency operation;
- remedies, correction, restitution, and institutional accountability;
- the ability for independent verifiers to detect nonconforming deployments.

AXIOM-MESH cannot guarantee political legitimacy. It can refuse to hide how power was exercised.

## 13. Authority composition

The effective decision should be intersectional and deny-dominant:

```text
action_permitted =
  kernel_permits
  AND owner_or_subject_policy_permits
  AND participating_domain_policy_permits
  AND applicable_adapter_policy_permits
  AND jurisdictional_requirements_are_satisfied
  AND required_approvals_are_present
```

Conflicts between domains must produce an explicit denial, appeal path, or unresolved state. They must not be resolved by silently choosing the most powerful actor.

## 14. Schema reservations

Future schema evolution should be able to represent, without forcing immediate implementation:

- `required_assurance` and `achieved_assurance`;
- `verification_status` and `finality_status`;
- provisional, challengeable, stayed, appealed, reversed, and superseded states;
- retrospective attestation and reassessment links;
- authority-domain identifiers and types;
- charter, constitution, statute, regulation, policy, order, and treaty records;
- offices, roles, credentials, delegation chains, terms, succession, and vacancies;
- jurisdiction, territorial, subject-matter, population, and temporal scope;
- quorum, chamber, threshold, veto, review, and ratification rules;
- emergency authority, expiry, renewal, containment, and post-event review;
- public/private/confidential/secret evidence classes with disclosure authority;
- independent verifier and observer identities;
- governance pattern packages, simulations, adaptations, and adoption records;
- outcome metrics with methodology and uncertainty;
- treaty recognition, reservation, dispute, amendment, and withdrawal;
- migration and continuity across software, operator, institutional, and constitutional change.

Schema reservation does not authorize these records or make their semantics complete.

## 15. Implementation sequence

### Near term: preserve compatibility

- keep current kernel claims unchanged;
- document this architecture and its non-claims;
- ensure new schemas do not assume one governance model;
- keep Circle work compatible with independently owned nodes, explicit roles, revocation, visible conflict, and human appeal;
- avoid hard-coding one global trust root or one consensus mechanism.

### Circle foundation

- invitation and membership records;
- versioned charters;
- scoped roles and delegations;
- proposals, commitments, approvals, evidence timelines, revocation, exit, and appeal;
- selective sharing and causal conflict handling;
- A1-A3 assurance profiles for bounded collaborative workflows.

### Institutional foundation

- formal offices and succession;
- regulated records and retention;
- multi-role approvals and separation of duties;
- organizational policy overlays;
- public/private evidence classifications;
- institutional audit and external review.

### Jurisdiction and sovereign laboratory

- constitutional authority graphs;
- legislative, administrative, and judicial lifecycles;
- public office credentials;
- emergency authority and expiry;
- rights, remedies, appeal, and independent review;
- privacy-preserving identity and public records;
- synthetic and historical simulations only until independent legal, security, human-rights, accessibility, and governance review.

### Treaty and collective-finality laboratory

- cross-domain recognition profiles;
- independent trust anchors;
- dispute and withdrawal;
- assurance negotiation;
- collective finality and consensus only where shared state requires it;
- no public authority, real funds, or binding legal effect during laboratory status.

## 16. Promotion gates

No plural-authority capability may be promoted merely because code exists.

Applicable gates include:

- exact capability registry entry and evidence binding;
- threat model updated for the authority and coercion surface;
- negative tests for bypass, replay, equivocation, silent rewrite, and privilege escalation;
- privacy, accessibility, exclusion, and human-comprehension testing;
- clear authority and appeal semantics;
- recovery, revocation, succession, and rollback exercises;
- independent security review;
- independent legal, constitutional, regulatory, or human-rights review where relevant;
- authentic bounded pilots with named participants and consent;
- truthful public claims and explicit non-claims;
- no unresolved critical or high-severity finding.

## 17. Current claims and non-claims

### What is true now

The current kernel provides a local-first authenticated intent-to-evidence path, deny-dominant policy, scoped grants, bounded execution, encrypted state, signed evidence, local governance records, admitted-node records, causal exchange foundations, and portable verification artifacts as described by the capability registry and canonical current-build documentation.

### What this document adds

This document adds an approved architectural destination, vocabulary, compatibility constraints, risk model, and phased planning structure.

### What is not yet true

The project does not currently claim:

- production Circles or institutional governance;
- adaptive assurance profiles in runtime schemas;
- retrospective assurance promotion;
- jurisdictional or sovereign authority;
- national identity or public-service infrastructure;
- constitutional mapping engine;
- treaty interoperability;
- BFT or other distributed consensus;
- shared treasury or settlement;
- legally binding automated governance;
- protection against a sovereign operator controlling all deployment layers;
- independent validation of this architecture by constitutional, human-rights, or public-administration experts.

## 18. Governing maxim

> **Build the smallest trustworthy pieces now while preserving a path to plural, nested, sovereign governance later. Let people and institutions retain control. Let communities learn from one another. Let evidence travel farther than authority. Let authority remain bounded by the domain that legitimately granted it.**
