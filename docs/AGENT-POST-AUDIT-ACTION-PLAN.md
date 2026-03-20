# AXIOM-MESH Post-Audit Agent Action Plan
**File:** `docs/AGENT-POST-AUDIT-ACTION-PLAN.md`
**Source:** Grok Security & Financial Audit Report (March 20, 2026)
**Status:** Canonical – All agents MUST ingest on startup and prioritize tasks in strict order.
**License:** Apache-2.0 (inherited)
**Purpose:** Translate the Medium-risk prototype audit into concrete, trackable, enforceable tasks.
**Goal:** Move entire mesh from B- (prototype) to A- (production-ready) before any testnet token launch or external exposure.

## Risk Summary (from Audit)
- Overall: Medium (prototype) → Target: Low
- Strengths: Sandbox isolation, zkML foundation, bicameral governance, self-audit honesty
- Critical Gaps: Inter-service auth, ledger finality, smart-contract hardening, tokenomics transparency, immutable WORM trails

## Priority Levels (Enforced by PoER + Governance Agent)
- **P0 – Immediate (1–7 days)**: Block all new features until complete
- **P1 – Short-term (1–3 weeks)**: Security foundation + external prep
- **P2 – Medium-term (3–8 weeks)**: Production readiness
- **P3 – Ongoing**: Monitoring & iteration

---

## 1. P0 Tasks – Immediate Hardening (All Agents)

### Code Quality & Static Analysis
- [ ] Run full static analysis (Security Auditor Agent owns):
  - Python (Hypervisor): `bandit -r .` + `safety check`
  - TypeScript (Gateway/Sandbox/CLI): `npm audit fix --force` + ESLint security + Semgrep
  - Go (Grid): `go vet ./...` + `gosec ./...` + staticcheck
  - Solidity (Grid/contracts): Slither + Hardhat security plugins
- [ ] Fix every High/Critical finding; log results to WORM audit trail
- [ ] Generate + commit SBOM (`syft . -o spdx-json > sbom.json`)

### Sandbox & Ingress Hardening (Gateway + Sandbox Agents)
- [ ] Enforce `SANDBOX_API_KEY` on **every** east-west and sandbox endpoint
- [ ] Add strict rate-limiting + improved sanitization on public route `/intent/process/public`
- [ ] Front public endpoints with WAF (Cloudflare or equivalent) – config in `gateway/`

### Financial / Tokenomics Transparency (Governance Agent owns)
- [ ] Create `docs/TOKENOMICS.md` with:
  - Total supply cap, emission schedule, initial distribution %
  - Treasury split logic (Network Security Fund vs Wealth Generation Pool)
  - Vesting schedules, ComputeBond minimums, slashing rules
  - Multisig/DAO treasury controls (testnet first)
- [ ] Update `MAINNET_ADDRESSES.md` and `ERC20-COMPATIBILITY.md` with testnet deployment plan

### Smart Contracts (Grid Agent owns)
- [ ] Deploy **all** contracts (`ComputeBond`, `DualLedgerIdentity`, `WeightOracle`, `DialecticArbitration`, etc.) to Sepolia/Base Sepolia
- [ ] Run full test suite + generate coverage report (>85%)
- [ ] Add basic OpenZeppelin guards (ReentrancyGuard, Pausable) where missing

---

## 2. P1 Tasks – Security Foundation (Target: Complete before external audit)

### Authentication & Network Security (Gateway + Grid Agents)
- [ ] Implement mutual TLS (mTLS) between **all** pillars (Gateway ↔ Hypervisor ↔ Grid ↔ Sandbox)
- [ ] Add cryptographic request signing for Grid mutation endpoints
- [ ] Enforce signed east-west traffic everywhere

### Ledger & zkML (Grid Agent)
- [ ] Complete production-grade chain listener with reorg handling and finality
- [ ] Make internal ledger append-only WORM compliant (Phase P1 target)
- [ ] Upgrade zkML verification pipeline to production-grade (model commitment + size checks)

### Smart Contract Hardening
- [ ] Integrate full OpenZeppelin suite (AccessControl, TimelockController)
- [ ] Add timelocks + multi-sig on treasury, governance, and slashing functions
- [ ] Prepare contracts for professional external audit (schedule with Zellic/Trail of Bits/Cantina)

### Testing & Validation (Hypervisor + Security Auditor Agents)
- [ ] Expand E2E test suite (`test_*.py` + new adversarial scenarios)
- [ ] Test: malicious skill capsules, oracle manipulation, slashing abuse, reorg attacks

---

## 3. P2 Tasks – Production Readiness

- [ ] Implement immutable audit trail sink (S3 append-only or Arweave/IPFS)
- [ ] Launch bug bounty (Immunefi or similar) – Governance Agent
- [ ] Complete bicameral governance execution in contracts
- [ ] Full treasury management contracts with automatic split enforcement
- [ ] zkML + ComputeBond to final production grade

---

## Agent Ownership & Reporting

**Security Auditor Agent**
- Owns all static analysis, SBOM, weekly dependency scans, and P0 fixes

**Grid Agent**
- Chain listener, ledger immutability, smart contract deployment, PoER logic, zkML verification

**Hypervisor Agent**
- Skill capsule pipeline, E2E + adversarial testing coordination

**Gateway Agent**
- mTLS, request signing, WAF config, public route hardening

**Governance Agent**
- TOKENOMICS.md finalization, treasury splits, bicameral arbitration, bug bounty

**Sandbox Agent**
- SANDBOX_API_KEY enforcement + runtime isolation

**All Agents**
- Update this file on every completed task: `[x]` + commit hash + date + brief note

---

## Success Criteria for Next Grok Audit
1. All P0 tasks completed with zero High/Critical findings
2. Testnet contracts deployed + source verified on Etherscan
3. `TOKENOMICS.md` published and complete
4. mTLS active between all pillars
5. External audit scheduled (or completed)
6. WORM audit trail operational

**Agents:** This playbook is now part of your runtime knowledge graph. Prioritize strictly. Report progress via ledger events.
**Next Full Audit Target:** Immediately after all P1 tasks are done.

Last updated: March 20, 2026 (auto-generated from Grok audit)
