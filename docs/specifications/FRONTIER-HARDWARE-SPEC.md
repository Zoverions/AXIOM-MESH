# Frontier Hardware Specification

This document defines the hardware requirements for an AXIOM-MESH **Frontier Node** (`full_node` profile), designed to run large open-source Frontier models (e.g., Llama-3-70B, Mixtral) with full agentic capabilities, tool use, and offline mesh coordination.

The goal is to provide a highly capable, yet price-accessible central node that can act as the primary coordinator for a private, air-gapped, or localized mesh network.

## 1. System Role & Profile
*   **AXIOM-MESH Profile:** `full_node`
*   **Primary Function:** Central coordination, heavy inference (70B+ parameters), full ledger archiving, zkML proof generation, and acting as the primary MCP Server for a local subnet.
*   **Network Posture:** Designed for both online and fully offline (air-gapped) operation.

## 2. Hardware Specifications

### Compute (CPU)
*   **Minimum:** 16 Cores / 32 Threads (e.g., AMD Ryzen 9 7950X, Intel Core i9-14900K, or Apple M2/M3 Ultra).
*   **Recommended:** Dual-socket EPYC or Xeon for enterprise-grade continuous concurrent execution, or Apple Silicon M-series Ultra/Max for highly efficient unified memory bandwidth.
*   **Requirement:** High single-core performance for Python Hypervisor orchestrator logic, and strong multi-core performance for parallel Sandbox execution and Grid consensus.

### Memory (RAM & VRAM)
To support 70B+ parameter models natively with sufficient context windows for complex agent reasoning (e.g., 8k-32k tokens), massive memory bandwidth is critical.
*   **Architecture A (Discrete GPUs):**
    *   **System RAM:** 128GB DDR5 ECC (Minimum).
    *   **VRAM:** 48GB+ Total VRAM (e.g., 2x NVIDIA RTX 3090/4090 24GB, or 1x RTX 6000 Ada 48GB).
    *   *Note: Multi-GPU setups require NVLink or high PCIe bandwidth for efficient tensor parallelism.*
*   **Architecture B (Unified Memory - e.g., Apple Silicon):**
    *   **Unified Memory:** 128GB+ (192GB recommended) with >800 GB/s bandwidth (e.g., Apple M2/M3 Ultra).
    *   *Note: This is often the most cost-effective and power-efficient route for running 70B+ models locally.*

### Storage
*   **Primary OS/Mesh State:** 2TB NVMe Gen4 SSD (Minimum 7,000 MB/s read/write) for lightning-fast Vector DB (Milvus/Qdrant) queries and Grid CRDT state sync.
*   **Model Weights/Archive:** 4TB+ NVMe Gen4 SSD (dedicated to model weights and Deep Archive memory logs).
*   **Redundancy:** RAID 1 or ZFS mirroring is highly recommended for data integrity in production corporate environments.

### Networking
*   **Internal Mesh (LAN):** 10GbE (10 Gigabit Ethernet) minimum for rapid synchronization of state channels, WASM binaries, and Docker images across the local mesh.
*   **External/Bridge:** 1GbE minimum (if connected to the wider internet/Pulsechain).
*   **Offline Mode:** The node must include an internal DHCP/DNS server configuration to act as the root router for an air-gapped mesh.

## 3. Cost & Accessibility Targets
The Frontier Node is designed to bridge the gap between consumer hardware and enterprise server racks.
*   **Target Price Point:** $4,000 - $8,000 USD.
*   **Form Factor:** High-end desktop tower (ATX/E-ATX) or Mac Studio form factor, ensuring it can operate in a standard office or home environment without specialized HVAC cooling or 220V server power drops.

## 4. Software & Orchestration Readiness
*   **OS:** Ubuntu 24.04 LTS (for Discrete GPU setups) or macOS (for Unified Memory setups).
*   **Drivers:** NVIDIA CUDA 12.x+ (if applicable), or Apple Metal Performance Shaders (MPS).
*   **AXIOM-MESH Integration:** The hardware must be capable of running the entire `docker-compose.yml` stack natively, or utilizing the `sandbox/k8s/` manifests for single-node Kubernetes (e.g., K3s) deployment.
*   **MCP Support:** The node will host the primary `mcp_server.py` on port 8081, acting as the interface point for external models (Claude, Gemini) or direct notebook integrations (e.g., Jupyter) used by human operators.
