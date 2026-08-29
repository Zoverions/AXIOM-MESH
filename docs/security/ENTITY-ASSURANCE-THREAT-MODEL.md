# Entity Assurance Threat Model

Date: 2026-08-29
Status: initial v1

## Protected properties

Entity Assurance protects relying systems from treating weak, stale, duplicated, synthetic, coordinated, or incorrectly bound evidence as sufficient assurance about an actor.

It must preserve pseudonymity where policy permits it and must never become an alternate capability authority.

## Threats and controls

### Sybil multiplication

**Threat:** one operator presents many nominally independent actors.

**Controls:** explicit `uniqueness` and `independence` dimensions; policy-selected evidence classes and strength; deny-dominant negative evidence; no assumption that account count equals actor count.

### Coordinated synthetic personas

**Threat:** persistent personas appear independent while sharing control, infrastructure, or behavioral coordination.

**Controls:** independence evidence is separate from continuity; continuity alone never proves uniqueness or independence; measured and independently verified evidence can be required by policy.

### Identity coercion / KYC creep

**Threat:** assurance infrastructure becomes a universal legal-identity mandate.

**Controls:** identity requirement is relying-policy selected; `persistent-pseudonymous` is first-class; `legal` is optional; v1 performs no biometric or government-registry lookup.

### Stale credentials and revoked context

**Threat:** old evidence remains accepted after its context is no longer reliable.

**Controls:** evidence is observed/expiry scoped; expired and future evidence cannot satisfy evaluation; upstream revocation/currentness systems must issue or withdraw evidence appropriately.

### Evidence laundering

**Threat:** declarations or inferences are presented as measured or independently verified facts.

**Controls:** evidence classes are explicit and policies enumerate accepted classes. The evaluator never upgrades evidence class.

### Authority escalation

**Threat:** a high-assurance result is interpreted as permission to act.

**Controls:** evidence requires `non_authorizing: true`; policy requires `authority_effect: none` and `delegation_effect: none`; decisions return `authority_granted: false` and `delegation_granted: false`.

### Subject confusion

**Threat:** evidence for one actor is mixed into the evaluation of another.

**Controls:** all supplied evidence must match the requested subject; mismatches fail the evaluation contract.

### Negative-evidence suppression

**Threat:** a relying system presents positive evidence while omitting or overshadowing known negative evidence.

**Controls:** within the evidence set supplied to the evaluator, qualifying current negative evidence is deny-dominant. Completeness of evidence acquisition remains an upstream responsibility and should be covered by collection/audit policy.

### Correlation and privacy leakage

**Threat:** assurance records become a cross-domain tracking graph.

**Controls:** v1 has no global registry, no automatic pseudonym correlation, and no requirement to expose legal identity. Relying domains should minimize evidence retained and use scoped identifiers/issuers.

## Residual risks

- A dishonest evidence issuer can still produce misleading authenticated assertions.
- Independent-verification quality depends on verifier methodology.
- Sybil resistance is probabilistic unless a relying context requires a strong uniqueness primitive.
- Evidence-set completeness is not proven by the evaluator itself.
- Legal identity can still be privacy-invasive when a relying policy chooses it.

These are intentionally not hidden behind a single global assurance score.
