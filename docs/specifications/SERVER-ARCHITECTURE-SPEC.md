# Server Architecture Specification

This document defines the server-side architecture and deployment specifications for the AXIOM-MESH infrastructure, focusing on scalability, security, and interoperability with external agent frameworks (e.g., Open-CLAW, Claude, Gemini).

## 1. Core Architecture Principles
*   **Decentralized Coordination:** The architecture is built around a peer-to-peer (P2P) grid, allowing for localized execution environments (Guilds/Subnets) that eventually synchronize state and proofs to the global Pulsechain L1.
*   **Zero-Trust Networking:** All inter-service communication requires mutual TLS (mTLS) and is authenticated via the Gateway's identity management layer.
*   **Horizontal Scalability:** Key components (Gateway, Hypervisor, Sandbox) are designed to scale horizontally across multiple instances or worker nodes.

## 2. Component Deployment Strategies

### A. The Gateway (API & Ingress)
The Gateway acts as the primary ingress point for human interaction, external APIs, and MCP (Model Context Protocol) connections.
*   **Load Balancing:** Deploy multiple instances of the Node.js Gateway service behind a Layer 7 load balancer (e.g., NGINX, HAProxy, or cloud-native ALB).
*   **Clustering:** The Gateway leverages Node.js's native `cluster` module to spawn worker processes per CPU core, maximizing concurrent connection handling (SSE, WebSockets).
*   **Caching & CDN:** Implement edge caching (e.g., Cloudflare, AWS CloudFront) for static assets and public documentation.

### B. The Hypervisor (Orchestrator & MCP Server)
The Hypervisor is the "brain" of the local node, orchestrating task routing, evolution algorithms, and providing the MCP interface.
*   **Async Workers:** Scale using `uvicorn` with multiple workers (`HYPERVISOR_WORKERS`) to handle concurrent API requests and long-running Python tasks.
*   **MCP Integration:** The Hypervisor runs a dedicated MCP Server (via FastMCP) exposed natively within the FastAPI app. This allows external agents (using Open-CLAW or built on Claude/Gemini) to securely connect, register skills, and execute sandbox payloads.
*   **Database:** Utilize PostgreSQL (or a highly available cloud equivalent like AWS Aurora) for the primary operational database, scaling read replicas as needed.
*   **Vector Storage:** Deploy a dedicated vector database cluster (e.g., Milvus, Qdrant) to support rapid semantic search and memory retrieval (Deep Archive).

### C. The Grid (Ledger & P2P)
The Go-based Grid component manages the distributed ledger, CRDT state syncing, and zkML proof aggregation.
*   **Sharding:** Implement Grid sharded consensus (`GRID_SHARD_ID`) to partition the network state and reduce synchronization overhead across the global mesh.
*   **P2P Networking:** Utilize libp2p for resilient peer discovery and communication. Ensure appropriate firewall rules and port forwarding (or NAT traversal via STUN/TURN) are configured for public nodes.

### D. The Sandbox (Execution & Verification)
The Sandbox provides the secure environment for running agent payloads, verifying zkML proofs, and interacting with external services.
*   **Kubernetes (K8s) Scaling:** Deploy the Sandbox execution environments as ephemeral pods within a Kubernetes cluster (e.g., using the manifests in `sandbox/k8s/`). This allows for dynamic scaling based on execution demand.
*   **WASM Fallback:** For lightweight tasks or edge deployments without Docker/K8s support, utilize the Rust-based WASM runtime (`sandbox/src/main.rs`) for rapid, isolated execution.
*   **Resource Limits:** Strictly enforce memory quotas (`memory_quota_mb`) and hardware tier requirements (`RequiredHardwareTier`) via the Hypervisor's capability manifest validation.

## 3. Integration & Interoperability

### External Agent Frameworks (Open-CLAW, Claude, Gemini)
AXIOM-MESH is designed to be an integral part of existing AI workflows. We do not require users to abandon their preferred tools.
*   **Direct Interaction:** Users can interface directly with their primary agent (e.g., Claude, Gemini) and instruct it to interact with the AXIOM-MESH infrastructure.
*   **MCP (Model Context Protocol):** The primary mechanism for this integration is the MCP Server running within the Hypervisor. External agents can discover and utilize AXIOM-MESH tools (e.g., `sandbox_execute`, `register_grid_skill`, `trigger_production_mint`) via standard MCP connections.
*   **Notebook Integration:** Direct integration with Jupyter notebooks or similar data science environments is supported via the Gateway's REST API, allowing researchers to dispatch tasks to the mesh directly from their analysis workflows.

## 4. Security & Compliance
*   **mTLS Enforcement:** All internal service communication is secured via mTLS, governed by the `MTLS_CA_CERT`, `MTLS_CLIENT_CERT`, and `MTLS_CLIENT_KEY` environment variables.
*   **Rate Limiting & WAF:** Implement robust rate limiting and Web Application Firewall (WAF) rules at the Gateway/Load Balancer layer to mitigate DDoS and injection attacks.
*   **Audit Logging:** All critical actions (e.g., smart contract deployments, governance proposals, policy updates) are logged immutably via the WORM (Write Once Read Many) audit trail within the Hypervisor and Grid.
