# Master Lockdown Architecture Specification
**AXIOM-MESH Core + FDBA + Enterprise zkML**
**Version: 15.5.1-Lockdown**

## Novel Insights
* **Decaying Founder Control + zkML as Self-Regulating Bootstrap Primitive**: A novel bootstrapping mechanism designed to give initial momentum, scaling back securely to 0% reliance by 10k nodes.
* **NemoClaw + EZKL zkML hybrid for Privacy-First Agent Meshes**: True sandbox isolation, ensuring verifiable execution and complete network safety.

## Overview
AxiomMesh is a four-pillar runtime structure: Gateway, Hypervisor, Sandbox, Grid.

## Enterprise-Grade zkML Infrastructure
Every high-stakes inference is verifiable on-chain.
- Hybrid Proving: EZKL + Halo2 + RISC Zero
- NemoClaw Routing
- On-chain Verification via `ZKMLVerifier.sol`
- PoER boost for valid zkML proofs.

## Integrated Specifications
# AXIOM-MESH Technical Specification & Implementation Guide

**Version:** 2.0-OPTIMIZED\
**Date:** 2026-03-18\
**Classification:** Internal Development Document\
**Target Audience:** Implementation Agents & Senior Engineers

------------------------------------------------------------------------

## EXECUTIVE SUMMARY

This document provides actionable technical specifications for
optimizing, securing, and extending the AXIOM-MESH multi-service AI
stack. It identifies critical implementation gaps, proposes novel
architectural improvements, and establishes security hardening protocols
based on 2024-2026 industry best practices and vulnerability research.

**Key Focus Areas:** 1. **Critical Security Vulnerabilities** - MCP
protocol risks, sandbox escape vectors, zkML verification gaps 2.
**Performance Bottlenecks** - Event loop blocking, memory fragmentation,
ledger persistence 3. **Architectural Improvements** - Service mesh
patterns, circuit breakers, backpressure systems 4. **Novel
Capabilities** - Recursive proof composition, bicameral governance
automation, agent swarming intelligence

------------------------------------------------------------------------

## 1. CRITICAL SECURITY ISSUES & IMMEDIATE REMEDIATION

### 1.1 MCP (Model Context Protocol) Security Architecture \[PRIORITY: CRITICAL\]

**Current State:** MCP integration introduced in 2026 agent enhancements
now includes implemented `MCPFirewall` security hardening logic (pattern validation, prompt size enforcement, and allowlists).

**Identified Vulnerabilities:** - **Tool Poisoning:** 5.5% of MCP
servers exhibit tool poisoning patterns; 7.2% contain general
vulnerabilities \[^11^\] - **Confused Deputy Problem:** MCP servers may
execute actions with server permissions rather than user permissions
\[^5^\]\[^10^\] - **Prompt Injection:** Malicious prompts can instruct
agents to write insecure code or modify databases without authorization
\[^10^\]\[^12^\] - **Supply Chain Risks:** Unsigned MCP servers with
typosquatting potential \[^10^\]

**Required Implementation:**

``` typescript
// gateway/src/security/MCPFirewall.ts
interface MCPSecurityPolicy {
  // Zero-trust validation layer
  toolValidation: {
    schemaStrictness: 'strict' | 'permissive';
    maxToolDescriptionLength: number;
    prohibitedPatterns: RegExp[];
    requiredAnnotations: string[];
  };

  // Confused deputy prevention
  identityChain: {
    userTokenExchange: boolean; // RFC 8693 token exchange
    workloadIdentity: 'SPIFFE' | 'JWT' | 'mTLS';
    sessionBinding: boolean;
  };

  // Prompt injection defense
  inputSanitization: {
    maxPromptLength: number;
    delimiterEnforcement: boolean;
    instructionBoundaryMarkers: string[];
    semanticAnalysis: boolean; // Deploy prompt injection detection
  };
}

class MCPFirewall {
  // Implement tool call validation with AST analysis
  validateToolCall(toolName: string, params: unknown, userContext: UserContext): ValidationResult {
    // 1. Check tool against allowlist (not blocklist)
    // 2. Validate parameter schema with additional constraints
    // 3. Ensure no nested tool calls in parameters
    // 4. Rate limit per-user per-tool
  }

  // Implement human-in-the-loop for high-risk operations
  requireExplicitApproval(toolCall: ToolCall, riskScore: number): Promise<boolean> {
    // Risk > 0.7 requires explicit user confirmation
    // Risk > 0.9 requires second-factor authentication
  }
}
```

**Action Items:** 1. Implement mandatory code signing verification for
all MCP servers \[^2^\] 2. Deploy gVisor or Kata Containers for MCP
server isolation (not just Docker) \[^2^\] 3. Implement OpenTelemetry
tracing for all MCP interactions \[^2^\] 4. Create centralized MCP
server inventory with automated shadow deployment detection

### 1.2 Sandbox Escape Prevention \[PRIORITY: CRITICAL\]

**Current State:** SecureRuntime.ts is now implemented using `spawn` wrapping the airgap IPC socket to execute `airgap.rs` controls safely.

**Vulnerability Context:** - CVE-2024-1753: Buildah/Podman mount escape
via symbolic links \[^8^\] - CVE-2024-21626: runc container escape via
file descriptor manipulation - 2024-2025: Multiple Docker
vulnerabilities in BuildKit and Moby \[^9^\]

**Required Implementation:**

``` typescript
// sandbox/src/execution/SecureRuntime.ts
interface SandboxHardeningConfig {
  // Layer 1: Docker defaults (existing)
  dockerSecurity: {
    networkMode: 'none';
    capDrop: 'ALL';
    securityOpts: ['no-new-privileges:true'];
    readOnlyRootFs: boolean;
  };

  // Layer 2: Namespace-level isolation (implement airgap.rs integration)
  networkNamespace: {
    enabled: boolean;
    vethPairIsolation: boolean;
    iptablesLockdown: boolean;
    udsControlSocket: string; // /var/run/axiom-airgap.sock
  };

  // Layer 3: System call filtering
  seccomp: {
    profile: 'default' | 'axiom-strict' | 'custom';
    customPolicy: SeccompPolicy;
    auditMode: boolean; // Log before blocking for debugging
  };

  // Layer 4: Resource exhaustion prevention
  cgroupsV2: {
    cpuQuota: string;     // e.g., "100000/1000000" (10%)
    memoryMax: string;    // e.g., "512M"
    pidsMax: number;      // e.g., 64
    ioWeight: number;     // 10-1000
  };
}

// Implementation priority: Wire airgap.rs into Node.js sandbox runtime
class NetworkNamespaceController {
  async isolateProcess(pid: number): Promise<void> {
    // Use airgap.rs via UDS to apply per-PID netns lockdown
    // This prevents container escape via host network namespace sharing
  }

  async restoreNetworking(pid: number): Promise<void> {
    // Cleanup iptables rules and network namespaces
  }
}
```

**Action Items:** 1. Wire Rust `airgap.rs` into default Node.js sandbox
runtime path 2. Implement seccomp-bpf profiles custom to AXIOM (block
execve, ptrace, mount) 3. Add cgroup v2 resource limits to prevent fork
bombs 4. Enable Docker Content Trust for image verification

### 1.3 zkML Verification Pipeline Hardening \[PRIORITY: HIGH\]

