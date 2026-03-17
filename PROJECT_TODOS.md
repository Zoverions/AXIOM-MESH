# AXIOM-MESH Project Roadmap & To-Do List

**Last Updated:** March 17, 2026  
**Status:** Active - Based on Cleanup & Audit Report (v1.8)

---

## ✅ Completed (March 2026)

### Repository Cleanup
- [x] Delete `gateway/dev_out.log` (debug artifacts)
- [x] Expand `.gitignore` (debug logs, generated files, IDE settings)
- [x] Expand `.env.example` with 90+ configuration variables
- [x] Create service-level README files (gateway, hypervisor, sandbox, grid)
- [x] Consolidate documentation with Documentation Map in main README
- [x] Expand ACKNOWLEDGEMENT.md with framework credits and standards
- [x] Generate CLEANUP_AUDIT_REPORT.md with findings and recommendations

### Documentation
- [x] Documentation Map in README linking to all strategic docs
- [x] Service READMEs complete with architecture, configuration, testing notes
- [x] Operational guidance in each service README
- [x] Known issues and gaps documented

---

## 🔴 High Priority (P0 - This Week)

### Gateway Service Testing
- [ ] **Add REST route tests** (`tests/routes.test.ts`)
  - Test `/api/v1/intent/process` endpoint (success, validation failures, auth failures)
  - Test `/api/v1/memory/*` endpoints (CRUD operations)
  - Test `/api/v1/agents` endpoint
  - Test dependency health aggregation endpoint
  - **Estimated effort:** 4-6 hours
  - **Acceptance criteria:** 80%+ code coverage for routes/

- [ ] **Add WebSocket integration tests** (`tests/websocket.integration.test.ts`)
  - Test WebSocket connect/disconnect
  - Test message flow (parse, normalize, relay)
  - Test backpressure handling
  - Test error scenarios (malformed JSON, auth failure)
  - **Estimated effort:** 3-4 hours
  - **Acceptance criteria:** All WebSocket paths covered

- [ ] **Add channel adapter tests** (`tests/channels/*.test.ts`)
  - Test Discord adapter (mock API, rate limiting)
  - Test Slack adapter
  - Test Telegram adapter
  - Test retry/backoff logic
  - **Estimated effort:** 4-5 hours
  - **Acceptance criteria:** Each adapter has ≥2 happy path + 2 error path tests

### Sandbox Service Testing
- [ ] **Add isolation verification tests** (`tests/isolation.test.ts`)
  - Verify `--network=none` blocks DNS requests
  - Verify `--network=none` blocks HTTP/HTTPS outbound
  - Verify seccomp policy blocks dangerous syscalls
  - **Estimated effort:** 3-4 hours
  - **Acceptance criteria:** Network isolation confirmed in 3+ test scenarios

- [ ] **Add resource limit tests** (`tests/resource-limits.test.ts`)
  - Test CPU limit enforcement
  - Test memory limit enforcement
  - Test timeout enforcement
  - **Estimated effort:** 3-4 hours
  - **Acceptance criteria:** All limits verified with actual resource monitoring

- [ ] **Add execution path tests** (`tests/execution.test.ts`)
  - Test Python code execution
  - Test JavaScript code execution
  - Test Bash code execution
  - Test error handling (syntax errors, runtime errors)
  - **Estimated effort:** 2-3 hours
  - **Acceptance criteria:** All languages tested, happy path + error paths

### Package Management
- [ ] **npm audit & fix** in gateway/, sandbox/, grid/contracts/
  - Run `npm audit fix --force` (if needed)
  - Test after updates
  - Document any breaking changes
  - **Estimated effort:** 1-2 hours

### Deprecated File Consolidation
- [ ] **Evaluate `reproduce_blocking.py`**
  - Determine if still used for testing
  - If yes: integrate into test suite
  - If no: move to `docs/historical/reproduce_blocking.py`
  - **Estimated effort:** 30 min

