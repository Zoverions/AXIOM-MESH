# AXIOM-MESH

<img src="logo.png" alt="Axiom Mesh Logo" width="150" align="right">

AXIOM-MESH is a multi-service runtime built around four core services:

- **Gateway** (TypeScript/Node): API ingress, UX delivery, and channel adapters.
- **Hypervisor** (Python/FastAPI): orchestration, policy routing, context/memory, and execution planning.
- **Sandbox** (TypeScript/Node + Docker): isolated code execution with security controls.
- **Grid** (Go + Solidity): ledger, consensus components, and contract integration.

## Pillar Clarification (Runtime vs Platform)

To avoid ambiguity in downstream docs:
- **Runtime architecture = 4 pillars** (Gateway, Hypervisor, Sandbox, Grid).
- **Platform sovereignty program = 8 pillars** (see `docs/MASTER-INTEGRATION.md`).

Both descriptions are intentional and refer to different abstraction layers.

> **Current repository status (March 2026):** AXIOM-MESH is in repository/staging hardening. The codebase includes implementation across all four services, but this repository is **not declaring live testnet/mainnet deployment** from this README.

---

## Quick Start

### Option A: Universal installer (recommended)

```bash
# macOS/Linux
./install.sh

# Windows
.\install.bat
```

The installer delegates to `install.py`, detects host capabilities, and supports unattended mode for automation.

### Option B: Run core stack with Docker Compose

```bash
docker compose up -d --build
```

This starts the default local stack defined in `docker-compose.yml` (including core runtime services and observability components).

---

## Core Repository Layout

- `gateway/` — Gateway API and dashboard surface.
- `hypervisor/` — orchestration and reasoning engine.
- `sandbox/` — secure execution subsystem.
- `grid/` — Go ledger/P2P + Solidity contracts.
- `shared/` — shared TypeScript utility modules (resilience, observability).
- `schemas/` — Cap'n Proto and shared schema definitions.
- `scripts/` — operational checks, verification scripts, and tooling.
- `docs/` — canonical architecture, roadmap, governance, and operations docs.

---

## Common Developer Commands

Use the top-level `Makefile` for common workflows:

```bash
# Bring services up/down
docker compose up -d --build
docker compose down

# Contract workflow
make contracts-compile
make contracts-test

# Transformer gate checks
make transformer-gate

# Evidence/control verification examples
make verify-evidence-bundles
make verify-tokenomics-controls
make verify-genesis-ceremony
```

For service-specific development, see each service README:

- `gateway/README.md`
- `hypervisor/README.md`
- `sandbox/README.md`
- `grid/README.md`

---

## Documentation Canonical Sources

Start with:

- **`docs/README.md`** — canonical documentation index.

Primary control documents:

- **`docs/MASTER-TODO.md`** — canonical execution queue.
- **`docs/PROJECT-STATUS-2026.md`** — project/repo status snapshot.
- **`docs/AUDIT_REPORT.md`** and `docs/audits/` — audit and remediation material.
- **`docs/ARCHITECTURE.md`** and **`docs/TECHNICAL-SPECIFICATION.md`** — architecture/spec baseline.

---

## Notes on Scope and Accuracy

This top-level README is intentionally kept as a **current orientation guide** (what exists, how to run it, where authoritative docs live). Detailed roadmap, tokenomics, and deployment claims are maintained in the canonical documents under `docs/`.

---

## Security

AXIOM-MESH is built with a "security-first" mindset. All inter-service communication is secured via mTLS, and execution is isolated within sandboxes.

- **Vulnerability Reporting:** Please refer to our [Security Policy](.github/SECURITY.md) for instructions on how to report vulnerabilities.
- **Configuration:** See [Configuration Guide](docs/CONFIGURATION.md) for environment variable setup and security best practices.
- **Hardening:** Use the provided `scripts/harden-before-public.sh` to verify your local repository configuration before deployment.
- **CI/CD:** Automated security scanning (Secret scanning, Trivy, CodeQL) is integrated into our GitHub Actions workflows.
