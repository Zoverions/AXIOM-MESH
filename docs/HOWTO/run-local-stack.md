# HOWTO: Run AXIOM-MESH Locally and Verify Health

## Prerequisites
- [ ] Docker and Docker Compose installed
- [ ] Ports 3000, 3001, 4000, 5000, 8000 available

## Start services
```bash
make up
```

## Check health endpoints
```bash
curl http://localhost:3000/health
curl http://localhost:8000/health
curl http://localhost:4000/health
curl http://localhost:5000/health
```

Expected: each endpoint returns a healthy status payload.

## Verification Checklist
- [ ] All services started without errors
- [ ] Health endpoints return 200 OK
- [ ] Logs show no critical errors
- [ ] Can submit a test intent successfully

## Basic smoke check via Makefile
```bash
make test
```

## Stop services
```bash
make down
```

## Troubleshooting
- If ports are occupied, stop conflicting services and retry.
- If a service fails to boot, inspect logs:
```bash
docker compose logs --tail=200 gateway hypervisor sandbox grid
```