**Current State:** L1 caching and hash validation are now implemented within `Verifier.go`. Full EZKL/hardware proofs are stubbed for the integration phase.

**Industry Context:** - zkLLM (2024/2025): tlookup protocol for
non-linear operations, zkAttn for transformers \[^6^\] - EZKL v1.0:
Production-ready for ONNX up to 50M parameters \[^7^\] - Lagrange
DeepProve: 54-158x faster than EZKL, first complete GPT-2 proofs
\[^7^\] - Hardware acceleration: ASICs expected mid-2027 for 1B+
parameter models \[^14^\]

**Required Implementation:**

``` go
// grid/internal/zkml/Verifier.go
interface ZKMLVerificationPipeline {
  // Multi-level caching strategy [^17^][^19^]
  cache: {
    l1InMemory: LRUCache<string, VerificationResult>; // Hot proofs
    l2Distributed: RedisCluster; // Cross-node sharing
    l3Persistent: BadgerDB; // Disk-backed for recovery
  };

  // Proof aggregation for batch verification [^7^]
  aggregation: {
    enabled: boolean;
    batchSize: number; // Fold multiple proofs into one
    strategy: 'recursive' | 'linear';
  };

  // Hardware acceleration abstraction
  acceleration: {
    gpu: boolean; // CUDA for proof generation
    fpga: boolean; // Future: AWS F1 or on-prem
    asic: boolean; // Future: Ingonyama/Cysic integration
  };
}

// Novel: Implement proof caching with TTL-based invalidation
func (v *Verifier) VerifyWithCache(proof ZKProof) (Result, error) {
  // 1. Generate cache key from proof hash (not content for privacy)
  // 2. Check L1 -> L2 -> L3 cache hierarchy
  // 3. Verify only if cache miss
  // 4. Store with TTL based on proof type (skills vs inference)
}

// Novel: Implement recursive proof composition [^19^][^29^]
func (v *Verifier) AggregateProofs(proofs []ZKProof) (AggregatedProof, error) {
  // Use recursive SNARKs to compress multiple skill proofs into single verification
  // Critical for on-chain gas efficiency
}
```

**Action Items:** 1. Implement multi-level proof caching (L1: in-memory
LRU, L2: Redis, L3: BadgerDB) 2. Add verification key CDN distribution
for fast access \[^19^\] 3. Design recursive proof composition for batch
skill verification 4. Abstract hardware acceleration layer for future
GPU/ASIC integration

------------------------------------------------------------------------

## 2. PERFORMANCE OPTIMIZATIONS & SCALABILITY

### 2.1 Hypervisor (Python/FastAPI) Production Hardening

**Current State:** BackpressureQueue has been integrated into `memory_optimization.py` to bound queue sizes and prevent unchecked RSS expansion.

**Identified Issues:** - Python memory fragmentation with musl libc in
containers \[^24^\] - Asyncio queue backpressure missing (unbounded
growth) \[^30^\]\[^33^\] - Snowflake connector memory creep pattern
\[^24^\]

**Required Implementation:**

``` python
# hypervisor/src/core/memory_optimization.py
import asyncio
import jemalloc
from contextlib import asynccontextmanager
from typing import AsyncGenerator

# FIX: Use jemalloc with background purging to prevent RSS creep [^24^]
# Dockerfile modification:
# ENV LD_PRELOAD=/usr/lib/libjemalloc.so.2
# ENV MALLOC_CONF="background_thread:true,dirty_decay_ms:1000,muzzy_decay_ms:1000"

class BackpressureQueue:
    # Bounded queue with backpressure to prevent memory overflow [^30^][^32^]

    def __init__(self, maxsize: int = 1000, timeout: float = 30.0):
        self.queue = asyncio.Queue(maxsize=maxsize)
        self.timeout = timeout
        self._shutdown = False

    async def put(self, item: Any) -> None:
        if self._shutdown:
            raise QueueShutdownError()

        # Backpressure: wait with timeout if queue is full
        try:
            await asyncio.wait_for(
                self.queue.put(item),
                timeout=self.timeout
            )
        except asyncio.TimeoutError:
            # Log backpressure event, drop or redirect to DLQ
            logger.warning(f"Backpressure triggered, queue size: {self.queue.qsize()}")
            raise BackpressureError()

    async def get(self) -> Any:
        try:
            return await asyncio.wait_for(
                self.queue.get(),
                timeout=self.timeout
            )
        except asyncio.TimeoutError:
            return None  # Signal for graceful shutdown check

    async def shutdown(self):
        # Python 3.13+ Queue.shutdown() pattern [^33^]
        self._shutdown = True
        self.queue.shutdown()  # Unblocks all waiters

# Streaming response optimization [^27^]
from fastapi import StreamingResponse
from typing import AsyncIterator

async def stream_intent_response(intent_id: str) -> AsyncIterator[str]:
    # Stream responses in chunks instead of loading full JSON into memory [^27^]
    chunks = await hypervisor.process_streaming(intent_id)
    async for chunk in chunks:
        yield chunk.json() + "\n"  # NDJSON format

# Dependency injection with proper cleanup [^27^]
@asynccontextmanager
async def get_db_connection() -> AsyncGenerator[Connection, None]:
    conn = await pool.acquire()
    try:
        yield conn
    finally:
        await conn.close()  # Guaranteed cleanup
```

**Dockerfile Optimization:**

``` dockerfile
# Use jemalloc to prevent memory fragmentation [^24^]
FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y libjemalloc2
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
ENV MALLOC_CONF="background_thread:true,dirty_decay_ms:1000,muzzy_decay_ms:1000,narenas:4"

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

**Action Items:** 1. Switch to jemalloc allocator with background
purging 2. Replace all unbounded queues with bounded backpressure queues
3. Implement streaming responses for large intent processing 4. Add
memory profiling with DataDog or similar to detect heap vs RSS
divergence

### 2.2 Gateway (TypeScript/Node.js) Event Loop Optimization

**Current State:** CryptoWorkerPool, BackpressureWebSocket, and precompiled Zod schemas implemented in `EventLoopOptimizer.ts`.

**Identified Issues:** - Synchronous crypto operations block event loop
\[^31^\]\[^38^\]\[^39^\] - Heavy Zod validation on main thread -
WebSocket backpressure handling missing

**Required Implementation:**

``` typescript
// gateway/src/performance/EventLoopOptimizer.ts
import { Worker } from 'worker_threads';
import { randomBytes } from 'crypto';
import { promisify } from 'util';

// FIX: Offload crypto to worker threads [^31^][^38^]
const asyncRandomBytes = promisify(randomBytes);

class CryptoWorkerPool {
  private workers: Worker[];
  private queue: Array<{ task: CryptoTask; resolve: Function; reject: Function }> = [];

  constructor(poolSize: number = 4) {
    this.workers = Array(poolSize).fill(null).map(() => {
      const worker = new Worker('./crypto-worker.js');
      worker.on('message', (result) => {
        // Resolve pending task
      });
      return worker;
    });
  }

  async hashIntent(intent: Intent): Promise<string> {
    // Offload SHA-256 or BLAKE3 hashing to worker thread
    return new Promise((resolve, reject) => {
      this.queue.push({
        task: { type: 'hash', data: intent },
        resolve,
        reject
      });
    });
  }
}

