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
