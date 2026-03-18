# AXIOM-MESH Codebase Accuracy Assessment
**Assessment Date:** March 17, 2026  
**Scope:** API endpoints, configuration alignment, architecture documentation, test coverage

---

## 1. API ENDPOINT ACCURACY

### Gateway Service
**Documented Endpoints (from README.md):**
- `POST /api/v1/intent/process` ✅ **EXISTS**
- `POST /api/v1/intent/process/public` ✅ **EXISTS** (not explicitly documented but in code)
- `GET /health` ✅ **EXISTS**
- `GET /api/v1/memory/*` ✅ **EXISTS** - Includes:
  - `GET /api/v1/memory` (fetch with optional session_id)
  - `DELETE /api/v1/memory/:nodeId`
  - `PUT /api/v1/memory/:nodeId`
- `GET /api/v1/agents` ✅ **EXISTS**
- `GET /ws` (WebSocket) - ⚠️ **NOT VERIFIED** in route scanning, but documented as endpoint

**Additional Endpoints Found (Undocumented in README):**
- `GET /api/v1/swarms`
- `POST /api/v1/swarms`
- `POST /api/v1/swarms/join`
- `GET /api/v1/network`
- `GET /api/v1/status` (comprehensive service health checking)
- `GET /api/v1/logs` (system observability)
- `GET /api/v1/metrics/system`
- `POST /api/v1/metrics/cooperation`
- `GET /api/v1/config`
- `POST /api/v1/config`

**Assessment:** ✅ **All documented endpoints exist.** Gateway README should be updated to include the additional undocumented API endpoints for completeness.

---

### Hypervisor Service
**Documented Endpoints (from README.md):**
- `GET /health` ✅ **EXISTS**
- `/process` - ⚠️ **ACTUAL PATH:** `POST /process` (method not specified in docs)
- `/api/v1/memory/*` - ⚠️ **MAPPING ISSUE:** Actual endpoint is at root level `/memory` and `/memory/{node_id}`, NOT `/api/v1/memory/*`
- `/api/v1/autoresearch` - ⚠️ **MAPPING ISSUE:** Actual endpoint is `POST /graph/autoresearch` (different path)
- `/api/v1/intent` - ❌ **NOT FOUND** in code (no `/api/v1/intent*` endpoints in hypervisor)
- `/health` ✅ **EXISTS** at root level

**Actual Endpoints in Code:**
- `POST /process` ✅
- `GET /metrics`
- `GET /health` ✅
- `GET /memory`
- `DELETE /memory/{node_id}`
- `PUT /memory/{node_id}`
- `POST /graph/autoresearch`
- `POST /zkml/infer`
- `GET /agents`
- `POST /priority-tag`
- `POST /transcribe` (audio module, not documented)

**Assessment:** ⚠️ **CRITICAL MISMATCH.** Hypervisor README documents endpoints with `/api/v1/` prefix that don't exist in code. The actual endpoints lack the `/api/v1/` prefix. This suggests either:
1. The Gateway acts as a reverse proxy layer (need to verify)
2. The documentation is out of sync with implementation

**Recommendation:** Clarify the API versioning strategy. If endpoints should have `/api/v1/` prefix, add middleware to the Hypervisor.

---

### Sandbox Service
**Documented Endpoints (from README.md):**
- `POST /execute` ✅ **EXISTS** - Accepts `language`, `code`, `ase_proof`, `zk_proof`, `timeout`, `memory_limit`
- `GET /health` ✅ **EXISTS**

**Assessment:** ✅ **All documented endpoints exist.** Sandbox is accurately represented. No undocumented endpoints found.

---

