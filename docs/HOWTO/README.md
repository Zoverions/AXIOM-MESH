# HOWTO Runbook Index

**Status Date:** 2026-03-27  
**Purpose:** Central index for all operational procedures, runbooks, and step-by-step guides.

## 🚀 New Users Start Here

### Installation & Setup
- **📖 Comprehensive Installation Guide:** [`../INSTALLATION-GUIDE.md`](../INSTALLATION-GUIDE.md) — Step-by-step installation with auto-detected platform support (Windows/macOS/Linux/Android-Termux)
- **💿 Live USB/ISO Builder:** [`../../live-installer/README.md`](../../live-installer/README.md) — Create bootable AXIOM-MESH USB drives that auto-install on first boot

### Quick Start Commands
```bash
# Windows
.\install.bat

# macOS/Linux
./install.sh

# After installation
make up          # Start the mesh
make cli         # Access CLI dashboard
make health      # Run health checks
```

## Core Operational Procedures

### Getting Started
- [`index.md`](index.md) — Quick reference for all HOWTOs
- [`run-local-stack.md`](run-local-stack.md) — Local stack bring-up and health checks
- [`contracts-local.md`](contracts-local.md) — Local contract compile/test/deploy loop
- [`swarm-join.md`](swarm-join.md) — Join the mesh swarm
- [`zkml-infer.md`](zkml-infer.md) — Run zkML inference

### Node Management
- [`submit-intent.md`](submit-intent.md) — Intent submission and tracing
- [`meshstore-claim.md`](meshstore-claim.md) — Storage claims and retrieval
- [`founder-claim.md`](founder-claim.md) — Founder vesting claims
- [`nemoclaw-policy.md`](nemoclaw-policy.md) — Policy update flow

### Security & Recovery
- [`recovery-2fa.md`](recovery-2fa.md) — 2FA recovery procedures
- [`secret-management.md`](secret-management.md) — Secrets rotation and management
- [`release-gate-evidence.md`](release-gate-evidence.md) — Release-gate evidence assembly and validation

### Advanced Operations
- [`bridge-emergency-runbooks.md`](bridge-emergency-runbooks.md) — Emergency bridge procedures
- [`transformer-foundation-pulsechain.md`](transformer-foundation-pulsechain.md) — PulseChain transformer operations

## 🎨 Custom GUI Skins by Node Type

Each node type has a dedicated GUI skin that auto-launches on boot at `http://localhost:8080`:

| Node Type | GUI Features | Dashboard Focus |
|-----------|-------------|-----------------|
| **Education Node** | Interactive learning dashboard, student progress tracking, NFT badge display | Regional curriculum alignment, gamification metrics |
| **Validator Node** | Real-time validation metrics, slashing protection alerts, consensus participation | Validator performance, uptime statistics |
| **Storage Node** | Capacity monitoring, retrieval performance analytics, pinning status | Storage utilization, IPFS/MeshStore stats |
| **Compute Node** | GPU utilization graphs, proof generation status, workload queue | zkML proving progress, hardware metrics |

The custom GUI is automatically detected and served based on your node's configured role during installation.

## 🖥️ Platform-Specific Installation

### Windows
- **Entry Point:** `install.bat`
- **Auto-Installs:** Chocolatey → Docker Desktop → Make → Node.js v20 LTS → Python dependencies
- **Note:** Requires restart after Docker Desktop installation

### macOS
- **Entry Point:** `install.sh`
- **Auto-Installs:** Homebrew → Docker Desktop → Make → Node.js v20 LTS → Python dependencies

### Linux (Ubuntu/Debian)
- **Entry Point:** `install.sh`
- **Auto-Installs:** Docker Engine → Make → Node.js v20 LTS → Python dependencies
- **Package Manager:** Uses apt-get with automatic repository setup

### Linux (Fedora/RHEL)
- **Entry Point:** `install.sh`
- **Auto-Installs:** Docker → Make → Node.js via dnf/yum

### Android/Termux
- **Entry Point:** `install.sh`
- **Mode:** Minimal-edge mode
- **Auto-Installs:** pkg packages (make, nodejs, docker)

## 💿 Live USB/ISO Mode

Boot from the AXIOM-MESH Live USB to experience:

1. **Full Ubuntu 24.04 Desktop** environment with pre-configured AXIOM-MESH
2. **Auto-Detection** of existing installations on internal drives
3. **Smart Boot Logic:**
   - If installation found → Boots normally with dashboard link
   - If no installation → Runs fully automated installer with sensible defaults
4. **Zero Configuration** using education-node / local-mesh / cost priority / 50GB defaults

### Build Your Own Live USB
```bash
cd live-installer
./build-axiom-live.sh
```

Requirements:
- Ubuntu/Debian machine (or WSL2 with Ubuntu)
- 16+ GB USB stick
- ~5GB free space for ISO download

See full instructions: [`live-installer/README.md`](../../live-installer/README.md)

## Coverage Policy

If a feature requires operator action, it must have a HOWTO in this directory. All HOWTOs should be:
- Copy/paste runnable unless otherwise stated
- Updated when features change
- Linked from this index
- Tested against fresh installations
