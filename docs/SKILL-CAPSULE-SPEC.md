# AXIOM-MESH Skill Capsule System (AM-SCS)

**Status:** Proposed for implementation (integratable package)
**Date:** March 18, 2026
**Owner Pillars:** Hypervisor + Sandbox + Grid + Gateway

---

## 1) Purpose

AM-SCS defines one end-to-end lifecycle for third-party and native skills:

**Ingest → Verify → Rewrite/Rebuild → Normalize → Sign → Distribute → Execute → Throttle → Revoke**.

It unifies:
- performance controls (equivalence caching, proof-carrying intents, phase throttling),
- authenticated and shareable skill distribution,
- external ingestion (Open-CLAW, MCP, API services), and
- mesh-native governance with bounded authority.

---

## 2) Canonical Artifact: Skill Capsule

The mesh executes only a **Skill Capsule** bundle.

```text
skill-capsule/
├─ SKILL_MANIFEST.json
├─ SOURCE_DESCRIPTOR.json
├─ REBUILD_ATTESTATION.json
├─ adapter/
│  ├─ normalize_intent.py
│  ├─ tool_translation.py
│  └─ proof_hooks.py
├─ runtime/
│  └─ bindings/
├─ schemas/
│  ├─ intent.schema.json
│  └─ telemetry.schema.json
├─ sbom/
│  └─ dependencies.json
└─ SIGNATURE.sig
```

### 2.1 Required contracts

- `SKILL_MANIFEST.json` — authority, capability, constraints, runtime budget, token policy.
- `SOURCE_DESCRIPTOR.json` — upstream provenance (digest, source type, endpoint/repo refs).
- `REBUILD_ATTESTATION.json` — declaration of rewrite/rebuild actions performed by the mesh compiler.

JSON Schemas are defined in `schemas/`:
- `skill_capsule_manifest.v1.json`
- `source_descriptor.v1.json`
- `rebuild_attestation.v1.json`

---

## 3) Efficiency Controls (Mandatory)

### 3.1 Intent-level equivalence caching
- Capsules must emit canonicalized intents.
- Verification caches store proof artifacts keyed by:
  - `intent_hash`
  - `axiom_version`
  - `capsule_id`

**Outcome:** repeated intents reuse verification work.

### 3.2 Proof-carrying intents
Each intent from a capsule must include:
- referenced constraints,
- minimal feasibility sketch,
- optional counterfactual trace pointer.

**Outcome:** verification scales with proof payload size, not task complexity.

### 3.3 Phase-aware throttling
Capsules must publish telemetry signals:
- verification variance,
- constraint slack,
- extremal tendency.

Mesh governors can respond automatically:
- lower concurrency,
- increase proof strictness,
- narrow token scope,
- sandbox or revoke capsule.

**Outcome:** controlled autonomy growth without phase-ridge collapse.

---

## 4) External Ingestion (Open-CLAW / MCP / APIs)

### 4.1 Intake (zero-trust)
External skills are never executed directly. Intake accepts:
- immutable Git/registry digest,
- MCP tool/descriptor endpoint,
- service API descriptor.

All intake facts are recorded in `SOURCE_DESCRIPTOR.json`.

### 4.2 Verification and policy gate
Before rewrite/rebuild:
- verify source immutability and signature (if provided),
- validate declared authority against mesh capability classes,
- reject governance or verification authority escalation requests.

If output is non-normalizable, skill is sandbox-only until adapted.

### 4.3 Rewrite or rebuild
- **Rewrite path:** keep core behavior, replace authority and I/O surfaces.
- **Rebuild path:** distill or reimplement opaque/dangerous components.

All transformations are logged in `REBUILD_ATTESTATION.json`.

---

## 5) Authentication, Signing, and Runtime Authority

### 5.1 Mesh re-issuance
After successful compiler pipeline:
- capsule is signed by mesh issuer key,
- mesh becomes accountable publisher,
- upstream origin remains in provenance.

### 5.2 Capability tokens
Install does not imply permission. Runtime requires scoped token including:
- tool scope,
- data scope,
- resource bounds,
- proof strictness,
- expiry and revocation handle.

This enables dynamic discovery without authority creep.

---

## 6) Distribution Modes

### 6.1 Portable capsules
- registry/git/internal artifact store,
- pre-audited and stable,
- longer token TTL.

### 6.2 Dynamic capsules
- discovery/marketplace/MCP handshake,
- narrow scope, short TTL,
- sandbox-first promotion gate based on telemetry and proof quality.

Both modes use the same capsule schema and enforcement logic.

---

## 7) Personality Model

Personality is strategy metadata inside capsule (style, heuristic preference, intent shaping).

Kernel invariants:
- identity != capability,
- capability != authority.

This separation enables safe sharing and revocation.

---

## 8) AXIOM-MESH Integration Mapping

### Hypervisor
- Adds compiler pipeline service:
  - `/capsules/intake`
  - `/capsules/compile`
  - `/capsules/verify`
- Emits proof-carrying canonical intents.

### Sandbox
- Executes capsule runtime bindings under existing container hardening.
- Enforces token resource budgets and strictness controls.

### Grid
- Anchors capsule metadata/signatures and revocation events.
- Maintains capsule state (active, throttled, revoked).

### Gateway
- Exposes capsule install/discovery endpoints for operators.
- Applies policy-aware routing for capsule-backed intent paths.

---

## 9) Minimal Implementation Sequence

1. Add schema validation for 3 capsule contracts.
2. Add intake endpoint and source descriptor persistence.
3. Add compiler mode: rewrite-only MVP.
4. Add signature + token issuance.
5. Add grid revocation anchoring and runtime enforcement.
6. Add dynamic ingestion adapters (MCP/Open-CLAW descriptors).

---

## 10) Acceptance Criteria (Definition of Done)

- Capsule with valid contracts can be ingested and compiled into mesh-safe form.
- Capsule cannot execute without scoped token.
- Revocation event blocks execution within one policy sync interval.
- Equivalent intents reuse cached verification artifacts.
- Throttling decisions are automatic when variance/slack thresholds breach limits.
- Upstream provenance remains auditable after mesh re-issuance.
