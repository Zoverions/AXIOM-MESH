# Next Steps for AXIOM-MESH Iteration

The following tasks remain to be completed in the next iteration. **Please provide your additional guidance document below so we can integrate it into these next steps.**

## 1. NCP Payload Structure Alignment
* Currently, `ncp_client.py` uses the full `IntentObject` structure to satisfy the rigorous validation against `intent.schema.json`.
* However, previous specifications suggested using a simple `{"query": intent_content}` payload.
* **TODO:** Clarify whether the NCP servers are meant to receive the full Intent Object or a simplified query. If simplified, we must create a separate schema (e.g., `ncp_query.schema.json`) or adjust the validation layer.

## 2. Implement Native Decentralized Storage (MeshStore) & Storage Contribution (Priority 1)
Based on the FULL AMALGAMATED ARCHITECTURE SPECIFICATION (Version: 15.4.6):
* **ComputeBond.sol:** Add the `StorageOffered` event and `offerStorage(uint256 capacityGB, bytes32 cidRoot)` method to compute bond logic to assign PoER bonus for capacity. Update Go Client bindings in `compute_bond.go` to match.
* **docker-compose.yml:** Mount `./meshstore` volume to IPFS data dir (`/data/ipfs`) and configure `IPFS_STORAGE_MAX` mapped to the `MESHSTORE_QUOTA_GB` env variable.
* **axiom_cli.py / install.sh:** Add the prompt "How much local storage for the mesh?" to generate the `MESHSTORE_QUOTA_GB` env variable and include `storageOffer` + basic recovery fields in the hardware profile.
* **Hypervisor / CRDT:** Run background **MeshStore Agent** to dynamically pin/unpin CIDs. Update `crdt_sync.py` to stream memory and storage metadata from parent during Swarm Join.
* **NCP Ingestion updates:** Store final artifacts and Dialectic reductions as IPFS CIDs in MeshStore.
* **Self-Sustaining Mode (Grid):** Implement swarm size tracking in `grid/blockchain/chain.go` to disable external chain bridging and flip storage exclusively to P2P IPFS if nodes exceed threshold (e.g. 100).

## 3. Multi-Factor Authentication & Mesh Recovery Layer (Phase 2)
* **Gateway:** Generate TOTP (otplib) + Passkey (WebAuthn).
* **DualLedgerIdentity.sol:** Add `RecoveryRegistered` event and `registerRecovery(bytes32 nodeId, bytes32 totpCommitment, bytes32 passkeyCommitment)` method to anchor recovery seeds.
* **Recovery Flow:** Add 2FA challenge via CLI/Gateway to pull the encrypted seed/recovery bundle from MeshStore CIDs, bypassing external chains.

## 4. End-to-End Swarm Testing
* Once the NCP payload structure is locked in and MeshStore is implemented, execute a complete E2E test verifying: hardware profile generation -> local stake -> delegation & storage offer -> CRDT memory and storage metadata sync -> dialectic-validated NCP query pinned to IPFS.
