# Hypervisor Service

The **Hypervisor** is the AI orchestration and autonomous reasoning layer. It implements LangGraph-based workflows for intent processing, skill evolution, archive management, and collective consensus. Key responsibilities: context assembly, resource balancing, sandbox/zk-ML execution, and distributed learning.

## Architecture

```
hypervisor/
├── src/
│   ├── api/                  # FastAPI server, endpoints, auth
│   ├── cortex/               # AI reasoning engine, LLM integrations
│   ├── engine/               # Core execution engine, state management
│   ├── evolution/            # Skill evolution and adaptation
│   ├── graph/                # LangGraph workflows (autoresearch_graph)
│   ├── llm/                  # LLM provider abstractions
│   ├── memory/               # Skill, context, archive storage
│   ├── models/               # Data models (Intent, Skill, Archive)
│   ├── pulse/                # Telemetry and health monitoring
│   ├── zkml/                 # ZK-ML verification integration
│   └── arweave.py            # Arweave integration
├── core/
│   ├── context_engine.py     # Context assembly for intents
│   ├── ipc_server.py         # IPC communication
│   └── pulse_monitor.py      # Real-time telemetry
├── tests/
│   ├── test_autoresearch*.py # Core workflow tests
│   ├── test_archive*.py      # Archive & governance tests
│   ├── test_evolution*.py    # Skill evolution tests
│   ├── test_graph.py         # Knowledge graph tests
│   ├── test_pulse*.py        # Monitoring & telemetry
│   └── ... (23 test files total)
├── main.py                   # FastAPI application entry
├── requirements.txt
├── pytest.ini
└── Dockerfile
```

## Key Components

### API (`src/api/`)
- **FastAPI server** – RESTful + streaming endpoints
- **/api/v1/intent** – Intent processing with result streaming
- **/api/v1/memory** – Skill & context CRUD
- **/api/v1/autoresearch** – Autonomous research workflows
- **/health** – Service status

### Graph (LangGraph Workflows) (`src/graph/autoresearch_graph.py`)
The core autonomous loop consists of:
1. **context_assembly** – Gathers context and semantic grounding
2. **resource_balancer** – Decides routing (local, peer, Grid, L1) and treasury splits
3. **sandbox_exec** – Executes code in isolated sandbox
4. **zkml_verify** – Verifies computation with zero-knowledge proofs
5. **grid_stake** – Records result on Grid ledger

### Cortex (`src/cortex/`)
- **LLM integrations** – OpenAI, Anthropic, HuggingFace, local models
- **Prompt engineering** – System prompts, few-shot examples
- **Response parsing** – Structured output extraction

### Memory (`src/memory/`)
- **Skill storage** – Vector embeddings for skill discovery
- **Archive system** – Encrypted, distributed storage on Arweave/IPFS
- **Context persistence** – Session-based context management

### Evolution (`src/evolution/`)
- **Skill extraction** – Learns new skills from successful intents
- **Auto-training** – Continuous learning loop
- **Dialectic negotiation** – Consensus-building for skill dispute resolution

### Pulse (`src/pulse/`)
- **Real-time telemetry** – Observability for autoresearch workflows
- **Performance metrics** – Latency, queue depth, error rates
- **zk-stats endpoint** – Anonymized statistical reporting

## Configuration

```bash
# .env configuration
HYPERVISOR_PORT=8000
HYPERVISOR_API_KEY=your_secure_key
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
ARWEAVE_API_URL=https://arweave.net
IPFS_API_URL=http://localhost:5001
```

## Development

```bash
cd hypervisor
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run tests
PYTHONPATH=.:src python -m pytest tests/

# Run service
python main.py

# Run specific test
python -m pytest tests/test_autoresearch_graph.py -v
```

## Testing

**Excellent coverage (70-80%)** – 23 comprehensive test files:

**Core Workflows:**
- `test_autoresearch.py` – Main autonomous loop
- `test_autoresearch_graph.py` – LangGraph node execution (resource_balancer, zkml_verify, etc.)
- `test_autoresearch_scenarios.py` – Offline modes, overload, bond severance

**Skill & Learning:**
- `test_evolution_skill.py` – Skill extraction and learning
- `test_auto_training.py` – Training loop with bond integration

**Archive & Storage:**
- `test_archive.py` – Encryption, TTL, queries
- `test_distributed_archive.py` – Peer sync, recovery
- `test_archive_governance.py` – Bilateral severance, memory zeroization

**Knowledge & Reasoning:**
- `test_graph.py` – Knowledge graph operations
- `test_dialectic.py` – Negotiation engine
- `test_arena.py` – Safety arena (prompt injection, logic trap detection)

**Operational:**
- `test_pulse.py`, `test_pulse_monitor.py` – Telemetry and monitoring
- `test_oracle.py` – Oracle integration
- `test_resource_balancer.py` – Treasury splits and routing decisions
- `test_server_startup.py` – Health checks

## Production Considerations

- **Async-first architecture** – Uses `asyncio` and `httpx` for concurrent operations
- **Resilience patterns** – Retry logic, exponential backoff, circuit breaker (in sandbox failures)
- **Resource tracking** – Bond management, staking verification, treasury splits
- **Telemetry** – Real-time pulse monitoring, anonymized zk-stats endpoint
- **Encryption** – All archive entries encrypted before Arweave storage

## Known Issues / TODOs

Please refer to the [MASTER-TODO.md](../docs/MASTER-TODO.md) list for specific active execution tasks and known issues backlog.

## Related Services

- **Gateway** – User-facing API, intent routing
- **Sandbox** – Code execution environment
- **Grid** – Ledger, P2P consensus, smart contracts

## Transformer Foundation Update (v15.4.6)

Hypervisor now routes pure latent vectors via Cap'n Proto for `MODEL_RUN` proposals.
These proposal tensors are candidate-only outputs and must pass symbolic verification,
PoER checks, and cognitive-friction gating before any settlement path is allowed.
Hypervisor now routes pure latent vectors for MODEL_RUN proposals and consequence forecasting.