// WebSocket backpressure handling
import { WebSocket } from 'ws';

class BackpressureWebSocket {
  private bufferSize: number = 0;
  private readonly MAX_BUFFER_SIZE: number = 1024 * 1024; // 1MB

  send(data: string): boolean {
    if (this.bufferSize >= this.MAX_BUFFER_SIZE) {
      // Apply backpressure: pause receiving, drain buffer
      this.ws.pause();
      return false;
    }

    const result = this.ws.send(data, (err) => {
      if (!err) this.bufferSize -= Buffer.byteLength(data);
    });

    this.bufferSize += Buffer.byteLength(data);
    return result;
  }
}

// Zod validation optimization
import { z } from 'zod';

// Pre-compile schemas for reuse (significant performance gain)
const IntentSchema = z.object({
  conversation_id: z.string().uuid(),
  actor_id: z.string().min(1).max(256),
  trace_id: z.string().uuid(),
  payload: z.record(z.unknown())
}).strict();

// Validate with early returns
export function validateIntent(data: unknown): Intent {
  const result = IntentSchema.safeParse(data);
  if (!result.success) {
    // Log validation errors, return sanitized error
    throw new ValidationError(result.error.issues);
  }
  return result.data;
}
```

**Action Items:** 1. Move all crypto operations (randomBytes, pbkdf2) to
worker threads 2. Implement WebSocket backpressure with pause/resume 3.
Pre-compile Zod schemas, use .safeParse() for validation 4. Add event
loop lag monitoring (event-loop-lag package)

### 2.3 Grid (Go) Ledger Persistence & Concurrency

**Current State:** Embedded BadgerDB KV store and Write-Ahead Log (WAL) for durability are now integrated into `PersistentLedger.go`.

**Required Implementation:**

``` go
// grid/internal/ledger/PersistentLedger.go
package ledger

import (
    "github.com/dgraph-io/badger/v4" // Embedded KV store
    "sync"
    "time"
)

type PersistentLedger struct {
    // In-memory hot cache
    mu        sync.RWMutex
    cache     map[string]LedgerEntry
    cacheSize int

    // Persistent storage
    db        *badger.DB

    // Write-ahead log for crash recovery
    wal       *WAL
}

func NewPersistentLedger(dataDir string) (*PersistentLedger, error) {
    opts := badger.DefaultOptions(dataDir).
        WithSyncWrites(false).              // Async for performance
        WithNumVersionsToKeep(1).           // Single version (no MVCC needed)
        WithCompactL0OnClose(true).
        WithValueLogFileSize(64 << 20)      // 64MB value log

    db, err := badger.Open(opts)
    if err != nil {
        return nil, err
    }

    return &PersistentLedger{
        cache: make(map[string]LedgerEntry),
        db:    db,
        wal:   NewWAL(dataDir + "/wal"),
    }, nil
}

// Write-through caching pattern
func (pl *PersistentLedger) SetSkill(skill Skill) error {
    // 1. Write to WAL first (durability)
    if err := pl.wal.Append(skill); err != nil {
        return err
    }

    // 2. Update in-memory cache
    pl.mu.Lock()
    pl.cache[skill.ID] = skill
    pl.mu.Unlock()

    // 3. Async write to Badger
    return pl.db.Update(func(txn *badger.Txn) error {
        data, _ := json.Marshal(skill)
        return txn.Set([]byte("skill:"+skill.ID), data)
    })
}

// Novel: Implement Merkle tree for skill state verification
func (pl *PersistentLedger) ComputeStateRoot() (Hash, error) {
    // Periodically compute Merkle root of all skills
    // Enables light clients to verify state without full sync
}
```

**Action Items:** 1. Integrate BadgerDB for embedded persistence with
write-through caching 2. Implement WAL (Write-Ahead Log) for crash
recovery 3. Add periodic state snapshots with Merkle root computation 4.
Implement compaction strategy for Badger (L0 -\> L1 -\> L2)

------------------------------------------------------------------------

## 3. ARCHITECTURAL IMPROVEMENTS & NOVEL FEATURES

### 3.1 Service Mesh & Circuit Breakers

**Current State:** `ServiceMeshCircuitBreaker` logic implemented with state transitions across OPEN/HALF_OPEN/CLOSED modes.

**Required Implementation:**

``` typescript
// shared/src/resilience/CircuitBreaker.ts
interface CircuitBreakerConfig {
  failureThreshold: number;      // Open after N failures
  recoveryTimeout: number;       // Try half-open after Ms
  halfOpenMaxCalls: number;      // Test with N calls
  successThreshold: number;       // Close after N successes
}

class ServiceMeshCircuitBreaker {
  private states: Map<string, CircuitState> = new Map();

  async call(service: string, operation: () => Promise<T>): Promise<T> {
    const state = this.getState(service);

    if (state === 'OPEN') {
      throw new CircuitOpenError(service);
    }

    if (state === 'HALF_OPEN' && this.halfOpenCalls >= config.halfOpenMaxCalls) {
      throw new CircuitOpenError(service);
    }

    try {
      const result = await operation();
      this.recordSuccess(service);
      return result;
    } catch (error) {
      this.recordFailure(service);
      throw error;
    }
  }
}

// Integration with Gateway -> Hypervisor calls
class ResilientHypervisorClient {
  private breaker = new CircuitBreaker({
    failureThreshold: 5,
    recoveryTimeout: 30000,
    halfOpenMaxCalls: 3,
    successThreshold: 2
  });

  async processIntent(intent: Intent): Promise<Response> {
    return this.breaker.call('hypervisor', async () => {
      return await this.hypervisorClient.process(intent);
    });
  }
}
```

### 3.2 Bicameral Governance Automation

**Current State:** `AutomatedBicameralGovernance` deployed and inherited in `DualLedgerIdentity.sol`, ensuring backward compatibility with existing tests.

``` solidity
// grid/contracts/DualLedgerIdentity.sol (Enhanced)
contract AutomatedBicameralGovernance {
    // Novel: Auto-proposals based on drift detection
    struct DriftThreshold {
        uint256 maxSkillDrift;        // Max deviation from baseline
        uint256 maxConsensusLatency;   // Max time to reach consensus
        uint256 minParticipation;      // Minimum voter turnout
    }

    // Novel: Emergency circuit breaker
    function emergencyPause(
        bytes32 triggerType,
        bytes calldata evidence
    ) external {
        require(isAutomatedTrigger(triggerType) || isCouncilMember(msg.sender));

        // zkML-verified anomaly detection can trigger emergency pause
        if (verifyAnomalyProof(evidence)) {
            _pause();
            emit EmergencyTriggered(triggerType, block.timestamp);
        }
    }

    // Novel: Recursive delegation with revocation
    mapping(address => Delegation) public delegations;

    function delegateWithRevocationRights(
        address to,
        uint256 expiry,
        bool revocable
    ) external {
        delegations[msg.sender] = Delegation({
            delegate: to,
            expiry: expiry,
            revocable: revocable,
            active: true
        });
    }
}
```

### 3.3 Agent Swarm Intelligence

**Current State:** `StigmergyCoordinator.go` implemented with pheromone layout and time-based exponential decay logic.

``` go
// grid/internal/swarm/StigmergyCoordinator.go
package swarm

