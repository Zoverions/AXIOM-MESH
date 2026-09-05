# AXIOM Verify — MVP Scope

**Build context:** AXIOM-MESH `0.12.0-dev.3`  
**Tracker:** VERIFY-001 in `docs/MASTER-TODO.md`  
**Status:** Scope document only. Does not claim a shipped Verify product or production promotion.

## Purpose

AXIOM Verify is a local/static verifier that a human or machine can run without trusting the operator who produced a receipt or export package. It explains signatures, digests, continuity, scope, and non-claims in plain language (`docs/ROADMAP.md` product family).

## In scope (MVP)

1. Verify Grid-attested machine receipts (digest-bound request/authority, accepted and terminal anchors, chain-assurance metadata, terminal outcome digest) using public verification material only.
2. Verify selective export packages / evidence bundles produced by owner export flows (including AXIOM One selective local export shapes when schema-stable).
3. Verify continuity-anchor records of type axiom-grid-continuity-anchor.v1 against a provided chain segment from genesis through the retained head.
4. Explain failures in human language: bad signature, digest mismatch, gap, broken link, scope mismatch, expired grant metadata, unknown schema.
5. Emit a verification report that restates explicit non-claims (integrity vs truth).

## Integrity versus truth

Integrity: bytes, signatures, hash links, and declared scopes match under the verification keys and schemas supplied to Verify.
Truth: whether the underlying statement about the external world is correct.

Verify must never imply that a valid receipt proves model correctness, external-world facts, operator honesty beyond the signed bytes, or policy wisdom. ROADMAP: receipts show what was authorized and observed; they do not convert inference into fact or cryptographic integrity into truth.

## No operator trust required

MVP assumptions:

- Verifier runs locally or as a static tool on the verifier's machine.
- Inputs are files or URIs the verifier fetched under their own control.
- Operator-hosted APIs are optional convenience only; online Mesh membership is not required (ROADMAP: verifiability without membership).
- Verification keys and schema digests are obtained through a channel the verifier trusts independently of the package author.

## Out of scope (MVP)

- Hosting a public verification SaaS or requiring AXIOM accounts
- Promoting capabilities or changing mesh/config/capabilities.json
- Attesting TPM, TEE, measured-boot, or remote attestation
- Proving BFT consensus or multi-node finality
- Executing intents, granting capabilities, or acting as an authority client to Gateway, Hypervisor, Sandbox, or Grid
- Pilot dossier promotion decisions (remain pilot:package:verify plus human body)
- Certifying external runtimes or AI providers

## Acceptance tests (MVP)

1. Valid machine receipt plus matching public key yields PASS.
2. Altered receipt bytes yield FAIL.
3. Continuity anchor checks pass only when the chain segment matches the retained head rules in PROJECT-STATUS.
4. Export package digest checks must pass; any file substitution must fail.
5. Unknown schema id fails closed with explanation.
6. Report always includes integrity-versus-truth paragraph and no production-promotion language.
7. Prefer a dependency-free verifier binary or package isolated from the Mesh kernel policy.

Related helpers for inspiration only: verify-grid-chain, verify-export, verify-sync under mesh/src. They are not the Verify product.

## Non-claims

AXIOM Verify MVP does not claim product release status, Mesh production promotion, that verified receipts are true, that local verification detects every truncation without external anchors, regulated-domain compliance, or replacement of independent security review.
