# HOWTO: Submit an Intent Through Gateway

This guide verifies end-to-end intent submission through Gateway into Hypervisor.

## 1) Ensure stack is running
```bash
make up
```

## 2) Set API key header (if auth enabled)
```bash
export AXIOM_API_KEY=${AXIOM_API_KEY:-dev-key}
```

## 3) Send an intent request
```bash
curl -X POST http://localhost:3000/api/v1/intent/process \
  -H 'Content-Type: application/json' \
  -H "X-API-Key: ${AXIOM_API_KEY}" \
  -d '{
    "intent": "status-check",
    "message": "Return a brief health summary",
    "metadata": {"trace_id": "howto-intent-001"}
  }'
```

## 4) Verify response
Expected:
- HTTP success response
- payload includes response content and trace/context metadata

## 5) Check service health if request fails
```bash
curl http://localhost:3000/health
curl http://localhost:8000/health
```

## 6) Optional public route check (development only)
```bash
curl -X POST http://localhost:3000/api/v1/intent/process/public \
  -H 'Content-Type: application/json' \
  -d '{"intent":"public-check","message":"hello"}'
```

Use this route only in development settings per gateway policy.
