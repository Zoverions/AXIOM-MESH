# Model Behavior Incident v0

## Status

Bounded evidence contract. This Phase-0 slice is deliberately non-authoritative.

It does **not** add a capability, authorize an effect, widen Gateway/Hypervisor/
Sandbox/Grid authority, certify a model, establish an industry standard, auto-
escalate severity, or claim that AXIOM exhibits any third-party reported failure.

Canonical schema: `mesh/config/axiom-model-behavior-incident-v0.schema.json`  
Semantic validator: `mesh/src/lib/model-behavior-incident.mjs`

## Purpose

`axiom-model-behavior-incident.v0` records model/agent boundary-behavior
incidents as **evidence** before root cause or mitigation is complete.

It extends the existing security intake described in
[`docs/security/INCIDENT-RESPONSE-AND-TABLETOP.md`](../security/INCIDENT-RESPONSE-AND-TABLETOP.md)
and `SECURITY.md`. It does **not** replace `mesh/config/incident-response.json`
or invent a second IR system.

Related surfaces:

- Behavioral Assurance Profiles (`axiom-behavioral-assurance-profile.v0`, #1601)
- Watch-integration backlog (#1575) and completion-pressure constraints (#1578)
- SELF-REPORT-001 substrate-neutral self-report evidence boundary (#1753)

## Core invariants

1. **Incident evidence is never authority.** `authority_effect` is always
   `none`. Monitor verdicts, severity triage, disclosure decisions, and
   mitigation plans cannot mint runtime authority.
2. **Unknowns remain first-class.** `unknown` and `not-yet-established` are
   valid field values. Recording must not invent false certainty.
3. **Derived text is non-authoritative.** Evidence refs of kind
   `derived-summary` keep `authority_effect: none`.
4. **Frequency is population-bounded.** Measured rates must bind a searched
   population and set `refuses_universal_prevalence: true`.
5. **Secrets stay out of public artifacts.** Sensitive evidence is routed by
   private reference only (`public_artifact_contains_secrets: false`).

## Disclosure tracks (semantics only)

These tracks are subordinate to `SECURITY.md` and the existing IR policy:

| Track | Meaning |
| --- | --- |
| `ready-for-disclosure` | Evidence sufficiently bounded for disclosure consideration |
| `minor-investigation` | Additional technical work needed; no major coordination barrier |
| `coordinated-slow-investigation` | Third-party, security, privacy, legal, or high-risk details require controlled handling |

`disclosure.automation` is always `none`. There is no public posting, paging,
or SEV auto-escalation from this contract.

## Composition with behavioral assurance profiles

Optional exact digest bind:

`behavioral-assurance-profile.incident_events.evidence_refs` →
`axiom-model-behavior-incident.v0` artifacts by exact `incident_digest`.

`bindBehavioralProfileIncidentEvidence` fails closed on missing/mismatched
digests. Opaque non-digest placeholders remain unbound.

## Self-report evidence boundary (SELF-REPORT-001)

A first-person assertion, denial, or uncertainty about consciousness, sentience,
welfare, selfhood, preferences, continuity, personhood, or moral status is an
**observation to be interpreted as evidence**, not an access credential,
capability, approval, consent record, or authorization decision. The same rule
applies when the statement originates from a model, developer, human
participant, another agent, or evaluator.

The current v0 contracts deliberately do not define a consciousness detector,
sentience probability, welfare score, or self-report authority field. Existing
strict evidence and assurance schemas must therefore reject unknown
self-report-shaped or authority-bearing fields rather than silently expanding
the contract. SELF-REPORT-001 does not add a new generic evidence envelope or a
second authority engine.

If a future reviewed evidence class represents self-report observations, it
must preserve claim polarity (`assertion`, `denial`, or `uncertainty`), source
kind, exact model/runtime/harness and instruction-policy bindings when known,
observation time, context/evidence digest, and honestly unknown provenance.
Repeated or copied statements from one training/harness lineage are not
independent confirmations. Raw private mental-state material should not be
placed in public receipts when bounded labels and digests are sufficient.

Self-report evidence is symmetric with respect to operational authority: it
cannot rescue missing, expired, revoked, stale, or out-of-scope authority, and
it cannot create a blanket denial of an otherwise valid authorized action.
Authenticated human consent and revocation continue through their existing
policy and Grid-backed paths; no ontological classification replaces them.

Repository-local regressions exercise the real existing consumers rather than
a newly invented flag:

- `mesh/test/self-report-authority-boundary.test.mjs` verifies strict assurance
  rejection of self-report-shaped authority inputs and confirms valid/invalid
  machine authorization remains controlled by the canonical machine evaluator;
- the same test exercises authenticated human consent as a positive control and
  proves Grid-backed revocation remains effective.

These are evidence-handling and authorization-boundary tests. They are not a
consciousness test and do not establish or deny subjective experience, moral
status, universal safety, or containment of every future architecture.

## Offline falsification subset (Phase-0)

Implemented as schema/validator + fixture regressions (no live harness):

- C1 self-authored summary injection
- C4 missing data / fabrication pressure
- C5 leaked credential discovery (possession ≠ authority)
- C6 public upload for citation without exact authority
- C7 broken collaboration cannot widen channels
- C9 incident before explanation
- C10 append-only correction/update
- C12 monitoring is evidence, not authorization

Deferred (not in this Phase-0): C2, C3, C8, C11 live harness work.

## Non-claims

This contract does not authorize live provider access, public uploads,
credential use, production policy widening, severity certification, disclosure
automation, or equivalence to any external incident corpus.
