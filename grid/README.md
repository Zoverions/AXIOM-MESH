# Grid Service

The **Grid** is the decentralized ledger and P2P consensus layer. It manages bonding, staking, distributed consensus (PoER), zero-knowledge proof verification, and smart contract integration. The Grid ensures cryptographic accountability across the AXIOM-MESH network.

## Architecture

```
grid/
├── api/
│   ├── server.go             # HTTP/REST API (bonds, proposals, zk-stats)
│   ├── server_test.go        # API endpoint tests
│   └── cache_test.go         # Cache tests
├── blockchain/
│   ├── chain.go              # Ledger & bond management
│   ├── chain_test.go         # Ledger tests
│   ├── web_cache.go          # Web cache layer
│   └── web_cache_test.go     # Cache tests
├── consensus/
│   ├── poer.go               # Proof-of-Execution-Result (PoER) consensus
│   ├── poer_test.go          # PoER tests
│   ├── zkml.go               # ZK-ML verification
│   ├── zkp.go                # Zero-knowledge proof integration
│   └── signature_test.go      # Signature verification tests
├── contracts/                # Solidity smart contracts (Hardhat)
│   ├── hardhat.config.js
│   ├── contracts/
│   │   ├── ComputeBond.sol
│   │   ├── DualLedgerIdentity.sol
│   │   ├── DialecticArbitration.sol
│   │   ├── WeightOracle.sol
│   │   └── ...
│   ├── test/                 # Hardhat test suite
│   └── scripts/              # Deployment scripts
├── crypto/
│   └── keystore.go           # Key management
├── p2p/
│   ├── node.go               # P2P node implementation
│   ├── node_test.go          # P2P tests
│   ├── transport.go          # Network transport abstraction
│   ├── http_transport.go     # HTTP-based transport
│   └── types.go              # P2P types (peers, messages)
├── types/
│   └── types.go              # Domain types (ComputeBond, Proposal, etc.)
├── cmd/grid/
│   └── main.go               # CLI entry point
├── go.mod
├── go.sum
└── Dockerfile
```

## Key Components

### API Server (`api/server.go`)
- **REST Endpoints:**
  - `GET /health` – Service status
  - `POST /stake` – Stake compute bonds (submit bond for execution)
  - `GET /bonds/:nodeID` – Retrieve bond information
  - `POST /slash` – Slash (penalize) a bond
  - `POST /proposals` – Submit governance proposals
  - `GET /proposals/:id` – Retrieve proposal details
  - `POST /vote` – Cast a vote on a proposal
  - `GET /zk-stats` – Anonymized system statistics (bonds, queue, swarms)
  - `POST /zkml/verify` – Verify zero-knowledge ML proofs

### Blockchain/Ledger (`blockchain/chain.go`)
- **ComputeBond management:**
  - Staking/bonding (lock collateral for execution)
  - Bond status tracking (active, pending, inactive)
  - Slashing (penalize misbehavior)
  - Reconciliation with chain events
- **Proposal & voting system:**
  - Governance proposals for parameter changes
  - Vote tallying and finalization
  - Treasury fund allocation
- **Skills & Swarms registry:**
  - Skill registration and updates
  - Swarm membership tracking

### Consensus (`consensus/`)
- **PoER (Proof-of-Execution-Result)** – Validates computation results without re-execution
  - Verifies executor signature
  - Checks result matches expected hash
  - Tracks execution time and resource usage
- **ZK-ML (`zkml.go`)** – Integration with zero-knowledge proof system
  - Model commitment verification
  - Proof validity checks
  - Circuit compatibility matching
- **Signature verification** – Ed25519 signatures for all state transitions

### P2P Network (`p2p/`)
- **Node discovery** – Bootstrap and peer exchange
- **Message propagation** – Consensus messages, bond events, proposals
- **Transport abstractions:**
  - HTTP transport (REST API)
  - Planned: WebSocket for real-time event streaming
- **Resilience** – Peer reconnection, message retry logic