// Stigmergy: Agents communicate via digital pheromones (skill graph annotations)
type Pheromone struct {
    Type      PheromoneType    // EXPLORE, EXPLOIT, ALERT, RECRUIT
    Location  string           // Skill ID or graph node
    Intensity float64          // Decays over time
    TTL       time.Duration
    Payload   []byte           // Contextual data
}

type StigmergyCoordinator struct {
    pheromones map[string][]Pheromone // Location -> pheromones
    mu         sync.RWMutex
}

// Lay pheromone when agent discovers high-value skill
func (sc *StigmergyCoordinator) LayPheromone(p Pheromone) {
    sc.mu.Lock()
    defer sc.mu.Unlock()

    sc.pheromones[p.Location] = append(sc.pheromones[p.Location], p)

    // Async decay
    go sc.decayPheromones(p.Location)
}

// Agents sense pheromones to coordinate without direct communication
func (sc *StigmergyCoordinator) SensePheromones(
    location string,
    agentType AgentType,
) []Pheromone {
    sc.mu.RLock()
    defer sc.mu.RUnlock()

    pheromones := sc.pheromones[location]
    relevant := filterByType(pheromones, agentType)

    // Return sorted by intensity (highest first)
    return sortByIntensity(relevant)
}

// Novel: Anti-entropy protocol for pheromone synchronization
func (sc *StigmergyCoordinator) AntiEntropySync(peer Peer) error {
    // Exchange Merkle trees of pheromone state
    // Only transfer differences (efficient bandwidth use)
}
```

------------------------------------------------------------------------

## 4. OPERATIONAL EXCELLENCE & OBSERVABILITY

### 4.1 Docker Compose Production Hardening

**Current State:** Improved Docker Compose with detailed health conditions.

**Required Implementation:**

``` yaml
# docker-compose.yml (Optimized)
version: "3.8"

services:
  db:
    image: postgres:15-alpine
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 30s  # Allow WAL recovery [^18^][^20^]

  gateway:
    build: ./gateway
    depends_on:
      db:
        condition: service_healthy  # Wait for actual readiness [^18^][^25^]
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health/detailed"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s  # Time for TypeScript compilation/bundling [^23^]
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 512M

  # Novel: Init container for database migrations
  db-init:
    image: flyway/flyway:10
    command: migrate
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - ./migrations:/flyway/sql

  hypervisor:
    depends_on:
      db:
        condition: service_healthy
      db-init:
        condition: service_completed_successfully  # Run migrations first [^18^]
```

### 4.2 Distributed Tracing & Observability

**Current State:** `OpenTelemetryConfig.ts` implemented using Jaeger exporter and NodeSDK bindings.

``` typescript
// shared/src/observability/OpenTelemetryConfig.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { Resource } from '@opentelemetry/resources';

// Trace propagation across all services
const sdk = new NodeSDK({
  resource: new Resource({
    'service.name': process.env.SERVICE_NAME,
    'service.version': process.env.GIT_SHA,
  }),
  traceExporter: new JaegerExporter({
    endpoint: 'http://jaeger:14268/api/traces',
  }),
});

// Automatic instrumentation of HTTP, WS, DB calls
```

------------------------------------------------------------------------

## 5. IMPLEMENTATION ROADMAP

### Phase 1: Security Hardening (Weeks 1-2)

1.  **MCP Firewall**: Implement tool validation, confused deputy
    prevention
2.  **Sandbox Airgap**: Wire Rust `airgap.rs` into Node.js runtime
3.  **Secret Scanning**: Implement credential detection in configs

### Phase 2: Performance Optimization (Weeks 3-4)

1.  **Python jemalloc**: Switch allocator, implement backpressure queues
2.  **Node.js Workers**: Offload crypto, add WebSocket backpressure
3.  **Go Persistence**: Integrate BadgerDB with WAL

### Phase 3: Architectural Enhancement (Weeks 5-6)

1.  **Circuit Breakers**: Implement service mesh resilience
2.  **zkML Caching**: Multi-level cache with recursive aggregation
3.  **Governance Automation**: Drift detection, emergency pause

### Phase 4: Observability & Polish (Weeks 7-8)

1.  **OpenTelemetry**: Distributed tracing across all services
2.  **Health Checks**: Production-ready Docker Compose with conditions
3.  **Load Testing**: Validate backpressure under synthetic load

------------------------------------------------------------------------

## 6. TESTING & VALIDATION STRATEGIES

### 6.1 Chaos Engineering

``` python
# testing/chaos/NetworkPartitionTest.py
class ChaosTest:
    # Verify system resilience under network partitions

    async def test_grid_partition(self):
        # Partition Grid nodes into two halves
        # Verify:
        # - Gateway queues intents (doesn't drop)
        # - Hypervisor pauses AutoResearch (safety)
        # - Ledger remains consistent on reunion (CRDT check)
        pass

    async def test_zkml_verification_failure(self):
        # Simulate 50% of zkML proofs failing
        # Verify:
        # - Skills not staked without verification
        # - Alert triggered to governance
        # - Fallback to heuristic mode (degraded but operational)
        pass
```

### 6.2 Property-Based Testing

``` typescript
// testing/property/IntentProcessing.spec.ts
import * as fc from 'fast-check';