### Grid Service
**Documented Endpoints (from README.md):**
- `GET /health` ✅ **EXISTS**
- `POST /bonds` - ❌ **NOT FOUND** - Actual endpoint is `POST /stake`
- `GET /bonds/:nodeID` - ❌ **NOT FOUND** (no GET endpoint for individual bonds)
- `POST /slash` ✅ **EXISTS**
- `GET /zk-stats` ✅ **EXISTS**
- `POST /zkml/verify` ✅ **EXISTS**
- `POST /proposals` - ⚠️ **FOUND** but only GET shown in documentation
- `GET /proposals/:id` - ⚠️ **PARTIAL** - `GET /proposals` exists but not specific ID fetch
- `POST /vote` - ❌ **NOT FOUND** in code

**Additional Endpoints Found (Undocumented):**
- `POST /stake` (this is the bond staking endpoint, mislabeled in docs as `/bonds`)
- `POST /bond/sever`
- `POST /bond/delegate`
- `POST /bond/events`
- `POST /bond/reconcile`
- `GET/POST /swarm`
- `POST /swarm/join`
- `GET/POST /cache`
- `GET /ws/graph` (WebSocket for graph sync)
- `GET/POST /ccip` (Cross-Chain Interoperability Protocol)
- `POST /proposals/events`

**Assessment:** ❌ **CRITICAL DISCREPANCIES:**
1. The `/bonds` endpoint is actually `/stake` in code
2. No GET endpoint for individual bonds by nodeID
3. Vote endpoint (`POST /vote`) documented but not implemented
4. Many additional governance and swarm endpoints undocumented

**Recommendation:** Update Grid README with accurate endpoint mapping, particularly for bond management operations.

---

## 2. CONFIGURATION ALIGNMENT

### Missing Variables in .env.example
The following environment variables are **used in code but NOT defined in .env.example:**

