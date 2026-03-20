# AXIOM-MESH Hardware Profile Matrix

This document defines the hardware profiles supported by the AXIOM-MESH system. These profiles dictate resource allocation, task routing (via the `ResourceBalancer`), and security capabilities across the network.

## Profiles

### 1. `full_node`
- **Minimum Requirements**: 16GB+ RAM, 8000MB+ VRAM.
- **Capabilities**: Can run full local zkML proofs, host large local models (e.g., `llama3:8b`, `qwen2.5-coder:7b`, `mistral:7b`), and participate fully in the Grid ledger consensus.
- **Network Role**: Primary compute provider, relayer, and full archiver. Ideal for handling heavy network tasks and deep archival queries.

### 2. `edge`
- **Minimum Requirements**: 8GB+ RAM, <8000MB VRAM.
- **Capabilities**: Can run smaller localized models, participate in partial mesh routing, and perform lighter zkML verifications.
- **Network Role**: Edge node, local inference, and partial participant in consensus. Functions as a reliable intermediate node.

### 3. `tablet` (or legacy/constrained devices)
- **Minimum Requirements**: <8GB RAM.
- **Capabilities**: Highly constrained. Uses minimal local models (e.g., `llama3:1b`) and relies heavily on the Grid and L1 network for heavier operations via `ResourceBalancer`.
- **Network Role**: Thin client, offline-first sync participant, reliant on P2P and L1 for complex cryptographic and AI tasks.

## Enforcement
The `HardwareScanner` (`hypervisor/src/evolution/hardware.py`) automatically determines the local node's profile on startup. The `ResourceBalancer` routes traffic to local, P2P, Grid, or L1 based on this hardware footprint.
