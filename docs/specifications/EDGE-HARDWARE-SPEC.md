# Edge Hardware Specification

This document defines the hardware requirements for an AXIOM-MESH **Edge Device** (`edge` profile), designed to be highly accessible, low-power, and capable of interfacing with a private local mesh (e.g., coordinated by a Frontier Node) or the greater global mesh.

The goal is to provide a specification for a decentralized, resilient network footprint that can run smaller models locally, handle edge inference tasks, and participate in partial mesh routing without relying on a constant internet connection.

## 1. System Role & Profile
*   **AXIOM-MESH Profile:** `edge`
*   **Primary Function:** Local inference (1B - 8B parameter models), partial mesh routing (via Grid P2P), basic zkML verifications, and functioning as a reliable intermediate node or sensor hub.
*   **Network Posture:** Edge/IoT deployment. It interfaces securely with the private mesh (via Zero-Trust or direct wireguard VPN) and can synchronize state upward when internet/greater mesh connectivity is available.

## 2. Hardware Specifications

### Compute (CPU)
*   **Minimum:** Quad-core ARM Cortex-A76 or equivalent (e.g., Raspberry Pi 5, Orange Pi 5).
*   **Recommended:** 6-Core to 8-Core ARM (e.g., NVIDIA Jetson Orin Nano, Rockchip RK3588).
*   **Requirement:** Sufficient processing power to run lightweight Docker containers (Gateway, Sandbox WASM execution) and basic Go-based Grid routing.

### Memory (RAM & VRAM)
To support 8B parameter models (e.g., Llama-3-8B) natively with quantization (e.g., 4-bit/8-bit GGUF).
*   **Minimum RAM:** 8GB LPDDR4X (e.g., Raspberry Pi 5 8GB).
*   **Recommended RAM:** 16GB+ LPDDR5 (e.g., Orange Pi 5 16GB) to allow for smooth multi-container operation and model caching without excessive swapping.
*   **Acceleration:** An NPU (Neural Processing Unit) with 6 TOPS or more is highly recommended for efficient inference (e.g., RK3588 NPU), or a dedicated CUDA-capable Edge GPU (e.g., Jetson Nano) for specialized tasks.

### Storage
*   **Primary OS/Mesh State:** 256GB NVMe SSD (Minimum). MicroSD cards are **not** supported for production deployment due to high IOPS requirements of the Grid ledger and local SQLite state databases.
*   **Requirement:** An M.2 NVMe HAT (Hardware Attached on Top) or native M.2 slot is required for the SBC (Single Board Computer).

### Networking
*   **Wired (Primary):** 1GbE (1 Gigabit Ethernet) for stable connection to the local Frontier Node or network switch.
*   **Wireless (Secondary):** Wi-Fi 6 (802.11ax) or Wi-Fi 5 (802.11ac) for flexible deployment in environments where ethernet drops are unavailable.
*   **Mesh Integration:** Supports Zero-Trust overlay networks (e.g., Tailscale/Wireguard) to securely connect back to the central Frontier Node, even across varied NAT environments.

## 3. Cost & Accessibility Targets
The Edge Device is designed for mass deployment, sensor integration, and personal/individual use.
*   **Target Price Point:** $150 - $400 USD (including SBC, NVMe drive, power supply, and cooling).
*   **Form Factor:** Compact SBC (Single Board Computer) footprint, passive or low-profile active cooling, easily mountable (DIN rail or VESA).

## 4. Software & Orchestration Readiness
*   **OS:** Ubuntu Server 24.04 ARM64 or Debian Bookworm ARM64.
*   **Containerization:** Full Docker support. Edge nodes run a stripped-down `docker-compose.yml` focusing only on the `gateway` and `grid` components.
*   **Hypervisor Fallback:** The Python Hypervisor is generally scaled back or run in a lightweight mode (disabling heavy orchestrations like `CoTAuditor` or `QuarantineSandboxManager`) relying instead on the central Frontier Node for complex processing.
*   **Direct Interaction:** Human users can interact with the edge device via the local Gateway UI (e.g., `http://<edge-ip>:3000`) or via direct Open-CLAW/MCP queries if connected to their primary agent.
