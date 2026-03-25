# SSI Technical Implementation in AXIOM-MESH

Date: 2026-03-25

## Objective

Define an implementation-ready, fail-closed Self-Sovereign Identity (SSI) stack for citizen-controlled digital identity, selective disclosure, and AI-agent mediated service access across AXIOM-MESH pillars.

## Current Building Blocks Already in Repo

- PulseChain-aware contract lane and deployment automation exist (`deploy-pulse.js`, pulse testnet HOWTO).【F:grid/contracts/scripts/deploy-pulse.js†L1-L46】【F:docs/HOWTO/transformer-foundation-pulsechain.md†L1-L63】
- ProveX wrapper and Stigmergic channel provide governance/compliance adjacent control points for verified execution + settlement.【F:grid/contracts/contracts/ProveXVerifierWrapper.sol†L15-L77】【F:grid/contracts/contracts/StigmergicStateChannel.sol†L35-L162】
- Hypervisor already has policy, privacy router, and vault-oriented memory modules to host consent checks and encrypted material routing.【F:hypervisor/src/core/policy_engine.py†L1-L147】【F:hypervisor/src/engine/privacy_router.py†L1-L51】【F:hypervisor/src/memory/PrivateVault.py†L1-L165】
- zkML proof verification lanes are operational in Grid and exposed through API worker queues/caches, which can be reused for selective-disclosure verification artifacts.【F:grid/consensus/zkml.go†L24-L174】【F:grid/api/server.go†L181-L300】

## Proposed SSI Architecture (Implementation Model)

### 1) Identity Anchoring
- Add `SSIRegistry` contract on PulseChain testnet first (`chainId=943`).
- Registry stores DID document hash pointers and key-rotation epochs (not raw PII).
- All reads/writes emit immutable events for BLK-A.4 alignment.

### 2) Credential and Consent Layer
- Verifiable Credentials (VCs) are signed off-chain by approved issuers (federal/provincial/municipal guilds).
- On-chain layer stores revocation/status references + consent receipts.
- Consent receipt format: `(subject DID, requester DID, purpose code, scope hash, expiry, nonce)`.

### 3) Data Plane (Citizen-Controlled Vault)
- Encrypted records remain in user-controlled vault storage; chain stores content-addressed commitments only.
- Hypervisor `PrivateVault` mediates encrypted retrieval/decryption operations under policy gates.
- `privacy_router` routes by policy level and proof requirements (strict fail-closed path for high sensitivity).

### 4) Verification Plane
- Reuse zkML/zk verification queues for proof receipt and bounded payload enforcement.
- For health workflows, requesters receive selective-attribute attestations (e.g., eligibility boolean) instead of full records.

## Integration Points by Pillar

- **Grid**: new SSI registry endpoints + verifier-backed consent checks.
- **Hypervisor**: consent policy evaluation, vault retrieval orchestration, and emergency deny on policy mismatch.
- **Gateway**: wallet-based auth + purpose-scoped request templates.
- **Sandbox**: user-owned digital entity executes least-privilege query plans.

## M10.2 Suggested Implementation Tasks

1. Create `grid/contracts/contracts/SSIRegistry.sol` with:
   - DID hash registration/update/revocation.
   - Key rotation with cooldown.
   - Consent receipt anchoring + event logs.
2. Add Grid API routes:
   - `POST /ssi/register`
   - `POST /ssi/consent`
   - `POST /ssi/verify-disclosure`
3. Add Hypervisor policy hooks:
   - explicit consent TTL checks,
   - purpose limitation checks,
   - emergency revoke propagation.
4. Add integration tests:
   - revoked consent => hard fail,
   - expired consent => hard fail,
   - overbroad scope request => hard fail.

## Threat Model Notes

- Treat all issuer claims as revocable and time-bounded.
- Require nonce-based anti-replay for every consent receipt.
- Enforce cryptographic separation between identity keys and data-encryption keys.
- Never permit plaintext PII persistence in chain events or logs.

## Deliverables for Audit Readiness

- SSI key-management SOP.
- Consent event schema and retention mapping.
- Pen-test scenarios (stolen wallet, replayed VC, malicious government requester).
- End-to-end evidence bundle mirroring existing transformer deployment HOWTO structure.
