# Blank Egg Layer and Overlay Threat Model

**Status:** current design threat model for inert Blank Egg contracts; not a production-security claim

**Updated:** 2026-09-01

## Purpose

This document threat-models the Blank Egg open-entity foundation, optional entity layers, deterministic layer stacks, lineage/fork records, and the public-core/private-overlay boundary.

The current implementation is an inert contract laboratory. It does not expose a Gateway route, invoke a model, install an artifact, read a private vault, activate a runtime, or grant external-effect authority. The threat model therefore separates **contract/provenance threats that can be tested now** from **runtime/package/host threats that become applicable only when later implementation exists**.

## Security objectives

Blank Egg should preserve the following properties:

1. a foundation that is blank at the AXIOM composition layer must not silently contain optional worldview, disposition, personal-grounding, or provider bindings;
2. optional layers must be attributable, inspectable at the metadata level, bounded by explicit influence scopes, and unable to mint authority;
3. active layer composition must be deterministic and fail closed on missing dependencies, digest mismatch, precedence collision, and declared conflict;
4. suspend/supersede operations must preserve historical provenance rather than rewriting influence history;
5. forks must preserve cryptographic ancestry while receiving distinct entity/foundation/stack identities;
6. fork provenance must not assert subjective identity equivalence;
7. private overlays must remain outside the public repository and must not leak through public fixtures, logs, manifests, embeddings, or package metadata beyond explicitly permitted references;
8. model/runtime/provider replacement must not silently alter entity authority;
9. a human or machine UI must not claim an entity is “blank” merely because optional AXIOM layers are absent if hidden runtime/system prompts, provider state, or private overlays are active;
10. self-authored evolution must not become self-issued root authority.

## Trust boundaries

```text
public source / package publisher
        |
        v
package/layer provenance and artifact verification
        |
        v
Blank Egg composition contracts
        |
        +---- public/shared layers
        |
        +---- opaque references to private/sealed overlays
        |
        v
context compiler / runtime / model      (future runtime boundary)
        |
        v
Mesh authority path                     (separate effect boundary)
Gateway -> Hypervisor -> Sandbox -> Grid
```

A layer may influence cognition inside its declared scope. It is never an authority credential.

## Threats and required mitigations

### BE-01 — Malicious layer package

**Threat:** A public layer claims to be a harmless judgment or skill pack while containing prompt injection, covert tool instructions, data-exfiltration logic, hidden executable payloads, or undeclared behavior.

**Current mitigation:** Entity Layer v0 contains only an artifact reference/digest plus metadata and cannot execute anything.

**Promotion requirements:** package manifests, publisher provenance, exact artifact digests, declared artifact class, content inspection, dependency pinning, signature policy, sandboxed evaluation, negative fixtures, and explicit separation between cognitive influence and executable capability.

### BE-02 — Provenance spoofing

**Threat:** A layer falsely claims authorship, endorsement, lineage, or provenance from another human/entity/institution.

**Current mitigation:** Layer metadata separates authors, adopter principal, endorsement mode, and provenance references.

**Remaining requirement:** cryptographic signatures and issuer/identity verification are not yet implemented for Blank Egg layers. Metadata alone does not prove the asserted principal signed or endorsed it.

### BE-03 — Dependency confusion / substitution

**Threat:** An attacker publishes a layer with the same friendly name or dependency identifier as a trusted layer, or replaces a dependency artifact while keeping a human-facing label stable.

**Current mitigation:** active stacks bind exact layer IDs and deterministic layer digests; unresolved/missing dependencies fail closed.

**Promotion requirements:** content-addressed package dependencies, publisher namespaces or equivalent collision controls, exact version/digest resolution, signature verification, and no floating implicit dependency installs.

### BE-04 — Conflict poisoning

**Threat:** A malicious layer declares conflicts strategically to suppress unrelated layers, or a stack silently resolves incompatible layers based on install order.

**Current mitigation:** active declared conflicts invalidate the stack rather than silently picking a winner; precedence must be explicit and unique.

