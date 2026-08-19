# AXIOM-MESH Agent Instructions

> **Capability is not authority. Discovery is not permission. Connection is not permission.**

This file is the concise machine-facing operating guide for coding agents and other automated contributors working with AXIOM-MESH. It does not grant repository, runtime, deployment, merge, or production authority.

## Installation

Use the supported root setup command from the repository root:

```bash
npm run setup
```

The supported Node.js line is pinned by `.node-version` and the package engine declarations. Do not substitute an unreviewed runtime or dependency tree merely because it works locally.

## Configuration

Start from `.env.example` when local configuration is required. Treat credentials, tokens, provider configuration, production resolver mappings, and external destinations as authority-bearing material rather than ordinary convenience settings.

The supported privileged-effect path is:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

Do not create a parallel authority path around that sequence. Agent runtimes, adapters, discovery protocols, credentials, and reachable tools are clients or capabilities; they are not independent sources of permission.

## Usage

Before changing supported behavior:

1. Read `README.md` and `AGENT-ENTRY.md`.
2. Read `CONTRIBUTING.md` for repository authority and contribution rules.
3. Inspect `mesh/config/capabilities.json` before changing a capability claim.
4. Inspect `docs/security/CURRENT-BUILD-THREAT-MODEL.md` for the current trust boundary.
5. Run the narrow relevant checks while iterating.
6. Run the full supported validation before presenting the change as ready:

```bash
npm run check
npm run release:verify
```

For a read-only pre-action authority assessment, see `agent-skills/axiom-authority-auditor/SKILL.md`.

## Authority rules for automated contributors

- A request to draft or propose a change is not permission to merge it.
- Repository write access is not production authority.
- A passing test is evidence about the tested claim; it is not a production promotion.
- Do not activate providers, egress, remote execution, public endpoints, credentials, production resolver mappings, or deployment surfaces unless the governing change explicitly authorizes that activation.
- Do not weaken a failing safety or documentation boundary merely to make a proposed change pass.
- Missing, ambiguous, stale, or conflicting authority for a consequential external effect must not be converted into permission.
- Sensitive security findings belong in the process described by `SECURITY.md`, not in a public proof-of-concept.

## Current claim boundary

The supported build is `0.12.0-dev.3`, a **production candidate, not production-promoted**. Do not claim a live public AXIOM-MESH deployment, completed independent security approval, production certification of external runtimes, a production MCP/A2A endpoint, BFT consensus, or arbitrary external-world truth from signed evidence unless the canonical repository state changes and the required promotion evidence exists.

## Machine-discovery surfaces

The repository includes a prepared agent-readiness publication workstream. The tracked discovery files are informational and do not create authority:

- `llms.txt` — concise machine-readable index;
- `llms-full.txt` — expanded context index;
- `sitemap.md` — human/agent-readable repository map;
- `AGENT-ENTRY.md` — agent-facing explanation of the architecture;
- `agent-skills/axiom-authority-auditor/SKILL.md` — advisory Agent Skills-format audit procedure.

A deployable static discovery surface can be built with:

```bash
npm run agent-readiness:build
npm run agent-readiness:check
```

Building that surface does not publish or deploy it. Publication remains a separate, explicit action.
