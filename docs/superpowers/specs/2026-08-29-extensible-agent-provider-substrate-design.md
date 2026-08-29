# Extensible Agent Provider Substrate — Design

**Status:** approved architectural extension; first executable slice remains inert and local

**Date:** 2026-08-29

**Scope:** provider descriptors for replaceable memory, knowledge-projection, agent-interoperability, attestation, provenance, and settlement components used by sovereign agent compositions

**Authority:** `mesh/config/capabilities.json` remains authoritative for runnable capability state. Provider presence, discovery, validation, evidence, cryptographic identity, reputation, payment capability, or hardware evidence does not grant AXIOM authority.

## 1. Design doctrine

This design extends `docs/superpowers/specs/2026-08-29-sovereign-agent-composition-continuity-design.md`.

> **Providers supply capabilities and evidence. They do not acquire sovereignty merely by being plugged in.**

AXIOM should permit users to choose memory systems, knowledge graphs, agent protocols, attestation mechanisms, provenance systems, and settlement rails without forcing those components into the authority root.

The provider substrate therefore follows four invariants:

1. provider declaration is descriptive, not activating;
2. evidence is typed and bounded rather than collapsed into a universal trust score;
3. provider-specific identity or payment rails do not become AXIOM principal authority;
4. privileged effects still flow through `Gateway -> Hypervisor -> Sandbox -> Grid`.

## 2. First executable slice

The first slice is deliberately smaller than the full architecture. It adds an inert, deterministic `Agent Provider Profile v0` contract and pure semantic validator.

The slice does **not** add:

- provider process execution;
- provider installation or package loading;
- network listeners or outbound network calls;
- Beacon, MCP, A2A, RustChain, x402, IOTA, AVAP, Memory OS, or Graft runtime integration;
- credentials, wallets, cookies, tokens, passkeys, or signing secrets;
- authority grants, principal creation, delegation, settlement, or spending;
- capability promotion;
- a universal assurance or reputation score.

## 3. Provider classes

The exact v0 provider classes are:

- `memory` — durable or working memory implementations;
- `knowledge-projection` — derived maps, wikis, graphs, summaries, or code/system projections;
- `agent-interop` — external agent discovery or message-transport adapters;
- `attestation` — evidence about device, execution environment, or physical/runtime properties;
- `provenance` — origin, transformation, commitment, signature, lineage, or external-anchor systems;
- `settlement` — payment/accounting rails that may later be governed by separate authority contracts.

A provider may fit more than one conceptual role, but one v0 profile declares exactly one primary class. Multiple profiles may reference the same upstream artifact when distinct roles need separate review.

## 4. Assurance model

The contract separates provider capability from assurance.

`assurance_ceiling` is a declared upper bound on what the profile may claim even if later evidence succeeds:

- `none`
- `self-asserted`
- `behavioral`
- `cryptographic`
- `hardware-rooted`

This value is evidence metadata only. It never grants authority.

`evidence_classes` declares the evidence families a provider may produce:

- `self-assertion`
- `deterministic-derivation`
- `signed-envelope`
- `replay-protected-envelope`
- `behavioral-fingerprint`
- `hardware-rooted-attestation`
- `content-digest`
- `transformation-lineage`
- `external-anchor`
- `payment-proof`

The first slice does not score, merge, or adjudicate evidence. Later policy may require particular evidence classes, but that belongs in the normal AXIOM policy/assurance path.

## 5. Contract shape

`axiom-agent-provider-profile.v0` contains:

- schema/version/status;
- provider identifier and primary provider class;
- implementation provenance reference and digest;
- source kind: `local | external | fork | adapter`;
- declared capability identifiers;
- declared evidence classes;
- assurance ceiling;
- profile reference used by compositions or catalogs;
- optional upstream artifact reference;
- canonical creation/update timestamps;
- hard non-authority constants.

The hard constants are:

```text
authority_effect = none
trust_effect = evidence-only
credential_visibility = none
network_effect = none
runtime_activation = false
settlement_activation = false
```

Unknown fields fail closed. Secret-bearing generic configuration bags are intentionally not representable.

## 6. Relationship to existing Agent Composition v0

Agent Composition v0 already allows runtimes, models, memory providers, and policy references to be described without activation.

The Provider Profile v0 contract is a separately validated referenced artifact. The first slice does not require compositions to resolve profile references and does not mutate the existing composition schema. This preserves compatibility and prevents an inert descriptive contract from becoming a hidden dependency or activation mechanism.

A future catalog/resolution layer may prove that `profile_ref` values resolve to exact provider profile digests. That work requires its own contract and tests.

## 7. External ecosystem mapping

The following external projects informed the design but are **not dependencies** of the first slice:

- Memory OS: replaceable local memory and self-curating knowledge architecture;
- Graft: regenerable semantic/code knowledge projection;
- Beacon: signed/replay-protected agent envelopes and discovery;
- RustChain/PPA: behavioral/physical hardware fingerprint evidence;
- AVAP/BoTTube: signed content provenance and external commitments;
- MCP and chain-specific adapters: thin compatibility surfaces;
- x402/IOTA/RustChain settlement examples: payment rails kept outside authority.

These names are architectural inputs only. AXIOM does not certify their claims by describing compatible provider classes.

## 8. Error handling and fail-closed behavior

The semantic validator rejects:

- unknown fields;
- unknown provider classes, evidence classes, source kinds, or assurance ceilings;
- duplicate capability or evidence identifiers;
- malformed identifiers or digests;
- non-canonical timestamps;
- `updated_at` earlier than `created_at`;
- any attempt to change the hard non-authority constants;
- oversized arrays.

Validation is pure and non-mutating.

## 9. Testing strategy

The first slice uses Node built-in tests and existing canonical digest/validation helpers.

Tests must cover:

- schema constants and closed-world structure;
- every provider class;
- deterministic digest across object key ordering;
- assurance metadata without authority gain;
- rejection of secret-bearing/unknown fields;
- duplicate and oversized lists;
- timestamp ordering;
- deep-frozen input/non-mutation;
- example laboratory profiles for Memory OS-style memory, Graft-style projection, Beacon-style interop, RustChain-style behavioral attestation, AVAP-style provenance, and x402-style settlement — all with activation disabled.

## 10. Promotion boundary

Passing these tests proves only that AXIOM can describe and validate provider profiles deterministically while preserving a zero-authority boundary.

It does not prove provider correctness, interoperability, security, availability, Sybil resistance, hardware identity, payment finality, or production readiness.

No capability registry entry is promoted by this slice.