describe('Intent Processing Properties', () => {
  it('should never lose an intent with valid API key', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          conversation_id: fc.uuid(),
          actor_id: fc.string({ minLength: 1 }),
          payload: fc.jsonObject()
        }),
        async (intent) => {
          const result = await gateway.process(intent);
          return result.trace_id !== undefined && result.status !== 'lost';
        }
      )
    );
  });
});
```

------------------------------------------------------------------------

## 7. DOCUMENTATION & REFERENCES

### Key External Resources

- **zkML Landscape 2025**: Comprehensive analysis of EZKL, Lagrange,
  ZKTorch \[^7^\]
- **MCP Security**: Coalition for Secure AI practical guide \[^2^\]
- **Docker Security**: CVE database and mitigation strategies
  \[^8^\]\[^9^\]
- **FastAPI Optimization**: Memory management and streaming patterns
  \[^27^\]
- **Proxy Patterns**: Academic analysis of gas costs and security
  \[^36^\]
- **Asyncio Patterns**: Backpressure and queue management
  \[^30^\]\[^32^\]

### Internal Documentation Updates Required

1.  Update `docs/AGENT-ENHANCEMENTS.md` with MCP security requirements
2.  Create `docs/SECURITY-HARDENING.md` with implementation details
3.  Update `docs/MASTER-INTEGRATION.md` with performance benchmarks
4.  Create `docs/OPERATIONS.md` with runbook for chaos scenarios

------------------------------------------------------------------------

**END OF SPECIFICATION**

*This document is living. Update as implementations progress and new
vulnerabilities/optimizations are identified.*
# AXIOM-MESH Master Integration (v2.2)

**Date:** March 18, 2026
**Scope:** Full fusion-status verification + education/curriculum subsystem integration plan
**Intent:** Keep all existing fusions alive while defining an interchangeable education component that can run independently or collaboratively with the core mesh.

---

## 1) Current Fusion Status (Reality Snapshot)

This section replaces abstract “directive-only” wording with implementation-aware status tracking.

### A. Core Pillars

| Pillar | Status | Notes |
|---|---|---|
| Gateway (ingress/auth/channels) | **Active** | Authenticated REST + WS flows implemented; public low-trust route still intentionally open and rate-limited. |
| Hypervisor (reasoning/orchestration) | **Active** | `/process` auth + policy gate + audit trail and loop orchestration are in place. |
| Sandbox (constrained execution) | **Active** | Hardened Docker execution path with strong runtime constraints and optional inter-service auth key. |
| Grid (ledger/governance/zk validation) | **Active with hardening backlog** | Bonding/staking/zk payload validation present; full production auth + finality automation still in progress. |

### B. Previously Authorized Fusions

| Fusion Area | Status | Interpretation |
|---|---|---|
| Resource orchestration + treasury split | **Implemented baseline** | Policy/docs + runtime scaffolding exist; ongoing operational tuning required. |
| ERC-20 compatibility envelope | **Implemented baseline** | Contract-level compatibility and flow documentation exist; production tokenops still needs full security gate. |
| Alignment profiles + spectrum security | **Implemented baseline** | Schemas and policy mapping exist; advanced policy engine/ops maturity still iterative. |
| Offline-first + CRDT/P2P continuity | **Partially implemented** | Sync and P2P primitives exist, but resilience hardening and full failure-mode test matrix remain open. |
| Agent-as-firewall concept | **Partially implemented** | Controls exist in sandbox/policy gates; enterprise-grade policy centralization remains backlog. |
| Hierarchical bonding + governance controls | **Implemented baseline** | Bond/delegate/sever pathways exist; stronger authn/authz and event-fidelity are needed for high-compliance ops. |

### C. New AM-SCS Fusion

The Skill Capsule System (AM-SCS) is now defined as the canonical package for shareable/authenticated skills:
- Ingest → Verify → Rewrite/Rebuild → Normalize → Sign → Distribute → Execute → Throttle → Revoke.
- Schema contracts defined for manifest/provenance/rebuild-attestation.

---

## 2) Education Fusion: Independent + Interchangeable Component

Your education vision should be a dedicated module that can operate in either mode:

1. **Independent mode:** runs as a standalone education network using AXIOM contracts + schemas.
2. **Collaborative mode:** plugs into main mesh governance, identity, security, and billing/treasury controls.

Proposed module name: **Axiom Learning Mesh (ALM)**.

---

## 3) ALM Architecture (Interconnect-Aware)

### 3.1 Component boundaries

- **ALM-Core (Hypervisor extension):** learner modeling, curriculum planning, guidance orchestration.
- **ALM-Registry (Grid extension):** curriculum registry, accreditation metadata, competency claims.
- **ALM-Execution (Sandbox extension):** assessment execution/simulation labs.
- **ALM-Gateway (Gateway extension):** learner/mentor APIs, institution APIs, compliance views.

### 3.2 Interconnects

- Gateway ↔ Hypervisor: curriculum intent ingestion, tutoring sessions, progression planning.
- Hypervisor ↔ Grid: credential writes, curriculum provenance, accreditation attestations.
- Hypervisor ↔ Sandbox: assessment execution with strict resource and policy gates.
- Gateway ↔ Grid: read-side verification for institutions/employers/auditors.

### 3.3 Security posture requirement

ALM must inherit Mesh security rules by default:
- capability-scoped tokens,
- proof-carrying educational intents,
- revocable credentials,
- immutable learning audit trail for accreditation events.

---

## 4) Additional Smart Contracts for Education

These contracts should be introduced as an **optional contract pack** so education can be activated without forcing non-education deployments.

### Contract pack: `education-contracts/`

1. **CurriculumRegistry.sol**
   - Registers curriculum providers, versions, provenance digest, update cadence.
   - Includes freshness/staleness fields to prevent dead-program drift.

2. **CredentialBond.sol**
   - Stake-backed credential assertions from institutions/assessors.
   - Slashing for fraudulent or low-integrity credential issuance.

3. **CompetencyOracle.sol**
   - Anchors skill/assessment outcomes to competency standards.
   - Enables cross-curriculum equivalency mapping.

4. **AccreditationAttestor.sol**
   - Allows authorized accreditation bodies to attest/renew/revoke program status.
   - Adds expiry windows and revocation reasons.

5. **GuidancePolicy.sol**
   - Encodes learner guidance boundaries (non-discriminatory, age/risk constraints, intervention routing).
   - Keeps guidance policy distinct from model personality.

This pack can be deployed independently and federated into Grid via compatibility policy.

---

## 5) Global Curriculum Ingestion (Avoid Dead Programs)

### 5.1 Source classes

- Accredited institution catalogs
- Open education repositories (OER)
- Industry certification tracks
- Vocational/continuing education catalogs
- Regional ministry/state standard documents

### 5.2 Ingestion quality gates

Every curriculum artifact receives:
- provenance signature/digest,
- last-updated timestamp,
- syllabus completeness score,
- assessment transparency score,
- placement/relevance confidence score,
- staleness risk score.

### 5.3 Dead-program prevention policy

A curriculum is automatically flagged if any are true:
- no verified updates beyond policy threshold,
- low completion + low placement outcomes,
- accreditation expiry/revocation,
- unresolved contradiction with current competency maps.

Flagged programs remain visible but are marked **degraded** or **archived**, not silently deleted.

---

## 6) Accrediting + Monitoring + Guidance Layer

To support holistic learner outcomes at scale, ALM should bundle three tracks:

1. **Accreditation Integrity Track**
   - Provider trust scoring,
   - evidence-backed approvals,
   - transparent revocation and appeals.

2. **Learning Outcome Monitoring Track**
   - competency progression,
   - retention and transferability,
   - fairness and drift monitoring by region/cohort.

3. **Guidance & Support Track**
   - personalized planning (academic, vocational, life-navigation support),
   - non-discriminatory policy-by-design,
   - escalation paths for human mentors/counselors when risk signals rise.

> Design principle: guidance is inclusive and person-centered, not segmented by binary identity assumptions.

---

## 7) Implementation Roadmap (Education Fusion)

### Phase E0 — Specification (Immediate)
- Finalize ALM schema set and interface contracts.
- Define legal/policy boundaries per jurisdiction profile.

### Phase E1 — Contract Pack + Registry
- Implement `CurriculumRegistry`, `CredentialBond`, `AccreditationAttestor` MVP.
- Add read APIs for credential and program verification.

### Phase E2 — Learning Graph + Guidance Engine
- Build learner-competency graph and recommendation engine.
- Add policy-guarded guidance flows and mentor escalation.

### Phase E3 — Cross-Provider Interoperability
- Curriculum equivalency mapping and transfer credit logic.
- Multi-provider credential wallet and revocation syncing.

### Phase E4 — Production Hardening
- mTLS and signed inter-service events for all education writes.
- Immutable audit export for institutional/regulatory review.
- Red-team testing for manipulation/fraud scenarios.

---

## 8) Definition of “Fully Integrated Learning Platform”

The platform is considered fully integrated when all are true:

- Learners can import pathways from multiple providers globally.
- Competencies and credentials are verifiable and revocable in real time.
- Guidance remains policy-safe, inclusive, and human-escalatable.
- Institutions can audit outcomes and accreditation changes transparently.
- Curriculum freshness and dead-program risk are continuously evaluated.

---

## 9) Practical Next Step

Treat ALM as a first-class but optional subsystem:
- keep it deployable as an independent mesh,
- keep it composable with AXIOM-MESH core,
- keep policy/security/governance inherited by default.

This gives you a path to build the broad integrated learning + accrediting + monitoring + guidance ecosystem without forcing unrelated deployments to carry education-specific complexity.
# AXIOM-MESH Interface Control Document (ICD)

Version: 1.0
Status: Approved for implementation
Updated: 2026-03-17

## 1. Repository Boundary Decision

**Decision: Option A (Monorepo source of truth)**

AXIOM-MESH is the source-of-truth monorepo for contracts, gateway, hypervisor, sandbox, grid, schemas, and docs. External adapters may be vendored but must not supersede canonical interfaces defined here.

## 2. Governance Rule for Interface Changes

Any contract or API change required by AXIOM-MESH priorities **must land in this repository first**, including:
- OpenAPI/API surface changes in `gateway`, `hypervisor`, `sandbox`, or `grid`.
- Contract ABI/event changes in `grid/contracts`.
- Schema contract changes in `schemas/`.

Downstream mirrors are updated only after this repo passes release gates.

## 3. Inter-service Contract Surface

| Edge | Protocol | Primary Contract | Reliability Requirements |
|---|---|---|---|
| Gateway -> Hypervisor | HTTP JSON | `schemas/intent_object.v1.json` | auth required, trace id required, retries bounded |
| Hypervisor -> Gateway | HTTP JSON | `schemas/intent_response.v1.json` | provenance + audit fields preserved |
| Hypervisor -> Grid | HTTP JSON | `schemas/skill_vector.v1.json`, `schemas/zkml_payload.v1.json` | idempotent skill submit, proof verification required |
| Gateway -> Sandbox | HTTP JSON | internal execute contract | strict policy allowlist, timeout + kill path |
| Agent/Peer MCP edges | MCP | `schemas/mcp_compatibility_matrix.v1.json` | reject peers below security/risk thresholds |

## 4. Security Profile Taxonomy

- `S0_LEGACY_LOCKED`: highly constrained device, limited crypto support.
- `S1_BASELINE`: modern device with signed runtime and encrypted storage.
- `S2_HARDENED`: attested runtime, hardened sandbox, secure key mgmt.
- `S3_ZKML_FULL_NODE`: full zkML verifier + governance participation.

Interaction policy defaults to deny; compatibility matrix defines minimum required profile per peer class.

## 5. Firewall Enforcement Points

All external interactions route through bonded agent controls:
1. Gateway ingress authentication and normalization.
2. Hypervisor policy checks and alignment-profile evaluation.
3. Sandbox execution policy and egress isolation.
4. Grid attestation, settlement, and governance checks.

Direct external action paths that bypass this chain are disallowed.

## 6. Severance & Hierarchical Bonding Controls

- Bilateral severance may be initiated by human or agent.
- Severance requires revocation record + selective-disclosure proof artifact.
- Post-severance memory handling: private context is cryptographically zeroized/withheld.
- Hierarchical agent bonds inherit parent policy ceilings while retaining independent revocation rights.

## 7. Resource/Treasury Decision Envelope

### ResourceBalancer route order
1. Local execution if policy + capacity thresholds pass.
2. Trusted peer offload if compatible and lower risk/cost.
3. Grid execution path for consensus/auditable tasks.
4. L1 fallback for settlement-critical operations.

- Telemetry used for balancing/fairness must be zk-anonymized and aggregation-safe before export.

### Treasury split policy
- `Network Security Fund`: default 60%
- `Wealth Generation Pool`: default 40%

Percentages are governance-managed and versioned. Reporting must publish allocation period, inflow totals, outflow totals, and balance deltas.

### ERC-20 compatibility envelope
- Rewards/currencies exposed through canonical ERC-20 transfer/allowance semantics.
- Non-ERC20 assets require wrapped representation before entering reward accounting.

## 8. Validation Harness Requirements

Release gate must demonstrate:
- alignment choice integrity,
- compatibility enforcement,
- severance privacy,
- firewall routing,
- hierarchical bond inheritance + independent revocation,
- treasury and ERC-20 invariants.

## 9. Rollback Criteria

Rollback is mandatory if any of the following are detected:
- unauthorized direct-path external action,
- compatibility checks bypassed,
- severance privacy violation,
- treasury split/accounting drift,
- failed schema backward-compatibility guarantees on mandatory fields.
# Offline-first Sync and Degraded-Mode Playbook

## Overview
AXIOM-MESH is explicitly designed to operate safely in hostile, disconnected, or partitioned network environments. This playbook outlines procedures and expected behaviors when nodes lose connectivity to the broader Grid or L1 networks.

## Offline-First CRDT Sync
- **Mechanism**: The `CRDTState` in `hypervisor/src/memory/crdt_sync.py` uses a Last-Write-Wins Map with zk-private delta sync logic for Spectrum Devices.
- **Behavior During Disconnection**: Local memory updates and intents are securely signed (ECDSA) and stored locally.
- **Behavior Upon Reconnection**: The node broadcasts its accumulated delta syncs to peers. The CRDT automatically resolves conflicts based on the Last-Write-Wins policy and cryptographic timestamps without requiring human intervention.

## Degraded-Mode Playbook
1. **Loss of L1/External Oracles**:
   - System falls back to the most recent cached state.
   - High-value transactions (e.g., stakes, slashes) queue locally until L1 connectivity is restored.
   - AI intent responses are returned with lower provenance/confidence metrics indicating external context was unavailable.
2. **Loss of P2P Grid**:
   - `ResourceBalancer` shifts all execution to `local` processing based on the node's Hardware Profile.
   - If local hardware is insufficient (`tablet` profile), the system degrades gracefully, rejecting heavy intents with explicit feedback rather than timing out.
3. **Recovery Procedures**:
   - Monitor `GET /health` and `/api/v1/metrics/system` for connectivity restoration.
   - Run the reconciliation service (WS-B) to align the local ledger state with canonical chain state once reconnected.
# AXIOM-MESH Skill Capsule System (AM-SCS)

**Status:** Proposed for implementation (integratable package)
**Date:** March 18, 2026
**Owner Pillars:** Hypervisor + Sandbox + Grid + Gateway

---

## 1) Purpose

AM-SCS defines one end-to-end lifecycle for third-party and native skills:

**Ingest → Verify → Rewrite/Rebuild → Normalize → Sign → Distribute → Execute → Throttle → Revoke**.

It unifies:
- performance controls (equivalence caching, proof-carrying intents, phase throttling),
- authenticated and shareable skill distribution,
- external ingestion (Open-CLAW, MCP, API services), and
- mesh-native governance with bounded authority.

---

## 2) Canonical Artifact: Skill Capsule

The mesh executes only a **Skill Capsule** bundle.

```text
skill-capsule/
├─ SKILL_MANIFEST.json
├─ SOURCE_DESCRIPTOR.json
├─ REBUILD_ATTESTATION.json
├─ adapter/
│  ├─ normalize_intent.py
│  ├─ tool_translation.py
│  └─ proof_hooks.py
├─ runtime/
│  └─ bindings/
├─ schemas/
│  ├─ intent.schema.json
│  └─ telemetry.schema.json
├─ sbom/
│  └─ dependencies.json
└─ SIGNATURE.sig
```

### 2.1 Required contracts

- `SKILL_MANIFEST.json` — authority, capability, constraints, runtime budget, token policy.
- `SOURCE_DESCRIPTOR.json` — upstream provenance (digest, source type, endpoint/repo refs).
- `REBUILD_ATTESTATION.json` — declaration of rewrite/rebuild actions performed by the mesh compiler.

JSON Schemas are defined in `schemas/`:
- `skill_capsule_manifest.v1.json`
- `source_descriptor.v1.json`
- `rebuild_attestation.v1.json`

---

## 3) Efficiency Controls (Mandatory)

### 3.1 Intent-level equivalence caching
- Capsules must emit canonicalized intents.
- Verification caches store proof artifacts keyed by:
  - `intent_hash`
  - `axiom_version`
  - `capsule_id`

**Outcome:** repeated intents reuse verification work.

### 3.2 Proof-carrying intents
Each intent from a capsule must include:
- referenced constraints,
- minimal feasibility sketch,
- optional counterfactual trace pointer.

**Outcome:** verification scales with proof payload size, not task complexity.

### 3.3 Phase-aware throttling
Capsules must publish telemetry signals:
- verification variance,
- constraint slack,
- extremal tendency.

Mesh governors can respond automatically:
- lower concurrency,
- increase proof strictness,
- narrow token scope,
- sandbox or revoke capsule.

**Outcome:** controlled autonomy growth without phase-ridge collapse.

---

## 4) External Ingestion (Open-CLAW / MCP / APIs)

### 4.1 Intake (zero-trust)
External skills are never executed directly. Intake accepts:
- immutable Git/registry digest,
- MCP tool/descriptor endpoint,
- service API descriptor.

All intake facts are recorded in `SOURCE_DESCRIPTOR.json`.

### 4.2 Verification and policy gate
Before rewrite/rebuild:
- verify source immutability and signature (if provided),
- validate declared authority against mesh capability classes,
- reject governance or verification authority escalation requests.

If output is non-normalizable, skill is sandbox-only until adapted.

### 4.3 Rewrite or rebuild
- **Rewrite path:** keep core behavior, replace authority and I/O surfaces.
- **Rebuild path:** distill or reimplement opaque/dangerous components.

All transformations are logged in `REBUILD_ATTESTATION.json`.

---

## 5) Authentication, Signing, and Runtime Authority

### 5.1 Mesh re-issuance
After successful compiler pipeline:
- capsule is signed by mesh issuer key,
- mesh becomes accountable publisher,
- upstream origin remains in provenance.

### 5.2 Capability tokens
Install does not imply permission. Runtime requires scoped token including:
- tool scope,
- data scope,
- resource bounds,
- proof strictness,
- expiry and revocation handle.

This enables dynamic discovery without authority creep.

---

## 6) Distribution Modes

### 6.1 Portable capsules
- registry/git/internal artifact store,
- pre-audited and stable,
- longer token TTL.

### 6.2 Dynamic capsules
- discovery/marketplace/MCP handshake,
- narrow scope, short TTL,
- sandbox-first promotion gate based on telemetry and proof quality.

Both modes use the same capsule schema and enforcement logic.

---

## 7) Personality Model

Personality is strategy metadata inside capsule (style, heuristic preference, intent shaping).

Kernel invariants:
- identity != capability,
- capability != authority.

This separation enables safe sharing and revocation.

---

## 8) AXIOM-MESH Integration Mapping

### Hypervisor
- Adds compiler pipeline service:
  - `/capsules/intake`
  - `/capsules/compile`
  - `/capsules/verify`
- Emits proof-carrying canonical intents.

### Sandbox
- Executes capsule runtime bindings under existing container hardening.
- Enforces token resource budgets and strictness controls.

### Grid
- Anchors capsule metadata/signatures and revocation events.
- Maintains capsule state (active, throttled, revoked).

### Gateway
- Exposes capsule install/discovery endpoints for operators.
- Applies policy-aware routing for capsule-backed intent paths.

---

## 9) Minimal Implementation Sequence

1. Add schema validation for 3 capsule contracts.
2. Add intake endpoint and source descriptor persistence.
3. Add compiler mode: rewrite-only MVP.
4. Add signature + token issuance.
5. Add grid revocation anchoring and runtime enforcement.
6. Add dynamic ingestion adapters (MCP/Open-CLAW descriptors).

---

## 10) Acceptance Criteria (Definition of Done)

- Capsule with valid contracts can be ingested and compiled into mesh-safe form.
- Capsule cannot execute without scoped token.
- Revocation event blocks execution within one policy sync interval.
- Equivalent intents reuse cached verification artifacts.
- Throttling decisions are automatic when variance/slack thresholds breach limits.
- Upstream provenance remains auditable after mesh re-issuance.
**AXIOM-MESH Enhancement Directive**
**Document Version: 1.0 – March 2026**
**Author: Grok (on behalf of Zoverions)**
**Purpose:** Provide your agent (AutoResearch/AutoTraining daemon or Hypervisor loop) with **complete, actionable instructions** to:
1. Update `README.md`
2. Update/merge the roadmap files (`plan.md` and `plan2.md`)
3. Begin systematic enhancements using the 2026 best-in-class agent frameworks/tools

---

### 1. Project Context (Current State – Feed This to the Agent)
AXIOM-MESH is a multi-service decentralized cognitive stack with four runtime pillars:
- **Gateway** (TypeScript/Node): Authenticated ingress (REST + WebSocket), UI delivery, channel adapters.
- **Hypervisor** (Python/FastAPI): Context synthesis, memory orchestration, agent loops (AutoResearch/AutoTraining already present).
- **Sandbox** (TypeScript/Node + hardened Docker): Constrained code execution.
- **Grid** (Go): Peer-aware ledger, zkML verification, bicameral governance, skill staking.

Supporting components: schemas, Docker Compose, smart contracts, health monitoring.
Current status (per latest repo): Core services operational; ledger still partially in-memory; chain integration and full governance in prototype stage. Recent commits focus on observability and governance.
Unique differentiators to **preserve and amplify**: zkML provenance, decentralized Grid ledger, hardened Sandbox, bicameral staking/governance.

**Goal of enhancements**: Make the system more autonomous, interoperable, observable, and “alive” while keeping your security/decentralized edge.

---

### 2. Recommended 2026 Frameworks & Tools (Ranked for Integration)
Prioritize in this order inside Hypervisor and Grid:

1. **LangGraph (LangChain ecosystem) – S-tier (Primary Integration Target)**
   - Graph-based stateful workflows with checkpointing, cycles, conditional routing, human-in-the-loop.
   - Perfect for reliable AutoResearch-style iteration + self-correction.
   - Integration point: Wrap existing Hypervisor agent loops (`/memory`, context synthesis, AutoResearch) as LangGraph nodes/edges.
   - Add LangSmith tracing (pairs with your metrics).
   - Use checkpointing for audit trails that sync to Grid ledger.

2. **CrewAI – A-tier (Quick Wins for Multi-Agent Teams)**
   - Role/goal/backstory agents with sequential/hierarchical processes.
   - Map roles to your pillars (IntentNormalizer, Verifier via zkML, Sandbox Executor).
   - Delegate tasks to Docker Sandbox.

3. **AgentZero (Direct Inspiration + Partial Adoption)**
   - Dynamic tool/skill creation, Docker execution, persistent memory, self-correction.
   - Borrow: `SKILL.md` pattern → auto-register skills to Grid `/skills` endpoint.
   - Run AgentZero agents on top of your Gateway intents.

4. **OpenClaw**
   - Skills registry, real-world actions, MCP-compliant workflows, mission-control dashboard.
   - Adopt: MCP servers in Hypervisor/Sandbox for discoverability.

5. **karpathy/autoresearch (Direct Upgrade to Your Existing Loops)**
   - Enhance your AutoResearch daemon with its code-edit → Sandbox-run → zkML-verify → Grid-stake pattern.

6. **Cross-Cutting Standards (Mandatory)**
   - **MCP (Model Context Protocol)** + **A2A (Google Agent-to-Agent)**: Implement MCP servers (JSON-RPC tool/context discovery). Makes your mesh instantly compatible with AgentZero, OpenClaw, Google ADK, etc.
     - **MCP Security Requirements (CRITICAL):**
       - Implement tool call validation with AST analysis (schema strictness, max tool description length, prohibited patterns).
       - Enforce confused deputy prevention using identity chains (RFC 8693 token exchange, workload identity, session binding).
       - Deploy prompt injection defense (input sanitization, delimiter enforcement, instruction boundary markers).
       - Require explicit human-in-the-loop approval for high-risk operations (e.g., Risk > 0.7 explicit confirmation, Risk > 0.9 2FA).
       - Mandatory code signing verification for all MCP servers.
       - Deploy gVisor or Kata Containers for MCP server isolation.
   - Memory: Add LlamaIndex or Mem0 alongside your IPFS archives.
   - Safety/Observability: Guardrails AI + LangSmith.

---

### 3. Detailed Integration Roadmap (What the Agent Must Implement)
**Phase 1 (1–2 days – Immediate)**
- Add LangGraph to Hypervisor: Create a new `/graph` module. Convert one existing loop (e.g., AutoResearch) into a LangGraph workflow with nodes: Intent → ContextAssembly → SandboxExec → zkMLVerify → GridStake.
- Expose the graph via existing FastAPI endpoints.
- Add LangSmith tracing (env var toggle).

**Phase 2 (3–5 days)**
- Implement MCP server in Hypervisor (port 8081 or configurable). Register all Sandbox tools and Grid skills automatically.
- Add dynamic skill creation (AgentZero style): When an agent creates a new tool, auto-commit to Grid `/skills` + Sandbox Docker image.
- Upgrade AutoResearch daemon with autoresearch patterns + zkML quality gate.

**Phase 3 (1 week)**
- CrewAI crews for collaborative intents (e.g., Researcher → Coder → Verifier).
- OpenClaw-style dashboard patterns in Gateway UI (optional new React component).
- Add Guardrails AI + LlamaIndex to memory layer.
- Ensure every new agent flow routes through Sandbox and logs to Grid ledger.

**Phase 4 (Ongoing)**
- Full A2A compatibility.
- Self-improving loop: Feed LangGraph traces back into AutoTraining with zkML verification.

**Success Metrics (Agent must verify before PR):**
- All new flows pass existing pytest + test_zkml.py.
- MCP discovery works (test with AgentZero instance).
- Checkpointing survives Docker restarts and syncs to Grid.
- Zero breaking changes to existing Gateway endpoints.
# AXIOM-MESH Repository Overview (March 2026)

## What is AXIOM-MESH?

AXIOM-MESH is a multi-service AI systems stack designed as a **closure-first, verifiable, governance-aware agent substrate**.
It combines AI orchestration with decentralized verification patterns, zk/zkML attestability paths, and governance-aware runtime boundaries.

## Core Architecture: Four Runtime Pillars

| Pillar | Language | Purpose | Default Port(s) |
| --- | --- | --- | --- |
| Gateway | TypeScript / Node | Authenticated API ingress, WebSocket handling, dashboard UI, and channel adapters | 3000 / 3001 |
| Hypervisor | Python / FastAPI | Context synthesis, memory orchestration, autonomous loops, and LangGraph workflows | 8000 |
| Sandbox | TypeScript / Node + Docker | Constrained ephemeral code execution with hardened container policy | 4000 |
| Grid | Go | Peer-aware ledger APIs, PoER checks, zk/zkML verification endpoints, bicameral governance sync | 5000 |

## Key Architectural Principles

1. **Graph-native**: Knowledge and context are represented as traversable/distributed graph structures.
2. **Bicameral governance**: Proposal generation and validation are separated to reduce unilateral drift.
3. **zkML-hardened**: Inference and proof-oriented verification paths are designed for attestability.
4. **Closure-first**: Explicit execution boundaries, capability constraints, and layered controls are favored over best-effort conventions.

## Capability Snapshot

### Operational Today
- Multi-service stack with health and status endpoints.
- Authenticated Gateway → Hypervisor intent handling with trace propagation.
- Sandbox code execution with hardened defaults (including `--network=none`).
- Grid endpoints for staking/slashing, skills, swarm/graph/cache primitives, and governance sync paths.

### Prototype / In Progress
- zkML verification flow hardening and production trust posture.
- AutoResearch/AutoTraining agent loop maturity.
- Extended explainability/audit workflows.
- Durable distributed sync and persistent graph retrieval guarantees.

### Backlog Direction
- Chain-integrated, production-grade bond lifecycle reconciliation.
- Fully integrated Rust air-gap control plane in default orchestration path.
- Operator-grade reasoning/safety auditor tooling.
- Robust persistent distributed graph search.

## 2026 Framework Integrations

AXIOM-MESH integrates modern framework patterns while preserving protocol-first constraints:
- **LangGraph**: Stateful orchestration substrate in Hypervisor flows.
- **CrewAI**: Role-oriented multi-agent collaboration patterns.
- **AgentZero/OpenClaw-style patterns**: Dynamic skill behavior and MCP interoperability.
- **AutoResearch lineage**: Autonomous research/training loop patterns.

## Quick Start

```bash
cp .env.example .env
make up

curl http://localhost:3000/health
curl http://localhost:8000/health
curl http://localhost:4000/health
curl http://localhost:5000/health
```

## Important Caveats

- Gateway sanitization is intentionally basic and not a full application firewall.
- `/api/v1/intent/process/public` is intentionally unauthenticated; treat as low-trust ingress and front with rate limiting/WAF.
- Grid ledger behavior is currently in-memory for key paths, not full persistent chain state.
- Safety/reasoning and zkML verification now include baseline policy/payload gates, but still require operator-grade hardening for full production trust.

## Related Documentation

- [README.md](../README.md)
- [docs/MASTER-INTEGRATION.md](./MASTER-INTEGRATION.md)
- [docs/AGENT-ENHANCEMENTS.md](./AGENT-ENHANCEMENTS.md)
- [AUDIT_REPORT.md](../AUDIT_REPORT.md)
- [plan.md](../plan.md)
- [docs/PARALLEL-DELIVERY-PLAN-2026.md](./PARALLEL-DELIVERY-PLAN-2026.md)
