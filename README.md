# AxiomMesh v2.5.0

AxiomMesh is a decentralized cognitive operating system designed to serve as the foundational infrastructure for the next generation of autonomous intelligence. Every installation is a Node acting as a private, multi-channel AI assistant and a distributed compute/memory block for the peer-to-peer network.

## Core Architectural Concepts (v2.5.0 Updates)
- **Temporal State Collapse**: An absolute countermeasure to Proactive Interference. The Cognitive Hypervisor manages mutating variables externally via `TemporalStateManager`, tracking state changes via hash maps and injecting only the definitively latest state into the context, ruthlessly purging historical noise.
- **RIKER Decoupling & Strict Context Cap**: Separates fact retrieval from verification. Enforces a strict 8K-16K context limit to prevent Context Degradation Spikes.
- **AutoResearch Daemon**: A background thread autonomously performing epistemic foraging from unstructured data and compiling it into the Tier 3 Knowledge Graph when the node is idle.
- **Uncertainty Optimization & Arena**: Explicitly rewards the AI for halting execution and stating "I do not know", preventing guessing. The `VerificationArena` applies adversarial verification before sensitive operations.
- **3-Tier Memory Protocol**:
  - **Tier 1 (Axioms & Collapsed State)**: The core system instructions and the latest, pristine key-value pairs of active tracking tasks.
  - **Tier 2 (Expert Vectors)**: Skill vectors containing contrastive logic equations via Agentic Critical Training (ACT).
  - **Tier 3 (Deep Archive)**: Hierarchical Graph Retrieval (GraphRAG) mapping interaction history and web state graphs, strictly avoiding flat RAG.
- **Thermodynamic Ethical Reasoning**: Evaluates all actions based strictly on information theory and thermodynamics, where entropy reduction is good and chaos is bad.
- **Dialectic Cognitive Partitioning**: Resolves deep, contradictory problems by spawning two isolated sub-agents arguing opposite extremes, and synthesizing a structural truth via an Orchestrator.
- **Pluralistic Vector Alignment**: Prevents LLM mode collapse (The Artificial Hivemind) by dynamically altering sampling parameters to reward non-homogenized outputs.

## Architecture
- **Pillar 1: Grid (Go)** - P2P Network, PoER Consensus
- **Pillar 2: Hypervisor (Python)** - Context 2.0 Engine, The Pulse, Evolution, Temporal State Manager
- **Pillar 3: Sandbox (Node.js)** - Ephemeral Code Execution (WASM/Docker)
- **Pillar 4: Gateway (TypeScript)** - REST & WS Intent Normalization

## Automated Installation (New!)
AxiomMesh now includes a fully automated interactive installer and hardware scanner to determine the best local LLM configurations.

1. Run `./install.sh` from the root directory.
   - The script will scan your CPU, RAM, and GPU (NVIDIA or Apple Silicon) to recommend a fallback model.
   - It will prompt you to interactively configure your `.env` (API Keys, Discord Token, WhatsApp Session, and NCP Servers).
   - Once configured, it will automatically build and start the docker container environment via `make up`.

2. Access the new Web Dashboard at [http://localhost:3000](http://localhost:3000)

## The Web Dashboard
The system now serves a comprehensive web interface directly from the Omni-Gateway.
- **Chat Interface:** Directly interact with the agent using text via WebSocket.
- **System Status:** View the live health of the Gateway, Hypervisor, Sandbox, and Grid nodes.
- **Settings / Config:** Reconfigure API keys, switch providers, and edit external channel connections dynamically without restarting manually.
- **Logs & Troubleshooting:** View live docker-compose output to monitor running agent threads.

## NCP (Node Context Protocol) Integration
AxiomMesh can now natively connect to external intelligence via NCP servers.
- When an intent is processed, the Python Hypervisor (`NCPClient`) queries configured servers (defined as a comma-separated list in `.env` under `NCP_SERVERS`).
- It fetches extra context and appends it to the LLM context prompt, bridging external networks dynamically.

## Interactive Commands
- `/dialectic <topic>`: Generates a dialectic synthesis for a topic.
- `/exec <code>`: Executes Python code in an ephemeral sandbox.
- `/sync_skills`: Syncs skills with the Grid network.

## Development Roadmap & Status

Based on the master specification, AxiomMesh follows a 5-phase strict initialization sequence:

- [x] **Phase 1 (The Skeleton)**: Omni-Gateway (Pillar 4) and Cognitive Hypervisor (Pillar 2) constructed with local HTTP/WebSocket communication normalizing intent objects.
- [x] **Phase 2 (The Muscle)**: Execution Sandbox (Pillar 3) integrated to isolate and run ephemeral Python/Bash scripts securely.
- [x] **Phase 3 (The Cortex)**: Implementation of Context 2.0 Engine, Temporal State Manager (Temporal State Collapse), Divergence Engine, and the 3-Tier memory system.
- [x] **Phase 4 (The Grid)**: Building the P2P Go Node (Pillar 1), establishing the Proof of Entropy Reduction (PoER) ledger, and subnet discovery.
- [x] **Phase 5 (The Evolution)**: Implementing the ActionEngine Web Compiler (State-Machine Web Memory), the recursive update loop via Agentic Critical Training (ACT), and offline web mapping.

## Novel Enhancements & Future Ideas
- **Distributed GraphRAG (Tier 3 Expansion)**: Implementing a decentralized version of the Deep Archive via WebSockets and Zero-Knowledge Proofs, allowing nodes to query verified subset graphs over the P2P network securely without revealing personal user states.
- **Hardware-Aware ACT Routines**: Modifying the Evolution Engine (Agentic Critical Training) to adapt logic equations and contrastive actions based on the specific computing footprint and available VRAM of the hardware node.
- **Federated State-Machine Caching**: Allowing nodes to share pre-compiled JSON Web State Graphs to a decentralized cache, reducing crawler footprint across the network and boosting execution speeds of the ActionEngine Web Compiler.
- **PoER Staking & Compute Bonds**: Building a smart contract mechanism into Pillar 1 where nodes actively stake trust bonds behind their Proof of Entropy Reduction mathematical verifications to secure edge subnets.
