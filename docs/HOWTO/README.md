# AXIOM-MESH How-To Guides

**Status Date:** 2026-03-27  
**Purpose:** Central index for all operational procedures, runbooks, and step-by-step guides.

Welcome to the AXIOM-MESH practical documentation. These guides cover installation, configuration, operation, and advanced deployment scenarios.

## 🚀 New User Quick Start

| Guide | Description | Difficulty |
|-------|-------------|------------|
| **[Installation Guide](../INSTALLATION-GUIDE.md)** | Complete step-by-step setup for all platforms (Windows, macOS, Linux, Termux) | ⭐ Beginner |
| **[Create Bootable Live USB](create-bootable-usb.md)** | Build a self-contained, bootable AXIOM-MESH OS on a USB stick | ⭐⭐ Intermediate |
| **[Add Nodes via QR Code](add-nodes-via-qr.md)** | Quick and secure node onboarding with QR codes and wallet signatures | ⭐ Beginner |
| **[First Steps](first-steps.md)** | What to do after installation: Dashboard, CLI, and first contract | ⭐ Beginner |
| **[Custom Node GUIs](custom-guis.md)** | Using node-specific interfaces (Education, Validator, Storage, Compute) | ⭐ Beginner |

## 🖥️ Installation & Deployment

### Standard Installation
- **[Comprehensive Installation Guide](../INSTALLATION-GUIDE.md)** — Step-by-step installation with auto-detected platform support (Windows/macOS/Linux/Android-Termux)
- **[Live USB/ISO Builder](../../live-installer/README.md)** — Create bootable AXIOM-MESH USB drives that auto-install on first boot
- **[Create Bootable USB Guide](create-bootable-usb.md)** — Detailed instructions for building custom Live USB/ISO

### Platform-Specific Installers

#### Windows
- **Entry Point:** `install.bat`
- **Auto-Installs:** Chocolatey → Docker Desktop → Make → Node.js v20 LTS → Python dependencies

#### macOS
- **Entry Point:** `install.sh`
- **Auto-Installs:** Homebrew → Docker Desktop → Make → Node.js v20 LTS → Python dependencies

#### Linux (Ubuntu/Debian)
- **Entry Point:** `install.sh`
- **Auto-Installs:** Docker Engine → Make → Node.js v20 LTS → Python dependencies
- **Package Manager:** Uses apt-get with automatic repository setup

#### Linux (Fedora/RHEL)
- **Entry Point:** `install.sh`
- **Auto-Installs:** Docker → Make → Node.js via dnf/yum

#### Android/Termux
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

## 🎨 Custom GUI Skins by Node Type

Access node-specific interfaces tailored to your role:

| Node Type | Port | Guide | Features |
|-----------|------|-------|----------|
| **Education** | 8081 | [`custom-guis.md`](custom-guis.md) | Learning progress, student metrics, curriculum tracking |
| **Validator** | 8082 | [`custom-guis.md`](custom-guis.md) | Validation stats, consensus participation, rewards |
| **Storage** | 8083 | [`custom-guis.md`](custom-guis.md) | Storage utilization, file pinning, retrieval metrics |
| **Compute** | 8084 | [`custom-guis.md`](custom-guis.md) | GPU/CPU usage, inference jobs, zkML proofs |

Auto-launched on boot based on detected node type. Access via `http://localhost:808X`.

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

## Coverage Policy

If a feature requires operator action, it must have a HOWTO in this directory. All HOWTOs should be:
- Copy/paste runnable unless otherwise stated
- Updated when features change
- Linked from this index
- Tested against fresh installations

## Quick Start Commands

```bash
# Windows
.\install.bat

# macOS/Linux
./install.sh

# After installation
make up          # Start the mesh
make cli         # Access CLI dashboard
make health      # Run health checks
make gui         # Launch node-specific GUI
```
