# Test Strategy & CI Acceptance Gates

## Test Strategy
The AXIOM-MESH testing approach ensures robust coverage across all four pillars (Gateway, Hypervisor, Sandbox, Grid) with a focus on cryptographic integrity, execution isolation, and decentralized consensus.

1. **Unit Testing**:
   - **Python (Hypervisor)**: Uses `pytest` and `pytest-asyncio` focusing on orchestrator logic, hardware profiling, `ResourceBalancer`, and mock CRDT sync. Run with `PYTHONPATH=.:src:../ pytest tests/`.
   - **Node.js (Gateway/Sandbox)**: Uses `jest` (and `ts-jest`) for API validation, intent parsing, and sandbox isolation validation.
   - **Go (Grid)**: Uses `go test` for ledger state, ECDSA signing, P2P logic, and zkML verification primitives. Run with `go test -v ./...`.
2. **Integration Testing**:
   - Uses a Docker Compose matrix for verifying cross-pillar communication (`Gateway -> Hypervisor -> Sandbox/Grid`).
3. **Chaos & Degraded Mode Testing**:
   - Explicit CI matrix simulating disconnected network modes to verify Offline-first and Degraded-mode resilience (configured in `.github/workflows/ci.yml`).
4. **Smart Contract Verification**:
   - Hardhat tests (`npx hardhat test` inside `grid/contracts`) for solidity contract lifecycle events.

## CI Acceptance Gates
Before any pull request can be merged into `main`, the following gates must pass:

1. **Lint & Formatting**: `flake8` for Python, `go vet` for Go, and `tsc --noEmit` for TypeScript.
2. **Test Suites**: All language-specific test suites (Go, Python, Node-Gateway, Node-Sandbox) must pass successfully.
3. **Network Resilience Matrix**: The `integration-matrix` job must succeed in both `connected` and `disconnected` modes, demonstrating graceful degradation.
4. **Security Scans**: Container hardening configurations (e.g., `network=none` for Sandbox) must remain intact.
