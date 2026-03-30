# Gateway Service

The **Gateway** is the primary user-facing interface (UX/API layer) for AXIOM-MESH. It handles intent routing, authentication, WebSocket connections, and integration with external channels (Discord, Slack, Telegram, WhatsApp).

## Architecture

```
gateway/
├── src/
│   ├── index.ts              # Express server entry point
│   ├── routes/               # REST & WebSocket routing
│   ├── services/             # Business logic (hypervisor client, intent processing)
│   ├── middleware/           # Auth, logging, error handling
│   ├── channels/             # Discord, Slack, Telegram adapters
│   ├── types/                # TypeScript interfaces
│   └── utils/                # Utilities (normalizer, auth, hypervisor client)
├── tests/                    # Jest test suite
├── public/                   # Static assets (HTML, CSS, JS, tester)
├── package.json
├── tsconfig.json
├── jest.config.js
└── Dockerfile
```

## Key Components

### Routes (`src/routes/`)
- **REST API** (`/api/v1/intent/*`) – Submit and retrieve intents
- **Memory API** (`/api/v1/memory/*`) – Skill and context storage
- **Health** (`/health`) – Service status
- **WebSocket** (`/ws`) – Real-time intent streaming

### Services (`src/services/`)
- **HypervisorClient** – Communication with hypervisor service (retry logic, streaming)
- **IntentProcessor** – Normalizes and validates intent objects
- **ChannelAdapters** – Converts Discord/Slack/Telegram messages to intent format

### Middleware (`src/middleware/`)
- **Authentication** – API key + Bearer token validation
- **ReferentFilter** – Validates intent structure
- **ErrorHandler** – Centralized error responses
- **Logger** – Request/response logging

### Utilities (`src/utils/`)
- **auth_utils.ts** – Key validation, token generation
- **normalizer.ts** – Intent normalization (capitalization, entity extraction)
- **hypervisorClient.ts** – Client with exponential backoff retry

## Configuration

Set environment variables in `.env`:
```bash
GATEWAY_REST_PORT=3000
GATEWAY_WS_PORT=3001
CORS_ORIGINS=http://localhost:3000
GATEWAY_MAX_JSON_BODY_BYTES=102400
GATEWAY_WS_MAX_PAYLOAD_BYTES=1048576
HYPERVISOR_API_KEY=your_key
HYPERVISOR_PORT=8000
```

## Development

```bash
cd gateway
npm install
npm run dev          # Start dev server with hot reload
npm run build        # Build TypeScript
npm test             # Run Jest tests
npm run lint         # Run ESLint
```

## Testing

Current coverage: ~30-40%

**Well-tested:**
- Auth validation (auth_utils.test.ts)
- Intent normalization (normalizer.test.ts)
- HypervisorClient retry logic (hypervisorClient.test.ts)

**Gaps to address:**
- REST endpoint coverage (routes)
- WebSocket flow tests
- Channel adapter tests (Discord, Slack)

## Production Considerations

- CORS is configured for trusted origins only (set `CORS_ORIGINS`)
- WebSocket messages are validated against `ZodSchema`
- WebSocket handshake origin checks and max payload limits are configurable (`GATEWAY_WS_MAX_PAYLOAD_BYTES`)
- Hypervisor client uses exponential backoff (max retries: 3, initial delay: 100ms)
- Rate limiting: 100 req/min per IP (configurable via env)

## Known Issues

Please refer to the [MASTER-TODO.md](../docs/MASTER-TODO.md) list for specific active execution tasks and known issues backlog.

## Related Services

- **Hypervisor** – AI orchestration, intent processing
- **Sandbox** – Secure code execution
- **Grid** – Ledger and P2P consensus