### Smart Contracts (`contracts/`)
- **ComputeBond.sol** – Bond lifecycle (lock, slash, release)
- **DualLedgerIdentity.sol** – Dual-ledger (on-chain + off-chain) identity
- **DialecticArbitration.sol** – Dispute resolution via dialectic debate
- **WeightOracle.sol** – Determines node weights based on reputation
- **Intent registry, skill contracts, treasury fund contracts**

## Configuration

```bash
# .env configuration
GRID_PORT=5000
GRID_WS_URL=ws://localhost:5000
GRID_HOST=0.0.0.0

# Smart contract deployment (Hardhat)
HARDHAT_NETWORK=localhost    # or 'sepolia', 'mainnet'
PRIVATE_KEY=0x...            # Deployer account
RPC_URL=http://localhost:8545
```

## Development

```bash
cd grid

# Go services
go mod tidy
go build ./cmd/grid
go test ./...
go vet ./...

# Smart contracts (Hardhat)
cd contracts
npm install
npm run compile
npm run test
npm run deploy
```

## Testing

**Moderate coverage (55-65%)** – 12+ test files:

**Well-tested:**
- `node_test.go` – P2P peer discovery
- `chain_test.go` – Ledger operations (bonding, slashing, reconciliation)
- `signature_test.go` – Signature verification
- `poer_test.go` – PoER consensus mechanism
- `web_cache_test.go` – Caching layer

**Gaps:**
- CCIP integration tests (cross-chain interoperability)
- ZK graph query proof tests
- zkML verification worker tests (queue handling, proof validation)
- Smart contract interaction tests (bond creation via contract, slashing events)
- P2P message propagation under network degradation

## API Examples

### Submit a Bond
```bash
curl -X POST http://localhost:5000/stake \
  -H "Content-Type: application/json" \
  -d '{
    "node_id": "node-1",
    "amount": 1000,
    "signature": "0x..."
  }'
```

### Get Anonymized zk-stats
```bash
curl http://localhost:5000/zk-stats
# Response:
# {
#   "active_bonded_nodes": 42,
#   "total_staked_amount": 150000,
#   "skills_registered": 128,
#   "proposals_count": 15,
#   "swarms_active": 8,
#   "zkml_queue_size": 5,
#   "anonymized_telemetry": true
# }
```

### Verify zkML Proof
```bash
curl -X POST http://localhost:5000/zkml/verify \
  -H "Content-Type: application/json" \
  -d '{
    "model_commitment": "0xabcd1234...",
    "proof": "0x...",
    "public_inputs": [...]
  }'
```

## Production Considerations

- **Consensus finality:** PoER requires majority (>50%) of bonded nodes to sign
- **Bond slashing:** Misbehavior (timeout, wrong result) triggers 10-50% penalty
- **Treasury splits:** 60% Network Security Fund / 40% Wealth Generation Pool
- **Rate limiting:** 100 requests/min per IP
- **Encryption:** All sensitive ledger data encrypted at rest

## Known Issues / TODOs

- [ ] Contract compilation in CI (Hardhat proxy issue)
- [ ] CCIP integration for Ethereum <> L2 settlement
- [ ] Lightweight ZK graph query proofs
- [ ] WebSocket event streaming (planned)
- [ ] Historical ledger pruning strategy

## Related Services

- **Hypervisor** – Submits bonds, stakes results, reads ledger state
- **Sandbox** – Provides execution results that get recorded
- **Gateway** – Routes user intents, checks user treasury balance


### Optional on-chain ComputeBond integration

Grid can mirror `POST /stake` and `POST /slash` to Solidity `ComputeBond` when configured:

- `GRID_ETH_RPC_URL`
- `GRID_ETH_CHAIN_ID`
- `GRID_ETH_PRIVATE_KEY`
- `GRID_COMPUTE_BOND_ADDRESS`

When enabled, API responses include `txHash` and ledger records persist that hash for reconciliation.

#### Contract toolchain

```bash
cd grid/contracts
npm run compile
npm test
npm run deploy:localhost
```

Deployment manifests are written to `grid/contracts/deployments/<network>.json`.