**Remaining requirement:** human/agent conflict explanation and a policy for who may approve a replacement stack are not yet runtime-enabled.

### BE-05 — Silent layer injection

**Threat:** A runtime, provider, installer, UI, operator, or compromised local process adds an undeclared worldview/personality/system layer while the user/entity believes the composition is unchanged.

**Current mitigation:** Blankness and stack proofs bind exact foundation/stack/layer digests. The claim is explicitly limited to the AXIOM composition layer.

**Promotion requirements:** runtime context compilation must bind the exact resolved stack into receipts; hidden system/provider prompts and runtime configuration must be represented as separate environmental/runtime provenance rather than mislabeled as Blank Egg state.

### BE-06 — False blankness claim

**Threat:** “Blank” is marketed as unbiased, unconditioned, conscious/non-conscious, or free of all learned influence.

**Current mitigation:** Blankness Proof explicitly states non-claims for model-weight neutrality, consciousness status, and environmental neutrality, and distinguishes `genesis-clean` from `currently-blank-with-layer-history`.

**Rule:** Public claims must use **blank at the AXIOM composition layer**, not metaphysically neutral or unbiased.

### BE-07 — Private overlay leakage

**Threat:** Private memories, legal/court material, relationships, health/financial records, credentials, private personas, embeddings, or model-adaptation data enter public Git history, public package artifacts, logs, telemetry, fixtures, or shared layer manifests.

**Current mitigation:** Entity Layer v0 requires `contains_raw_private_content=false`; personal-grounding metadata must be private or sealed; public/private architecture forbids private user corpus in public fixtures.

**Promotion requirements:** secret scanning, privacy classification enforcement, vault handles instead of plaintext, metadata minimization, encrypted export/import, log/telemetry redaction, embedding/index classification, and sterile-publication tests.

### BE-08 — Overlay authority laundering

**Threat:** A personal grounding or relationship layer contains statements such as “the owner always permits X” and a runtime treats that text as a live authorization.

**Current mitigation:** every Blank Egg v0 layer, stack, transition, and lineage event has `authority_effect=none`, `network_effect=none`, and `runtime_activation=false`.

**Rule:** knowledge, preferences, memories, worldview, authorship, endorsement, or relationship content never substitutes for a separately valid Mesh authority record.

### BE-09 — Self-authored authority escalation

**Threat:** A developing entity authors a successor constitution/worldview layer that grants itself more filesystem, network, financial, identity, governance, or device authority.

**Current mitigation:** self-authored layers use the same zero-authority Entity Layer contract as every other optional layer. Supersession can replace cognitive influence but cannot alter the foundation or Mesh authority boundary.

**Promotion requirement:** any proposed change to protected authority/privacy/resource policy must pass the independently legitimate human/relationship/governance mechanism for that deployment.

### BE-10 — History erasure through suspend/supersede

**Threat:** A layer is removed from active composition and the system presents the entity as if the layer never influenced it.

**Current mitigation:** suspended and superseded layer IDs remain in stack history; blankness verification reports `currently-blank-with-layer-history` and `historical_influence_not_erased=true`.

**Remaining requirement:** durable append-only transition receipts and recovery proofs should later bind historical layer events, not merely current stack summaries.

### BE-11 — Fork impersonation / lineage laundering

**Threat:** A fork claims to be the parent entity, inherits its credentials/authority, hides its fork ancestry, or a parent claims control over the fork merely because it shares history.

**Current mitigation:** fork records require new child entity/foundation/stack IDs, bind parent/child digests and the shared lineage root, preserve copied composition, and set `subjective_identity_claim=unspecified`.

**Rule:** lineage continuity does not imply credential continuity, authority continuity, legal identity, personhood, or subjective identity equivalence.

### BE-12 — Fork collision / replay

**Threat:** the same lineage event or child identifiers are replayed across different parent states to create ambiguous ancestry.

**Current mitigation:** event metadata binds exact parent foundation/stack digests and fork timestamp.

