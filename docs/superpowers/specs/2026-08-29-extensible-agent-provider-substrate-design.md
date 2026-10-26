# Extensible Agent Provider Substrate — Design

**Status:** approved architectural extension; provider profile and binding slices implemented as inert local contracts; Beacon-style observation verification remains read-only and compatibility-neutral; restart-safe local replay persistence is implemented as a separate non-authorizing substrate

**Date:** 2026-08-29

**Scope:** provider descriptors for replaceable memory, knowledge-projection, agent-interoperability, attestation, provenance, and settlement components used by sovereign agent compositions

**Authority:** `mesh/config/capabilities.json` remains authoritative for runnable capability state. Provider presence, discovery, validation, evidence, cryptographic identity, reputation, payment capability, hardware evidence, or replay-state persistence does not grant AXIOM authority.

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

The newer Entity Assurance primitive remains a separate trust layer. A provider profile or successfully verified external envelope is **not automatically Entity Assurance evidence**. Any future conversion must pass an explicit normalization and subject-binding policy that states which AXIOM subject the evidence concerns, which assurance dimension it supports, its evidence class and freshness, and why the external issuer/key is accepted for that role. Entity Assurance remains non-authorizing and its decisions do not grant authority or delegation.

## 5. Contract shape

`axiom-agent-provider-profile.v0` contains:

- schema/version/status;
- provider identifier and primary provider class;
- implementation artifact reference and a verified digest when exact artifact bytes have been independently pinned;
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

For `source_kind: external`, `artifact_digest: null` is permitted only when `upstream_ref` is present. That state means the upstream candidate is identified but its exact artifact bytes have **not** been independently pinned by this profile. A null digest is therefore an explicit non-verification state, not placeholder provenance and not artifact-authenticity evidence. `local`, `fork`, and `adapter` implementations must carry a real 64-hex artifact digest. An external implementation may also carry a real digest when exact bytes have actually been independently pinned.

Unknown fields fail closed. Secret-bearing generic configuration bags are intentionally not representable.

## 6. Relationship to existing Agent Composition v0

Agent Composition v0 already allows runtimes, models, memory providers, and policy references to be described without activation.

Provider Profile v0 remains a separately validated referenced artifact. The composition schema is intentionally not mutated to embed provider implementations. Instead, the second executable slice adds a separate `axiom-agent-provider-binding.v0` artifact that commits to the immutable composition digest plus exact provider profile digests.

That separation preserves composition portability and prevents profile resolution from becoming an activation mechanism. A composition describes what the sovereign agent is composed from; the binding artifact proves which exact reviewed provider descriptions satisfy those references at a particular state.

## 7. External ecosystem mapping

The following external projects informed the design but are **not dependencies** of the provider profile or binding contracts:

- Memory OS: replaceable local memory and self-curating knowledge architecture;
- Graft: regenerable semantic/code knowledge projection;
- Beacon: signed/replay-protected agent envelopes and discovery;
- RustChain/PPA: behavioral/physical hardware fingerprint evidence;
- AVAP/BoTTube: signed content provenance and external commitments;
- MCP and chain-specific adapters: thin compatibility surfaces;
- x402/IOTA/RustChain settlement examples: payment rails kept outside authority.

These names are architectural inputs only. AXIOM does not certify their claims by describing compatible provider classes. The example external profiles intentionally use `artifact_digest: null` until exact upstream bytes are independently pinned; their `upstream_ref` names a candidate lineage only and does not authenticate or verify the upstream artifact.

## 8. Error handling and fail-closed behavior

Provider-profile validation rejects:

- unknown fields;
- unknown provider classes, evidence classes, source kinds, or assurance ceilings;
- duplicate capability or evidence identifiers;
- malformed identifiers or non-null digests;
- a null artifact digest for `local`, `fork`, or `adapter` sources;
- an external null artifact digest without a non-null upstream reference;
- non-canonical timestamps;
- `updated_at` earlier than `created_at`;
- any attempt to change the hard non-authority constants;
- oversized arrays.

Validation is pure and non-mutating.

## 9. Testing strategy

The provider substrate uses Node built-in tests and existing canonical digest/validation helpers.

