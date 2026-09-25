# Mind Developmental Status v0 Plan

**Status:** bounded inert implementation plan

**Design:** `docs/superpowers/specs/2026-09-25-mind-developmental-status-v0-design.md`

## D0 — canonical design

Register this design and plan.

## D1 — status contract

Add:

- `axiom-mind-developmental-status.v0`;
- strict semantic validator;
- JSON Schema;
- deterministic digest helper.

## D2 — transition evaluator

Add a pure transition evaluator proving:

- initial record must be Genesis with no predecessor;
- transitions advance exactly one stage;
- mind identity cannot change;
- predecessor digest must match exactly;
- effective time must advance;
- basis evidence is required;
- independent transition requires exact positive #1861 transition evidence;
- independent status cannot regress;
- result never mutates status or authority.

## D3 — adversarial coverage

Test:

- stage skipping;
- backward transitions;
- identity substitution;
- predecessor substitution;
- timestamp regression;
- empty/duplicate/malformed evidence;
- fake independent transition;
- stale/non-requestable independence transition evidence;
- Council voting / Genesis eligibility / authority laundering.

## Completion boundary

Stop at pure transition assessment.

No Grid mutation, Gateway route, Council role mutation, Genesis authorization, or
capability promotion belongs in v0.