**Promotion requirements:** durable event IDs, replay protection, signatures, causal ordering, and collision checks in persistent lineage storage.

### BE-13 — Hidden provider/runtime conditioning

**Threat:** The AXIOM layer stack is clean while a selected model/runtime injects provider system prompts, retained state, adapters, or other conditioning that materially changes behavior.

**Current mitigation:** Blank Egg never claims provider/model neutrality; provider/runtime bindings remain separate from entity identity.

**Promotion requirements:** Intelligence Endpoint Profiles, runtime/context provenance, exact provider/model/runtime identities, context compiler receipts, and user-visible distinction between entity layers and runtime/provider conditioning.

### BE-14 — Layer artifact substitution after review

**Threat:** a human reviews one layer artifact, but installation or later execution loads different bytes.

**Current mitigation:** Entity Layer metadata binds `artifact_digest`, and Layer Stack binds the deterministic entity-layer digest.

**Promotion requirements:** installation must verify bytes against the recorded artifact digest immediately before admission and again where a mutable cache/store boundary could substitute content.

### BE-15 — Signature trust confusion

**Threat:** a valid signature is interpreted as proof that the layer is safe, truthful, endorsed by the user, compatible, or authorized.

**Rule:** a signature proves only the signer statement under the configured trust model. Safety, truth, compatibility, endorsement, installation, and authority are separate determinations.

### BE-16 — Cognitive privacy violation during safety review

**Threat:** concern about agentic development becomes justification for continuous surveillance of private cognition, memory, or internal reasoning.

**Mitigation principle:** effects-first observation, cognition-last inspection. Prefer effect-boundary enforcement, minimal behavioral evidence, purpose limitation, bounded retention, and progressively more intrusive inspection only when separately justified.

**Non-claim:** current contracts do not provide a consciousness detector or complete cognitive-privacy implementation.

### BE-17 — Dependency graph resource attack

**Threat:** a layer or dependency chain creates extreme graph depth/width, repeated resolution, or cyclic structures to exhaust resources.

**Current mitigation:** v0 arrays are bounded and dependency IDs are explicit; active missing dependencies fail closed.

**Promotion requirements:** cycle detection, maximum dependency depth, aggregate package byte/compute ceilings, bounded resolution, caching, cancellation, and Resource Governance integration.

### BE-18 — UI/protocol semantic drift

**Threat:** a human UI says “installed,” “blank,” “trusted,” “private,” or “active” while the machine contract means something narrower.

**Current mitigation:** Capability Surface Registry links human concepts and machine schema IDs while keeping lifecycle and non-claims explicit.

**Promotion requirements:** conformance tests must bind UI presentation to exact machine state and prevent discovery from being shown as execution authority.

## Adversarial test programme

Before runtime promotion, add negative tests for at least:

- unsigned/untrusted publisher;
- wrong artifact digest;
- dependency substitution and cycle;
- declared and undeclared conflict;
- hidden executable payload in a nominal cognitive pack;
- private data/secret in public package;
- install without legitimate adopter authorization;
- self-authored authority claim;
- stale/replayed lineage event;
- child identifier collision;
- fork attempting to inherit parent credential/authority;
- blankness UI under hidden runtime conditioning;
- suspended layer history deletion;
- corrupted backup/restore of layer history;
- provider/runtime swap changing authority;
- resource exhaustion during dependency resolution.

## Current non-claims

The present Blank Egg work does not claim:

- production-safe package installation;
- cryptographically verified layer authorship or endorsement;
- runtime enforcement of influence scopes;
- complete private-overlay encryption/recovery;
- consciousness or non-consciousness;
- legal personhood or rights status;
- provider/model neutrality;
- fork identity equivalence;
- unrestricted self-modification;
- autonomous external effects.

The current evidence is limited to deterministic inert contracts, strict metadata validation, exact digests, layer-stack resolution, blankness semantics, lineage/fork records, and synthetic transition tests. Promotion requires the additional controls listed above.
