# Offline-first Sync and Degraded-Mode Playbook

## Overview
AXIOM-MESH is explicitly designed to operate safely in hostile, disconnected, or partitioned network environments. This playbook outlines procedures and expected behaviors when nodes lose connectivity to the broader Grid or L1 networks.

## Offline-First CRDT Sync
- **Mechanism**: The `CRDTState` in `hypervisor/src/memory/crdt_sync.py` uses a Last-Write-Wins Map with zk-private delta sync logic for Spectrum Devices.
- **Behavior During Disconnection**: Local memory updates and intents are securely signed (ECDSA) and stored locally.
- **Behavior Upon Reconnection**: The node broadcasts its accumulated delta syncs to peers. The CRDT automatically resolves conflicts based on the Last-Write-Wins policy and cryptographic timestamps without requiring human intervention.

## Degraded-Mode Playbook
1. **Loss of L1/External Oracles**:
   - System falls back to the most recent cached state.
   - High-value transactions (e.g., stakes, slashes) queue locally until L1 connectivity is restored.
   - AI intent responses are returned with lower provenance/confidence metrics indicating external context was unavailable.
2. **Loss of P2P Grid**:
   - `ResourceBalancer` shifts all execution to `local` processing based on the node's Hardware Profile.
   - If local hardware is insufficient (`tablet` profile), the system degrades gracefully, rejecting heavy intents with explicit feedback rather than timing out.
3. **Recovery Procedures**:
   - Monitor `GET /health` and `/api/v1/metrics/system` for connectivity restoration.
   - Run the reconciliation service (WS-B) to align the local ledger state with canonical chain state once reconnected.
