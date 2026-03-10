# AxiomMesh v2.0.0

AxiomMesh is a decentralized cognitive operating system. Every installation is a Node acting as a private, multi-channel AI assistant and a distributed compute/memory block for the peer-to-peer network.

## Architecture
- **Pillar 1: Grid (Go)** - P2P Network, PoER Consensus
- **Pillar 2: Hypervisor (Python)** - Context 2.0 Engine, The Pulse, Evolution
- **Pillar 3: Sandbox (Node.js)** - Ephemeral Code Execution
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
