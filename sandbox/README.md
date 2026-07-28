# Sandbox Service

The **Sandbox** is the secure, isolated code execution environment. It enforces network isolation, resource limits, and security policies (seccomp, AppArmor) to safely execute arbitrary code submitted by users and agents.

## Architecture

```
sandbox/
├── src/
│   ├── index.ts              # Express server entry point
│   ├── routes/               # /execute endpoint, health
│   ├── services/             # DockerRunner, ExecutionOrchestrator
│   ├── network/              # Network isolation helpers
│   ├── types/                # TypeScript interfaces
│   └── tests/                # Jest test suite
├── security/
│   └── seccomp-default.json  # Default seccomp policy
├── package.json
├── tsconfig.json
├── jest.config.js
└── Dockerfile
```

## Key Components

### Services (`src/services/`)
- **DockerRunner** – Spawns isolated Docker containers with execution environment
- **ExecutionOrchestrator** – Manages job queuing, timeouts, resource tracking

### Network Isolation (`src/network/`)
- **--network=none** – Disables all network access by default
- **Whitelist mode** – Only approved APIs (IPFS, Grid) accessible
- **DNS blocking** – External DNS requests blocked (e.g., upload.ardrive.io in disconnected tests)

### Routes (`src/routes/`)
- **POST /execute** – Accept code execution requests
  - `code` (string) – Python, JavaScript, or Bash code
  - `language` (string) – 'python' | 'javascript' | 'bash'
  - `timeout` (number) – Max execution time in ms
  - `memory_limit` (number) – Memory constraint in MB
  - Returns: execution result with stdout/stderr

- **GET /health** – Service status and resource usage

## Configuration

```bash
# .env configuration
SANDBOX_PORT=4000
SANDBOX_HOST=0.0.0.0

# Optional
SANDBOX_TIMEOUT_DEFAULT=30000  # 30 seconds
SANDBOX_MEMORY_LIMIT=512       # MB
SANDBOX_RUNTIME_PROFILE=gvisor # gvisor|kata (aliases: runsc|kata-containers)
SANDBOX_RUNTIME_FALLBACK_PROFILE=gvisor # optional fallback runtime profile
SANDBOX_DISABLE_RUNTIME_FALLBACK=0      # set to 1 for strict fail-closed mode
SANDBOX_AVAILABLE_RUNTIMES=runsc,kata-runtime # comma-separated availability signal
```

## Execution Model

1. **Code reception** – Validate language and code payload
2. **Docker spawn** – Launch isolated container:
   ```bash
   docker run \
     --rm \
     --network=none \
     --cpus=1 \
     --memory=512m \
     --security-opt=seccomp=security/seccomp-default.json \
     --timeout=30000 \
     node:20 /usr/bin/code-executor
   ```
3. **Execution** – Run code, collect output in real-time
4. **Timeout enforcement** – Kill process if exceeds limit
5. **Resource reporting** – Return stdout/stderr + execution time

## Development

```bash
cd sandbox
npm install
npm run dev          # Start dev server
npm run build        # Build TypeScript
npm test             # Run Jest tests
npm run lint         # Run ESLint
```

## Testing

**Current coverage: 20-30%** – Basic tests exist, gaps identified:

**Tests present:**
- `dockerRunner.test.ts` – Docker runner basics (container spawning, success/failure paths)
- `integration.test.ts` – Basic integration test

**Critical gaps:**
- Network isolation verification (--network=none enforcement)
- Timeout enforcement tests
- Resource limit tests (CPU, memory)
- Execution path tests (Python, JavaScript, Bash)
- Seccomp policy enforcement
- AppArmor profile verification

## Production Considerations

- **Security layers:**
  - Docker isolation (--rm removes container after execution)
  - Runtime profile isolation (`--runtime=runsc` gVisor default, optional `--runtime=kata-runtime`)
  - seccomp policy (blocks dangerous syscalls)
  - AppArmor profile (file system access restrictions)
  - Network isolation (--network=none)
  - Resource limits (CPU, memory)
  - Fail-closed runtime selection when configured runtime/fallback are unavailable

- **Timeouts:** Default 30 seconds; configurable per request
- **Error handling:** Timeouts return HTTP 408; resource exhaustion returns 429
- **Logging:** All executions logged (code content may be redacted in production)

## Known Issues

Please refer to the [MASTER-TODO.md](../docs/MASTER-TODO.md) list for specific active execution tasks and known issues backlog.

## Related Services

- **Gateway** – Receives execution requests from users
- **Hypervisor** – Orchestrates code execution as part of autoresearch workflows
- **Grid** – Records execution proofs on ledger