Tests cover:

- schema constants and closed-world structure;
- every provider class;
- deterministic digest across object key order;
- assurance metadata without authority gain;
- rejection of secret-bearing/unknown fields;
- duplicate and oversized lists;
- timestamp ordering;
- deep-frozen input/non-mutation;
- explicit null-digest handling for unverified external candidates while pinned local/fork/adapter sources remain digest-required;
- example laboratory profiles for Memory OS-style memory, Graft-style projection, Beacon-style interop, RustChain-style behavioral attestation, AVAP-style provenance, and x402-style settlement — all with activation disabled;
- exact composition/provider digest binding;
- provider-binding identifier grammar parity with Agent Composition and Provider Profile, including hyphenated real-world provider references;
- required memory-slot resolution;
- rejection of provider or composition drift;
- signed external observation verification, tamper detection, bounded freshness, and caller-supplied replay-state checks;
- durable replay survival across fresh state reads, active-capacity saturation, expiry pruning, corrupt/non-canonical state, symlink paths, writer contention, bounded state size, and five-minute maximum retention;
- static proof that the binding resolver and Beacon verifier import no network, filesystem, subprocess, Grid, credential, wallet, token, or secret runtime surface;
- static proof that the durable replay store remains filesystem-only and imports no network, subprocess, privileged AXIOM runtime, credential, wallet, token, or secret surface.

## 10. First-slice promotion boundary

Passing Provider Profile v0 tests proves only that AXIOM can describe and validate provider profiles deterministically while preserving a zero-authority boundary.

It does not prove provider correctness, interoperability, security, availability, Sybil resistance, hardware identity, payment finality, artifact authenticity when `artifact_digest` is null, or production readiness.

No capability registry entry is promoted by this slice.

## 11. Second executable slice — deterministic provider binding

The second slice adds `axiom-agent-provider-binding.v0` and a pure resolver.

The binding artifact contains:

- a binding identifier;
- the exact `composition_id`;
- the canonical composition digest;
- one or more provider bindings containing provider id, class, profile ref, provider digest, target ref, and whether the binding is required;
- canonical timestamps;
- hard non-authority constants.

Resolution is closed-world and fail-closed:

1. validate the binding document;
2. validate the composition;
3. recompute and compare the composition digest;
4. validate every supplied provider profile;
5. resolve each provider id/profile ref pair exactly;
6. recompute and compare every provider digest;
7. require `memory` bindings to target a declared composition memory slot whose provider id/profile ref also match;
8. require non-memory provider classes to target the composition itself;
9. require every declared composition memory slot to be bound exactly once.

The resolver returns only a frozen evidence summary and deterministic binding digest. It starts no provider, performs no network operation, reads no credentials, creates no principal, and grants no authority.

This design deliberately avoids embedding provider implementation artifacts into Agent Composition v0. The reviewed implementation behind a stable logical `provider_id`/`profile_ref` can therefore be revised or rolled back through the separately governed provider profile and binding artifacts without changing the composition contract. Switching a composition slot to a different logical provider id or profile ref remains a composition change and must produce a new composition digest.

The binding contract deliberately uses the same identifier grammar as Agent Composition v0 and Provider Profile v0: `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$`. This allows existing identifiers such as `provider.memory.memory-os` while preventing a provider-binding layer from silently inventing a broader identifier namespace.

## 12. First Beacon-style observation verifier

The first interoperability execution-adjacent slice is intentionally narrower than a Beacon adapter. It verifies a Beacon-inspired external signed envelope as a **read-only observation candidate**.

It currently proves only local properties of the supplied envelope:

- exact closed-world structure;
- payload SHA-256 binding;
- Ed25519 signature validity over the canonical unsigned envelope;
- sender public-key fingerprint derivation;
- canonical issued/expiry timestamps;
- maximum five-minute envelope lifetime;
- maximum 30-second future clock skew;
- replay-key derivation from sender id plus nonce;
- rejection when that replay key appears in an explicit caller-supplied replay snapshot.

It intentionally does **not** itself provide:

