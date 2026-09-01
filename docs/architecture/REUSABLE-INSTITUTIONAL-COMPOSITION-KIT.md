# Reusable Institutional Composition Kit

**Status:** experimental architecture and conformance surface; not a current production capability.

## Purpose

AXIOM-MESH should let institutions reuse trustworthy mechanisms without forcing unrelated domains into one application model. Education, government, research, associations, businesses, care organizations, and machine organizations often need the same structural primitives: relationships, roles, terms, credentials, eligibility, consent, delegation, decisions, evidence, appeals, retention, succession, and bounded effects.

The substrate therefore standardizes the **mechanism**, not the institution's vocabulary or legal meaning.

> One primitive can support many institutional forms, but its security semantics must not mutate merely because the domain changes.

## Biological design analogy

Biological systems repeatedly reuse existing mechanisms for new functions. Digital institutional infrastructure should allow the same kind of exaptation: a credential mechanism can support a degree, professional qualification, training record, or service credential; a delegation mechanism can support a deputy official, teaching assistant, proxy, or agent subtask.

Repurposability belongs at the composition layer. It must not be achieved by making authority semantics vague.

## Composition model

A domain application projects local concepts onto stable primitives:

```text
local vocabulary
  -> domain projection
  -> reusable institutional primitives
  -> local charter / policy / jurisdiction overlay
  -> evidence + assurance requirements
  -> local authority evaluation
  -> bounded effect admission
  -> receipt / record / review path
```

Patterns are inert. Importing, installing, discovering, signing, endorsing, or simulating a pattern grants zero execution authority.

## Reuse boundaries

Reusable patterns MAY define:

- workflow shape;
- required primitive types;
- evidence obligations;
- review/appeal hooks;
- suggested separation of duties;
- retention classes;
- succession and recovery hooks;
- assumptions and limitations;
- compatibility and simulation fixtures.

They MUST NOT directly grant:

- membership;
- office;
- legal status;
- runtime authority;
- spending authority;
- production promotion;
- credential acceptance;
- jurisdiction;
- coercive eligibility;
- irreversible external effects.

Those decisions remain local.

## Local adaptation

Adoption should produce an explicit adaptation record identifying:

1. source package and immutable digest;
2. local institution/domain;
3. jurisdiction/policy overlay;
4. retained primitives;
5. narrowed or extended procedures;
6. local authority sources;
7. assurance and evidence floors;
8. retention/disclosure rules;
9. appeal/remedy rules;
10. effective date, expiry/sunset, and review owner.

A local adaptation can narrow a package freely. Expanding authority or removing safeguards requires the local authority and review process appropriate to that institution; the package itself cannot authorize the expansion.

## Human and machine symmetry

The same primitives may be operated through human interfaces or machine-readable APIs. A human-facing “grade appeal” and a machine-facing “decision challenge” can share lifecycle mechanics without requiring identical UX. Likewise a government office and a machine service role can use the same term/succession primitive without claiming they are socially or legally equivalent.

## Institutional continuity

Institution identity and office continuity must be separable from current officeholders, devices, and operational keys. Replacing a principal or key should not silently rewrite institutional history; conversely, institutional continuity must not preserve revoked personal authority.

## Adoption ladder

Recommended progression:

1. documentation and synthetic mappings;
2. inert package validation;
3. simulation with synthetic/historical data;
4. low-consequence voluntary pilot;
5. independent security/privacy/accessibility/domain review;
6. bounded live adoption where legally and ethically appropriate;
7. higher-consequence uses only through dedicated programmes.

Early public-sector use should favor low-coercion domains such as education credentials, standards, science, environment, public consultation, or disaster coordination—not elections, policing, criminal justice, taxation, immigration enforcement, essential-benefit eligibility, or other coercive state powers.

## Governing maxim

**Reuse mechanisms aggressively. Reuse authority never.**
