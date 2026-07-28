# Capsule Plus Creation Process

This document outlines the standard procedure for both humans and digital entities (e.g., the Autonomic Compiler) to create and propose a new Capsule Plus for the AXIOM-MESH ecosystem.

A Capsule Plus is an advanced, domain-specific bundle that typically encompasses one or more underlying Capsules and introduces specialized skills, smart contracts, schemas, and AI agent orchestrations.

## 1. Define the Scope and Value Proposition
- Identify the target domain (e.g., Business, Healthcare, Advanced Logistics).
- Determine what specific problems this Capsule Plus solves that existing modules do not.
- Ensure alignment with the AXIOM-MESH ecosystem principles (Zero Barriers, Self-Funding, Proof of Entropy Reduction).

## 2. Utilize the Template
- Use `docs/templates/CAPSULE_PLUS_TEMPLATE.md` to draft the primary documentation (the `README.md` for the new module).
- Clearly outline the capabilities, token policy interactions, and required digital agents.

## 3. Generate the Boilerplate
Use the automated scaffolding script to initialize the Capsule Plus structure. This creates the foundational files needed for mesh ingestion and execution.

```bash
python scripts/generate_capsule_plus.py <capsule_name> --capabilities capability1,capability2 --agents agent1,agent2
```
*(See `scripts/generate_capsule_plus.py` for full usage instructions.)*

## 4. Develop Required Components
Populate the scaffolded structure with domain-specific logic:

### A. Skills & Agents (`agents/`)
- Implement the Python scripts (or other supported runtimes) defining the behavior, prompts, and tool access for the digital agents.
- Integrate with LangGraph or similar frameworks if complex multi-step reasoning is required.

### B. Schemas (`schemas/`)
- Define JSON schemas for any custom data structures, service contracts, or intents unique to this Capsule Plus.
- Ensure compatibility with the overarching Intent Canonicalization requirements.

### C. Smart Contracts (`contracts/`)
- Write Solidity contracts (e.g., custom treasury routers, governance overlays) if the capsule requires localized ledger state.
- Inherit from existing mesh primitives (like `GuildTemplate.sol`) where appropriate.

## 5. Configure Manifests
- **`SKILL_MANIFEST.json`**: Fine-tune capabilities, runtime constraints, resource limits, and token policy scopes.
- **`SOURCE_DESCRIPTOR.json`**: Ensure provenance data accurately reflects the creation entity (whether human developer or AI node).

## 6. Local Testing and Validation
- Run the module within a local sandbox environment.
- Validate that the defined constraints (e.g., memory limits, token scopes) are respected by the hypervisor.
- Ensure smart contracts compile and pass tests in Hardhat.

## 7. Submission and Proposal
- Submit the new Capsule Plus directory via a Pull Request to the main repository.
- If this is an entirely new domain, consider drafting an accompanying specification or whitepaper in `docs/whitepapers_and_research/` to explain the theoretical foundations.