- a network listener or outbound transport;
- persistent replay mutation;
- TOFU enrollment;
- AXIOM-principal binding;
- discovery trust;
- policy authorization;
- Gateway invocation;
- execution;
- actual Beacon protocol compatibility certification.

The returned verifier result therefore states:

```text
signature_verified = true
freshness_verified = true
replay_checked = true
replay_persistence = false
network_listener = false
authority_effect = none
network_effect = none
runtime_activation = false
compatibility_claimed = false
```

An external signature proves only that the supplied observation verifies under the supplied external public key. It does not establish that the key belongs to an AXIOM principal, that the sender is trustworthy, that it satisfies any Entity Assurance requirement, or that any requested action is authorized.

The verifier deliberately remains pure. Restart-safe replay persistence is implemented separately so that cryptographic verification cannot silently acquire filesystem, network, identity, or authority effects.

## 13. Durable external replay state

`axiom-external-observation-replay-state.v0` adds a narrow local persistence primitive for replay protection without turning the Beacon-style verifier into a live adapter.

The store binds replay identity to:

```text
digestObject({ sender_id, nonce })
```

The raw nonce is not persisted. The store retains only the replay-key digest, external sender identifier, and expiry instant required to reject reuse during the active window.

The current local durability contract is:

- absolute state path;
- regular non-symlink state file when present;
- private directory/file creation modes where supported by the host (`0700` directory, `0600` state/lock/temp files);
- exclusive same-path writer lock using create-if-absent semantics;
- canonical closed-world JSON state with a recomputed state digest;
- bounded state bytes and bounded active-entry count;
- maximum five-minute replay lifetime, matching the observation-envelope ceiling;
- expiry pruning before capacity evaluation;
- no eviction of still-active replay protection to admit a new claim;
- file-handle `sync()` before same-directory atomic replacement;
- fail-closed behavior for corrupt JSON, non-canonical or widened state, digest mismatch, symlink final paths, active-capacity exhaustion, temporary-file collision, or writer-lock contention.

The store is **restart-safe local replay state**, not an independent tamper-proof ledger. `state_digest` is content integrity/addressing inside the local contract; it is not a signature, MAC, external witness, or rollback anchor. An attacker already able to rewrite the protected state file and recompute its digest is outside the integrity claim of this v0 store. Power-loss durability of filesystem directory metadata is also host/filesystem dependent; v0 proves synced state-file bytes before replacement and restart behavior in the supported test lanes, not a universal storage-device persistence guarantee.

The store grants no authority and introduces no transport. Its fixed boundary remains:

```text
replay_persistence = true
authority_effect = none
network_effect = none
runtime_activation = false
```

It does not enroll an external key, bind one to an AXIOM principal, establish sender trust, authorize policy, invoke Gateway, execute work, or certify Beacon compatibility.

The pure Beacon verifier and the durable replay store are not yet composed into one atomic verify-and-claim API. Therefore the verifier correctly continues to return `replay_persistence = false`; a later orchestration slice must prove ordering, concurrency, restart, and failure semantics before a received external observation can claim both successful verification and durable replay consumption as one operation.

## 14. Next promotion gates

Before this candidate can become an actual agent-interoperability adapter, later work must separately define and verify:

1. an atomic or otherwise fail-closed orchestration contract that composes external-envelope verification with the durable replay store and proves concurrent/restart behavior;
2. explicit external-identity enrollment, rotation, and revocation;
3. optional TOFU only for low-assurance contexts, with stronger verified relationships for consequential actions;
4. transport-specific parsing and conformance fixtures against an upstream protocol version;
5. explicit normalization/subject binding before external evidence can enter Entity Assurance;
6. policy-controlled mapping from external observations into AXIOM invocation requests;
7. a mandatory authority recheck before any effect;
8. receipts connecting the external observation, local policy decision, and any eventual action;
9. adversarial tests for key substitution, replay across restarts, stale observations, parser ambiguity, confused-deputy behavior, oversized inputs, replay-state rollback, and crash/interruption boundaries.

Until those gates exist, the Beacon-style verifier remains a local evidence parser, the replay store remains a local persistence primitive, and neither must be advertised as a live adapter or interoperability implementation.
