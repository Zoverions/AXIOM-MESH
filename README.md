# AxiomMesh v2.0.0

AxiomMesh is a decentralized cognitive operating system. Every installation is a Node acting as a private, multi-channel AI assistant and a distributed compute/memory block for the peer-to-peer network.

## Architecture
- **Pillar 1: Grid (Go)** - P2P Network, PoER Consensus
- **Pillar 2: Hypervisor (Python)** - Context 2.0 Engine, The Pulse, Evolution
- **Pillar 3: Sandbox (Node.js)** - Ephemeral Code Execution
- **Pillar 4: Gateway (TypeScript)** - REST & WS Intent Normalization

## Getting Started
1. Run `make up` to build and start the system using Docker Compose.
2. Ensure Docker daemon is accessible (`/var/run/docker.sock` is mounted in the Sandbox).
3. Use `make cli` to interact with the interactive CLI.

## Interactive Commands
- `/dialectic <topic>`: Generates a dialectic synthesis for a topic.
- `/exec <code>`: Executes Python code in an ephemeral sandbox.
- `/sync_skills`: Syncs skills with the Grid network.