- [ ] **Consolidate root-level test files**
  - Move `test_zkml.py` into `hypervisor/tests/`
  - Move `test_zkml.go` into `grid/api/`
  - Remove duplicates
  - **Estimated effort:** 1 hour

- [ ] **Archive initialization scripts**
  - Move `init_phase1.sh` to `docs/historical/`
  - Add README explaining historical scripts
  - **Estimated effort:** 30 min

### Kernel/Pulse Integration
- [ ] **Verify `kernel/pulse_monitor.py` integration**
  - Check if imported/used anywhere
  - If unused: decide archive or remove
  - If used: add to hypervisor tests
  - **Estimated effort:** 30 min

---

## 🟡 Medium Priority (P1 - Next 1-2 Weeks)

### CI/CD Matrix & Contract Compilation
- [ ] **Fix Hardhat contract compilation in CI**
  - Resolve 403 proxy issue
  - Add contract build step to GitHub Actions workflow
  - Verify contract tests pass in CI
  - **Estimated effort:** 2-3 hours
  - **Acceptance criteria:** CI workflow includes successful contract compilation

- [ ] **Expand CI/CD matrix**
  - Add security scanning (SAST + dependency audit)
  - Add code coverage reporting
  - Add contract gas optimization checks
  - **Estimated effort:** 2-3 hours

### Makefile Expansion
- [ ] **Add development targets** to Makefile
  - `make test` – Run all tests across all services
  - `make test-gateway` – Gateway tests only
  - `make test-hypervisor` – Hypervisor tests only
  - `make test-grid` – Grid tests only
  - `make test-sandbox` – Sandbox tests only
  - `make lint` – Run all linters (eslint, flake8, go vet)
  - `make build-contracts` – Build smart contracts
  - `make audit` – Run security audit
  - **Estimated effort:** 1-2 hours
  - **Acceptance criteria:** All targets work, `make test` runs all test suites

### Grid zk/zkML Integration Tests
- [ ] **Add zkML verification queue tests**
  - Test queue handling under load
  - Test proof validation
  - Test timeout handling
  - **Estimated effort:** 3-4 hours

- [ ] **Add Hypervisor → Grid integration tests**
  - End-to-end intent processing with zkML verification
  - Test bond lifecycle during processing
  - Test slashing on verification failure
  - **Estimated effort:** 3-4 hours

### Documentation Enhancements
- [ ] **Expand schemas/README.md**
  - Add JSON examples for intent_object.v1.json
  - Add JSON examples for skill_vector.v1.json
  - Add JSON examples for alignment_profile.v1.json
  - **Estimated effort:** 1-2 hours

- [ ] **Update MASTER-INTEGRATION.md** (if needed)
  - Verify alignment with current implementation
  - Add MCP server implementation status
  - Add GPP (Global Pricing Protocol) details
  - **Estimated effort:** 1-2 hours

---

## 🟠 Medium-Long Term (P2 - 1 Month)

### Advanced Feature Implementation
- [ ] **MCP Server Implementation**
  - Create standalone MCP server on port 8081
  - Implement tool discovery for Hypervisor services
  - Add MCP compatibility matrix validation
  - **Estimated effort:** 6-8 hours
  - **See:** [docs/AGENT-ENHANCEMENTS.md](docs/AGENT-ENHANCEMENTS.md)

- [ ] **CCIP Integration** (Cross-Chain Interoperability Protocol)
  - Implement Chainlink CCIP for cross-chain settlement
  - Add L1 → L2 → Grid ledger reconciliation
  - Test cross-chain bond lifecycle
  - **Estimated effort:** 8-12 hours
  - **See:** [docs/MASTER-INTEGRATION.md](docs/MASTER-INTEGRATION.md)

- [ ] **Resource Balancer Enhancements**
  - Implement GPP (Global Pricing Protocol) verification
  - Add treasury split verification tests
  - Implement firewall/rate-limit enforcement
  - **Estimated effort:** 4-6 hours

