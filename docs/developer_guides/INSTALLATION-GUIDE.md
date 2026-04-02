# AXIOM-MESH Installation Guide for New Users

Welcome to AXIOM-MESH! This guide provides step-by-step instructions to get you up and running with the AXIOM-MESH platform.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start (Automated Installation)](#quick-start-automated-installation)
4. [Manual Installation](#manual-installation)
5. [Configuration Options](#configuration-options)
6. [Starting the Platform](#starting-the-platform)
7. [Verification & Health Checks](#verification--health-checks)
8. [First Steps After Installation](#first-steps-after-installation)
9. [Troubleshooting](#troubleshooting)
10. [Next Steps](#next-steps)

---

## Overview

AXIOM-MESH is a multi-service agent runtime with four core pillars:

- **Gateway** (TypeScript/Node): Ingress APIs, channels, dashboard delivery
- **Hypervisor** (Python/FastAPI): Orchestration, context engine, policy and routing logic
- **Sandbox** (TypeScript/Node + Docker): Isolated code execution
- **Grid** (Go): Ledger, verification, governance-aligned coordination

### System Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌─────────────┐
│   Gateway   │────▶│  Hypervisor  │────▶│   Sandbox   │────▶│    Grid     │
│  Port 8080  │     │  Port 8000   │     │  Port 4000  │     │  Port 5000  │
└─────────────┘     └──────────────┘     └─────────────┘     └─────────────┘
       │                    │                    │                    │
       └────────────────────┴────────────────────┴────────────────────┘
                              zero-trust-grid network
```

---

## Prerequisites

### Required Software

Before installing AXIOM-MESH, ensure you have the following installed:

| Software | Version | Purpose | Install Command |
|----------|---------|---------|-----------------|
| **Docker** | 20.10+ | Container runtime | See [Docker Docs](https://docs.docker.com/get-docker/) |
| **Docker Compose** | 2.0+ | Multi-container orchestration | Included with Docker Desktop |
| **Make** | 3.81+ | Build automation | Linux: `sudo apt-get install make`<br>macOS: `brew install make`<br>Windows: `choco install make` |
| **Python 3** | 3.8+ | Hypervisor runtime | Linux: `sudo apt-get install python3`<br>macOS: `brew install python` |
| **Node.js** | 18+ | Gateway/Sandbox runtime | See [Node.js Docs](https://nodejs.org/) |
| **Git** | 2.0+ | Version control | Linux: `sudo apt-get install git`<br>macOS: `brew install git` |

### Hardware Requirements

| Component | Minimum | Recommended | Notes |
|-----------|---------|-------------|-------|
| **CPU** | 2 cores | 4+ cores | More cores improve local model performance |
| **RAM** | 4 GB | 8+ GB | Local LLM models require additional memory |
| **Storage** | 20 GB | 50+ GB SSD | For MeshStore and container images |
| **Network** | Broadband | Low-latency | For P2P and grid communication |

### Port Availability

Ensure the following ports are available on your system:

- **3000** - Grafana Dashboard
- **4000** - Sandbox Service
- **5000** - Grid Service  
- **8000** - Hypervisor API
- **8080** - Gateway API
- **8545** - Blockchain RPC Proxy
- **9090** - Prometheus Metrics
- **16686** - Jaeger Tracing UI

---

## Quick Start (Automated Installation)

The easiest way to install AXIOM-MESH is using the automated installer.

### Step 1: Clone the Repository

```bash
git clone https://github.com/your-org/axiom-mesh.git
cd axiom-mesh
```

### Step 2: Run the Installer

#### Interactive Mode (Recommended for First-Time Users)

```bash
./install.sh
```

The installer will:
1. Check and install prerequisites (Python 3, Docker, Make)
2. Prompt you for configuration choices
3. Generate a machine profile based on your hardware
4. Set up environment variables
5. Start the platform

#### Non-Interactive Mode (For Automated Deployments)

```bash
AUTO_INSTALL=1 \
MACHINE_ROLE=shared-machine \
MESHSTORE_QUOTA_GB=50 \
./install.sh
```

### Step 3: Answer Configuration Prompts

During interactive installation, you'll be asked:

1. **Machine Role** (15-second timeout, defaults to `shared-machine`):
   - `dedicated-mesh` - Full participation, more local execution
   - `shared-machine` - Balanced resource usage (recommended)
   - `minimal-edge` - Lightweight, minimal resource usage
   - `education-node` - Learning mode with expanded permissions

2. **Launch Mode** (15-second timeout, defaults to `local-mesh`):
   - `local-mesh` - Local development/testing (recommended for beginners)
   - `single-node` - Standalone node operation
   - `launch-testnet` - Connect to testnet (requires funding)
   - `launch-network` - Mainnet deployment (requires significant funding)

3. **Primary Priority** (15-second timeout, defaults to `security`):
   - `performance` - Optimize for speed
   - `security` - Optimize for security (recommended)
   - `cost` - Optimize for resource efficiency
   - `autonomy` - Optimize for independence

4. **Storage Quota** (15-second timeout, defaults to `50` GB):
   - Amount of disk space to allocate for MeshStore

5. **Network Funding** (if launching testnet/network):
   - RPC URL for funding checks
   - Wallet address for funding checks

### Step 4: Wait for Installation to Complete

The installer will:
- Generate your machine profile (`config/machine_profile.json`)
- Run network launch preflight checks
- Create default sandbox policies
- Write configuration to `.env`
- Build and start Docker containers
- Launch the orchestrator

**Expected output:**
```
Installation complete!
Dashboard: http://localhost:3000
CLI: make cli
```

---

## Manual Installation

If you prefer manual control over the installation process:

### Step 1: Install Prerequisites

#### Linux (Ubuntu/Debian)

```bash
# Update package list
sudo apt-get update

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Make and Python
sudo apt-get install -y make python3 git

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### macOS

```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Docker Desktop
brew install --cask docker

# Install Make and Python
brew install make python git

# Install Node.js
brew install node
```

#### Windows

```powershell
# Install Chocolatey (if not already installed)
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install Docker Desktop
choco install docker-desktop -y

# Install Make
choco install make -y

# Install Python
choco install python -y

# Install Node.js
choco install nodejs-lts -y
```

### Step 2: Verify Prerequisites

```bash
docker --version
docker-compose --version
make --version
python3 --version
node --version
npm --version
git --version
```

### Step 3: Clone Repository

```bash
git clone https://github.com/your-org/axiom-mesh.git
cd axiom-mesh
```

### Step 4: Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your preferred editor and set:

```bash
# Machine Configuration
MACHINE_ROLE=shared-machine
MACHINE_PROFILE_PATH=config/machine_profile.json
MESHSTORE_QUOTA_GB=50
LAUNCH_MODE=local-mesh
USER_PRIORITY=security

# API Keys (optional for local development)
LLM_PROVIDER=openai
OPENAI_API_KEY=
DISCORD_TOKEN=
WHATSAPP_SESSION=

# Network Configuration
NCP_SERVERS=http://localhost:8080
MCP_SERVERS=

# Founder Address (do not change)
FDBA_FOUNDER_ADDRESS=0x1c2cbabf75e1938ed2f2c59e734e83aa5fbe1b73

# Local Model Fallback
LOCAL_MODEL_FALLBACK=llama3:8b
```

### Step 5: Generate Machine Profile

```bash
python3 scripts/generate_machine_profile.py \
  --machine-role shared-machine \
  --output config/machine_profile.json
```

### Step 6: Setup Sandbox Policies

```bash
mkdir -p sandbox/policies
cat > sandbox/policies/default.yaml << EOF
sandbox:
  filesystem: ["/meshstore/**"]
  network: ["ncp-servers"]
  privacy:
    level: local-only
EOF
```

### Step 7: Build and Start Services

```bash
make up
```

This command builds and starts all Docker containers defined in `docker-compose.yml`.

---

## Configuration Options

### Machine Roles

| Role | Description | Best For |
|------|-------------|----------|
| `dedicated-mesh` | Full network participation, prioritizes local execution | Production nodes, high-performance setups |
| `shared-machine` | Balanced resource allocation (default) | Most users, development machines |
| `minimal-edge` | Minimal resource usage, offloads work to network | Low-spec devices, mobile, Termux |
| `education-node` | Expanded permissions for learning | Students, researchers, testing |

### Launch Modes

| Mode | Description | Funding Required | Use Case |
|------|-------------|------------------|----------|
| `local-mesh` | Fully local, no blockchain interaction | None | Development, testing, learning |
| `single-node` | Standalone node with limited P2P | Minimal | Independent operation |
| `launch-testnet` | Connect to testnet | ~0.1 ETH | Pre-production testing |
| `launch-network` | Full mainnet deployment | Varies by network | Production use |

### User Priorities

| Priority | Effect | Trade-offs |
|----------|--------|------------|
| `performance` | Maximizes speed and throughput | Higher resource usage |
| `security` | Enforces strict security policies (default) | May limit some operations |
| `cost` | Optimizes for resource efficiency | May reduce performance |
| `autonomy` | Maximizes local control and independence | Less network integration |

---

## Starting the Platform

### Using Make Commands

```bash
# Start all services
make up

# Stop all services
make down

# Restart services
make down && make up

# View logs
docker compose logs -f

# View specific service logs
docker compose logs -f gateway
docker compose logs -f hypervisor
docker compose logs -f sandbox
docker compose logs -f grid
```

### Using Docker Compose Directly

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# Rebuild and start
docker compose up -d --build

# View running containers
docker compose ps
```

### Accessing Services

Once started, access the services at:

| Service | URL | Purpose |
|---------|-----|---------|
| **Grafana Dashboard** | http://localhost:3000 | Monitoring and metrics |
| **Gateway API** | http://localhost:8080 | Main API endpoint |
| **Hypervisor API** | http://localhost:8000 | Orchestration API |
| **Prometheus** | http://localhost:9090 | Metrics collection |
| **Jaeger UI** | http://localhost:16686 | Distributed tracing |

---

## Verification & Health Checks

### Step 1: Check Service Health

Run health checks on all services:

```bash
make test
```

Or manually:

```bash
curl http://localhost:3000/health  # Grafana
curl http://localhost:8080/health  # Gateway
curl http://localhost:8000/health  # Hypervisor
curl http://localhost:4000/health  # Sandbox
curl http://localhost:5000/health  # Grid
```

**Expected response:** Each endpoint should return a JSON payload indicating healthy status.

### Step 2: Verify Container Status

```bash
docker compose ps
```

All services should show `Up` status.

### Step 3: Test Intent Submission

Submit a test intent through the Gateway:

```bash
export AXIOM_API_KEY=${AXIOM_API_KEY:-dev-key}

curl -X POST http://localhost:8080/api/v1/intent/process \
  -H 'Content-Type: application/json' \
  -H "X-API-Key: ${AXIOM_API_KEY}" \
  -d '{
    "intent": "status-check",
    "message": "Return a brief health summary",
    "metadata": {"trace_id": "installation-test-001"}
  }'
```

**Expected response:** A successful HTTP response with payload containing response content and trace metadata.

### Step 4: Check Logs for Errors

```bash
docker compose logs --tail=100 gateway hypervisor sandbox grid
```

Look for any critical errors or warnings.

### Step 5: Verify Machine Profile

```bash
cat config/machine_profile.json
```

Ensure the profile was generated correctly with your hardware specifications.

---

## First Steps After Installation

### 1. Access the Dashboard

Open your browser and navigate to:
```
http://localhost:3000
```

Default credentials (if prompted):
- Username: `admin`
- Password: `admin` (change this in production!)

### 2. Explore the CLI

```bash
make cli
```

The CLI provides interactive access to:
- Submit intents
- Check node status
- Manage swarms
- Configure settings

### 3. Compile and Deploy Contracts (Optional)

If you're working with smart contracts:

```bash
# Compile contracts
make contracts-compile

# Run contract tests
make contracts-test

# Deploy to local chain
make contracts-deploy
```

### 4. Join a Swarm (Optional)

To join an existing swarm:

```bash
make cli
# When prompted, answer 'y' to "Joining existing cluster?"
# Provide your Node ID, parent node ID, and Swarm ID
```

See [`docs/HOWTO/swarm-join.md`](docs/HOWTO/swarm-join.md) for detailed instructions.

### 5. Run zkML Inference (Optional)

To submit a zkML proof:

```bash
# The Sandbox generates proofs using EZKL or RISC Zero
# Submit via POST /zkml/verify to the Grid
curl -X POST http://localhost:5000/zkml/verify \
  -H 'Content-Type: application/json' \
  -d '{"proof": "..."}'
```

See [`docs/HOWTO/zkml-infer.md`](docs/HOWTO/zkml-infer.md) for detailed instructions.

---

## Troubleshooting

### Common Issues and Solutions

#### Issue: Ports Already in Use

**Error:** `Bind for 0.0.0.0:8080 failed: port is already allocated`

**Solution:**
```bash
# Find what's using the port
lsof -i :8080

# Kill the process (replace PID with actual process ID)
kill -9 <PID>

# Or stop conflicting services
sudo systemctl stop apache2  # Example for Apache
```

#### Issue: Docker Permission Denied

**Error:** `Got permission denied while trying to connect to the Docker daemon socket`

**Solution:**
```bash
# Add your user to the docker group
sudo usermod -aG docker $USER

# Log out and back in, or run:
newgrp docker
```

#### Issue: Services Fail to Start

**Symptoms:** Containers exit immediately or show error status

**Solution:**
```bash
# Check logs for specific errors
docker compose logs gateway
docker compose logs hypervisor

# Rebuild containers
docker compose down
docker compose up -d --build

# Check for missing environment variables
cat .env
```

#### Issue: Health Checks Fail

**Symptoms:** `curl` returns connection refused or timeout

**Solution:**
```bash
# Verify containers are running
docker compose ps

# Check if services are listening on expected ports
netstat -tlnp | grep -E '3000|4000|5000|8000|8080'

# Inspect container networks
docker compose exec gateway netstat -tlnp
```

#### Issue: Python Dependencies Missing

**Error:** `ModuleNotFoundError: No module named 'xyz'`

**Solution:**
```bash
# Install Hypervisor dependencies
cd hypervisor
pip install -r requirements.txt
```

#### Issue: Node.js Dependencies Missing

**Error:** `Cannot find module 'xyz'`

**Solution:**
```bash
# Install Gateway dependencies
cd gateway
npm install

# Install Sandbox dependencies
cd sandbox
npm install
```

#### Issue: Make Command Not Found

**Error:** `make: command not found`

**Solution:**
- **Linux:** `sudo apt-get install make`
- **macOS:** `brew install make`
- **Windows:** `choco install make`

#### Issue: Installation Script Fails

**Symptoms:** `install.sh` exits with error

**Solution:**
```bash
# Run with verbose output
bash -x ./install.sh

# Check Python version
python3 --version

# Ensure script is executable
chmod +x install.sh

# Try running install.py directly
python3 install.py
```

#### Issue: Android/Termux Installation

**Note:** Docker is not natively supported on Termux without root/QEMU.

**Solution:**
```bash
# Use minimal-edge mode
AUTO_INSTALL=1 MACHINE_ROLE=minimal-edge ./install.sh

# Or run orchestrator directly
python3 -m hypervisor.src.orchestrator --mode public-pool
```

### Getting Help

If you encounter issues not covered here:

1. **Check Logs:** `docker compose logs --tail=200`
2. **Review Documentation:** See `docs/` directory
3. **Check GitHub Issues:** Look for similar problems
4. **Contact Support:** Reach out via community channels

---

## Next Steps

Congratulations! You've successfully installed AXIOM-MESH. Here's what you can do next:

### Learning Resources

- **Architecture Overview:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Technical Specification:** [`docs/TECHNICAL-SPECIFICATION.md`](docs/TECHNICAL-SPECIFICATION.md)
- **HOWTO Guides:** [`docs/HOWTO/`](docs/HOWTO/)
  - [Run Local Stack](docs/HOWTO/run-local-stack.md)
  - [Submit Intent](docs/HOWTO/submit-intent.md)
  - [Contracts Local](docs/HOWTO/contracts-local.md)
  - [Swarm Join](docs/HOWTO/swarm-join.md)
  - [zkML Inference](docs/HOWTO/zkml-infer.md)

### Advanced Configuration

- **Resource-Aware Routing:** Configure ResourceBalancer in `hypervisor/src/graph/resource_balancer.py`
- **Custom Sandbox Policies:** Edit `sandbox/policies/default.yaml`
- **Machine Profile Tuning:** Modify `config/machine_profile.json`

### Production Deployment

Before deploying to production:

1. **Security Hardening:** Review [`docs/SECURITY-HARDENING.md`](docs/SECURITY-HARDENING.md)
2. **Audit Reports:** Review [`docs/AUDIT_REPORT.md`](docs/AUDIT_REPORT.md)
3. **Operations Guide:** See [`docs/OPERATIONS.md`](docs/OPERATIONS.md)
4. **Runbooks:** Check [`docs/runbooks/`](docs/runbooks/)

### Contributing

Want to contribute? See [`CONTRIBUTING.md`](CONTRIBUTING.md) for guidelines.

### Community

- **Documentation Index:** [`docs/README.md`](docs/README.md)
- **Active Work Queue:** [`docs/MASTER-TODO.md`](docs/MASTER-TODO.md)
- **Roadmap:** [`README.md`](README.md#roadmap--architecture)

---

## Appendix

### Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `MACHINE_ROLE` | `shared-machine` | Node role in the network |
| `LAUNCH_MODE` | `local-mesh` | Deployment mode |
| `USER_PRIORITY` | `security` | Optimization priority |
| `MESHSTORE_QUOTA_GB` | `50` | Storage allocation |
| `LLM_PROVIDER` | `openai` | LLM provider name |
| `OPENAI_API_KEY` | (empty) | OpenAI API key |
| `DISCORD_TOKEN` | (empty) | Discord bot token |
| `NCP_SERVERS` | `http://localhost:8080` | NCP server URLs |
| `FDBA_FOUNDER_ADDRESS` | `0x1c2cb...` | Founder address (do not change) |
| `LOCAL_MODEL_FALLBACK` | `llama3:8b` | Local LLM model |

### Makefile Targets

| Target | Description |
|--------|-------------|
| `make up` | Start all services |
| `make down` | Stop all services |
| `make test` | Run health checks |
| `make cli` | Launch CLI |
| `make contracts-compile` | Compile smart contracts |
| `make contracts-test` | Test smart contracts |
| `make contracts-deploy` | Deploy smart contracts |
| `make generate-docs` | Generate API documentation |

### Directory Structure

```
axiom-mesh/
├── gateway/           # TypeScript/Node API gateway
├── hypervisor/        # Orchestration and reasoning engine
├── sandbox/           # Isolated execution environment
├── grid/              # Go ledger and coordination
├── cli/               # Command-line interface
├── docs/              # Documentation
│   ├── HOWTO/         # Operational guides
│   ├── api/           # API documentation
│   ├── audits/        # Audit reports
│   └── runbooks/      # Operational runbooks
├── scripts/           # Utility scripts
├── tests/             # Test suites
├── .env               # Environment configuration
├── .env.example       # Example environment file
├── docker-compose.yml # Docker orchestration
├── Makefile           # Build automation
├── install.sh         # Unix/macOS installer
├── install.bat        # Windows installer
└── install.py         # Cross-platform installer
```

---

**Version:** v16.0.0-Lockdown  
**Last Updated:** 2026-03-27  
**Status:** Repository/Staging Hardening

For the latest updates, check the repository or visit the documentation index at [`docs/README.md`](docs/README.md).