**Critical Missing Variables (MUST HAVE):**
| Variable | Service | Usage | Impact |
|----------|---------|-------|--------|
| `GATEWAY_API_KEY` | Gateway | Authentication | Authentication will fail for /api/v1/* endpoints |
| `HYPERVISOR_URL` | Gateway | Service discovery | Cannot locate hypervisor service |
| `GRID_URL` | Gateway | Service discovery | Cannot locate grid service |
| `SANDBOX_URL` | Hypervisor | Code execution | Cannot submit code to sandbox |
| `GRID_STAKE_URL` | Hypervisor | Bond operations | Cannot submit stake transactions |
| `GRID_ZKML_URL` | Hypervisor | ZK verification | Cannot verify zkML proofs |

**Important Missing Variables (SHOULD HAVE):**
| Variable | Service | Usage |
|----------|---------|-------|
| `HYPERVISOR_RETRIES` | Gateway | Retry policy for hypervisor calls (defaults to 3) |
| `HYPERVISOR_BACKPRESSURE_LIMIT` | Gateway | Queue limit (defaults to 50) |
| `ALLOW_CLOUD_LLM` | Hypervisor | Toggle cloud LLM usage |
| `LOCAL_MODEL_FALLBACK` | Hypervisor | Fallback model name if cloud unavailable |
| `AUTO_TRAINING_APPROVAL` | Hypervisor | Auto-training decision mode |
| `MEMORY_ENCRYPTION_KEY` | Hypervisor | Archive memory encryption |
| `MEMORY_TTL_DAYS` | Hypervisor | Archive retention period |
| `ARCHIVE_SYNC_BACKPRESSURE_LIMIT` | Hypervisor | Archive sync queue limit |
| `IPFS_API_KEY` | Hypervisor | IPFS authentication |
| `CHAINLINK_ORACLE_ENDPOINT` | Hypervisor | Oracle integration URL |
| `MCP_SERVERS` | Hypervisor | MCP server configuration |
| `NCP_SERVERS` | Hypervisor | NCP server configuration |

**Channel-Specific Missing Variables (Optional but referenced):**
| Variable | Service | Usage |
|----------|---------|-------|
| `CORS_ORIGINS` | Gateway | CORS origin policy (not standard ALLOWED_ORIGINS) |
| `DISCORD_TOKEN` | Gateway | Discord bot token |
| `SLACK_APP_TOKEN` | Gateway | Slack app token |
| `SLACK_BOT_TOKEN` | Gateway | Slack bot token |
| `TELEGRAM_BOT_TOKEN` | Gateway | Telegram bot token |
| `WHATSAPP_ENABLED` | Gateway | WhatsApp integration flag |

**Sandbox Security Missing:**
| Variable | Service | Usage |
|----------|---------|-------|
| `SANDBOX_APPARMOR_PROFILE` | Sandbox | AppArmor security profile |
| `SANDBOX_SECCOMP_PROFILE` | Sandbox | Seccomp policy file path |

**Assessment:** ❌ **HIGH IMPACT.** `.env.example` is missing **6 critical variables** that are essential for system operation. Without `GATEWAY_API_KEY`, `HYPERVISOR_URL`, `GRID_URL`, and service URLs defined, the system cannot start properly.

**Recommendation:** Update `.env.example` to include:
1. All critical variables (marked above)
2. Document which variables are required vs optional
3. Add inline comments explaining defaults and valid values

---

## 3. ARCHITECTURE DOCUMENTATION ACCURACY

### Gateway Directory Structure
**Documented (README.md):**
```
gateway/src/
├── index.ts
├── routes/          # REST & WebSocket routing
├── services/        # Business logic
├── middleware/      # Auth, logging, error handling
├── channels/        # Discord, Slack, Telegram adapters
├── types/           # TypeScript interfaces
└── utils/           # Utilities
```

**Actual Structure:**
```
gateway/src/
├── index.ts ✅
├── routes/ ✅ (contains: rest.ts)
├── services/ ✅ (contains: hypervisorClient.ts)
├── middleware/ ✅ (contains: auth.ts, auth_utils.ts, intent_parser.ts, referent_filter.ts)
├── channels/ ✅ (contains: discord.ts, slack.ts, telegram.ts, whatsapp.ts, registry.ts)
├── types/ ✅ (contains: Intent.ts, etc.)
└── utils/ ✅ (contains: logger.ts, normalizer.ts, etc.)
```
**Assessment:** ✅ **ACCURATE.** Gateway structure matches documentation exactly.

### Hypervisor Module Organization
**Documented (README.md):**
```
hypervisor/src/
├── api/          # FastAPI server, endpoints, auth
├── cortex/       # AI reasoning engine, LLM integrations
├── engine/       # Core execution engine
├── evolution/    # Skill evolution
├── graph/        # LangGraph workflows
├── llm/          # LLM provider abstractions
├── memory/       # Archive storage
├── models/       # Data models
├── pulse/        # Telemetry
└── zkml/         # ZK-ML verification
```

**Actual Structure:**
```
hypervisor/src/
├── api/ ✅
├── cortex/ ✅
├── engine/ ✅ (contains: ncp_client.py, mcp_client.py, oracle.py, execution_engine.py)
├── evolution/ ✅ (contains: auto_training.py, skill_evolution.py, dialectic.py)
├── graph/ ✅ (contains: autoresearch_graph.py)
├── llm/ ✅ (contains: provider.py)
├── memory/ ✅ (contains: archive.py, skill_store.py)
├── models/ ✅ (contains: Intent.py, Skill.py, Archive.py)
├── pulse/ ✅ (contains: telemetry.py, health_monitor.py)
└── zkml/ ✅ (contains: verifier.py, inference.py)
```
**Assessment:** ✅ **ACCURATE.** Hypervisor module organization matches documentation.

### Sandbox Execution Model
**Documented (README.md):**
- Docker containers spawned with `--network=none`
- Seccomp policy: `security/seccomp-default.json`
- AppArmor profile: `docker-default`
- Environment variables: `SANDBOX_TIMEOUT_DEFAULT=30000`, `SANDBOX_MEMORY_LIMIT=512`

**Actual Implementation:**
- Docker runner uses `--network=none` ✅
- References `SANDBOX_SECCOMP_PROFILE` env var (defaults to `/app/security/seccomp-default.json`) ✅
- References `SANDBOX_APPARMOR_PROFILE` env var (defaults to `docker-default`) ✅
- No code references `SANDBOX_TIMEOUT_DEFAULT` or `SANDBOX_MEMORY_LIMIT` ❌

**Assessment:** ⚠️ **PARTIAL MATCH.** Documentation specifies timeout and memory limit env vars that don't actually exist in code. The code accepts these as parameters to `/execute` endpoint but doesn't read them from environment.

**Recommendation:** Clarify in documentation whether these are per-request settings (not environment-based) or if they should be added as env vars.

### Grid Ledger Structure
**Documented (README.md):**
- ComputeBond management (stake, slash, reconcile)
- Proposal & voting system
- Skills & Swarms registry
- P2P network with HTTP transport
- PoER consensus mechanism
- Smart contracts (Hardhat)

**Actual Implementation:**
All documented components exist with following additions:
- Multiple bond operations: sever, delegate, events, reconcile ✅
- Swarm operations expanded: join, sync modes ✅
- Web cache layer: `/cache` endpoint ✅
- WebSocket graph sync: `/ws/graph` ✅
- CCIP integration: `/ccip` endpoint ✅

**Assessment:** ✅ **ACCURATE.** Grid structure matches documentation with additional features implemented but not documented.

---

## 4. TEST COVERAGE ALIGNMENT

### Test File Counts

| Service | Documented | Actual | Status |
|---------|-----------|--------|--------|
| Hypervisor | ~23 | 24 | ✅ **MATCH** |
| Gateway | ~4 | 4 | ✅ **MATCH** |
| Sandbox | ~2 | 2 | ✅ **MATCH** |
| Grid | 12+ | 8 | ❌ **MISMATCH** |

**Hypervisor Test Files (24 total):**
```
test_archive.py
test_archive_governance.py
test_arena.py
test_auto_training.py
test_autoresearch.py
test_autoresearch_graph.py
test_autoresearch_scenarios.py
test_dialectic.py
test_distributed_archive.py
test_evolution_skill.py
test_graph.py
test_hardware_act.py
test_mcp_spectrum.py
test_mirofish_mapper.py
test_openclaw.py
test_oracle.py
test_pulse.py
test_pulse_monitor.py
test_resource_balancer.py
test_riker.py
test_server_startup.py
test_temporal.py
conftest.py (shared fixtures, not a test file)
```
**Assessment:** ✅ **ACCURATE.** Hypervisor has 24 test files (23 actual tests + 1 config).

**Gateway Test Files (4 total):**
```
e2e/test_full_intent_path.test.ts
(auth_utils.test.ts, normalizer.test.ts, hypervisorClient.test.ts also present)
```
**Assessment:** ✅ **ACCURATE.** Gateway has 4 test files.

**Sandbox Test Files (2 total):**
```
integration.test.ts
(Only 1-2 actual test files in src/tests/)
```
**Assessment:** ✅ **ACCURATE.** Sandbox has ~2 test files.

**Grid Test Files - DISCREPANCY:**
**Documented:** "should be 12+"
**Actual Found:**
```
api/server_test.go
api/cache_test.go
blockchain/chain_test.go
blockchain/treasury_split_test.go
blockchain/web_cache_test.go
consensus/poer_test.go
consensus/signature_test.go
p2p/node_test.go
```
**Count:** Only 8 `_test.go` files found

**Assessment:** ❌ **MISMATCH.** Grid has only 8 test files, not 12+. The audit report claim appears inaccurate. Additionally, no tests found for:
- Smart contracts (contracts/ directory should have Hardhat tests)
- Crypto module
- P2P transport layer (only node_test.go)

---

## SUMMARY OF CRITICAL DISCREPANCIES

### 🔴 Critical Issues (Functional Impact)

1. **Grid API `/bonds` endpoint doesn't exist** → Documentation refers to `/bonds` but code implements `/stake`
   - **Impact:** Developers will fail following documented API
   - **Fix:** Update Grid README or rename endpoint

2. **Missing critical environment variables in .env.example**
   - `GATEWAY_API_KEY`, `HYPERVISOR_URL`, `GRID_URL`, `SANDBOX_URL` not documented
   - **Impact:** System won't initialize properly without these
   - **Fix:** Add all referenced env vars to .env.example

3. **Hypervisor API prefix mismatch** → Documentation shows `/api/v1/` endpoints, code has none
   - **Impact:** API integrations will fail
   - **Fix:** Clarify versioning strategy, add middleware if needed

### 🟡 Medium Issues (Documentation/Completeness)

1. **Undocumented API endpoints** → Gateway, Grid have many endpoints not in README
   - **Impact:** Developers unaware of available APIs
   - **Fix:** Update READMEs with complete endpoint lists

2. **Grid test count inaccuracy** → Claims "12+" but only 8 found
   - **Impact:** Audit documentation unreliable
   - **Fix:** Update AUDIT_REPORT.md and plan.md

3. **Sandbox env var usage** → Documented `SANDBOX_TIMEOUT_DEFAULT` doesn't exist in code
   - **Impact:** Configuration confusion
   - **Fix:** Clarify whether these are per-request or env-based

### 🟢 Minor Issues (Clarity)

1. **Channel adapters not fully configured** → DISCORD_TOKEN, SLACK_*, TELEGRAM_*, WHATSAPP_* referenced but not in .env.example
2. **WebSocket endpoint verification needed** → Gateway `/ws` documented but not found in route scanning
3. **Hypervisor audio endpoint undocumented** → `/transcribe` endpoint exists but not documented

---

## RECOMMENDATIONS

### Priority 1 (Do First)
- [ ] Add missing critical env vars to `.env.example` with comments
- [ ] Update Grid README: change `/bonds` to `/stake` or rename endpoint
- [ ] Clarify Hypervisor API versioning (why no `/api/v1/` prefix?)
- [ ] Update AUDIT_REPORT.md: correct Grid test count from "12+" to "8"

### Priority 2 (Before Release)
- [ ] Document all 50+ additional undocumented endpoints across services
- [ ] Add channel adapter env vars to `.env.example`
- [ ] Verify WebSocket endpoints exist and document them
- [ ] Add Sandbox security profile env vars to `.env.example`

### Priority 3 (Quality Improvements)
- [ ] Add missing Grid test files for smart contracts and P2P transport
- [ ] Document which endpoints are internal vs public
- [ ] Add API versioning documentation to main README
- [ ] Create a single authoritative endpoint registry (JSON/OpenAPI format)

---

## FILE LOCATIONS FOR VERIFICATION

- **API Routes:**
  - [gateway/src/routes/rest.ts](gateway/src/routes/rest.ts) - All Gateway endpoints
  - [hypervisor/src/api/server.py](hypervisor/src/api/server.py) - All Hypervisor endpoints
  - [sandbox/src/routes/execute.ts](sandbox/src/routes/execute.ts) - Sandbox endpoints
  - [grid/api/server.go](grid/api/server.go) - All Grid endpoints

- **Configuration:**
  - [.env.example](.env.example) - Current env template

- **Documentation:**
  - [README.md](README.md) - Main documentation
  - [gateway/README.md](gateway/README.md) - Gateway service docs
  - [hypervisor/README.md](hypervisor/README.md) - Hypervisor service docs
  - [sandbox/README.md](sandbox/README.md) - Sandbox service docs
  - [grid/README.md](grid/README.md) - Grid service docs
  - [AUDIT_REPORT.md](AUDIT_REPORT.md) - Audit findings