### Distributed Resilience
- [ ] **Comprehensive peer recovery tests**
  - Archive sync under network degradation
  - Peer rejoining after temporary outages
  - Consensys finality under Byzantine conditions
  - **Estimated effort:** 4-5 hours

- [ ] **Ledger persistence** (if pursuing production database)
  - Implement PostgreSQL ledger backend
  - Add ledger snapshots and recovery
  - **Estimated effort:** 8-10 hours

### Advanced Air-Gap Control
- [ ] **Integrate Rust netns controller** (if pursuing)
  - Wire `airgap.rs` into sandbox orchestration
  - Add namespace-level iptables lockdown
  - Test in CI
  - **Estimated effort:** 6-8 hours

---

## 🔵 Strategic Items (P3 - Planning Phase)

### Operator-Grade Observability
- [ ] **Reasoning auditor with immutable eventing**
  - Implement formal policy engine
  - Add immutable log sink
  - Create operator review UX
  - **Estimated effort:** TBD (significant undertaking)

### Advanced Knowledge Graph
- [ ] **Distributed graph search/ranking**
  - Implement BM25-style ranking across peers
  - Add vector similarity search
  - Improve knowledge retention
  - **Estimated effort:** TBD

### Production Chain Integration
- [ ] **End-to-end chain-integrated bond lifecycle**
  - Move from in-memory to persistent ledger
  - Add on-chain finality guarantees
  - Implement full event reconciliation
  - **Estimated effort:** TBD

---

## Ongoing Maintenance

- [ ] **Weekly dependency updates**
  - `npm outdated` checks
  - `go get -u` reviews
  - `pip list --outdated` checks
  - Create PRs for non-breaking updates

- [ ] **Monthly security audits**
  - Run SAST tools
  - Review code changes
  - Update security findings in AUDIT_REPORT.md

- [ ] **Quarterly documentation reviews**
  - Verify README accuracy
  - Update configuration templates
  - Remove outdated references

---

## Metrics & Success Criteria

| Metric | Current | Target | Timeline |
|--------|---------|--------|----------|
| **Test Coverage** | 50% overall | 80% | End of month |
| **Gateway Coverage** | 30-40% | 80% | 1 week |
| **Sandbox Coverage** | 20-30% | 70% | 1 week |
| **Documentation Completeness** | 80% | 95% | 2 weeks |
| **CI/CD Health** | Good | Excellent | 1 week |
| **Dependency Security** | WARNING | PASS | 2 days |

---

## Dependencies & Blockers

| Item | Blocker | Status | Workaround |
|------|---------|--------|-----------|
| Hardhat compilation | 403 proxy issue | ⚠️ | Use pre-compiled artifacts or proxy bypass |
| Contract deployment | Testnet unavailable | ⚠️ | Use local Hardhat network |
| MCP server specs | Finalization pending | ⚠️ | Use AGENT-ENHANCEMENTS.md as guide |

---

## Document Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-03-17 | 1.0 | Initial creation based on Cleanup & Audit Report |
| TBD | 1.1 | Weekly progress updates |

---

## Quick Links

- **Main README:** [README.md](README.md)
- **Audit Report:** [CLEANUP_AUDIT_REPORT.md](CLEANUP_AUDIT_REPORT.md)
- **Strategic Docs:** [docs/MASTER-INTEGRATION.md](docs/MASTER-INTEGRATION.md), [docs/AGENT-ENHANCEMENTS.md](docs/AGENT-ENHANCEMENTS.md)
- **Service Guides:** [gateway/README.md](gateway/README.md), [hypervisor/README.md](hypervisor/README.md), [sandbox/README.md](sandbox/README.md), [grid/README.md](grid/README.md)
- **Contributing:** See [plan.md](plan.md) for development practices

---

**Project Owner:** @Zoverions  
**Maintained by:** AXIOM-MESH Core Team  
**Last Updated:** March 17, 2026
