# Devcontainer + Compose Dev Parity

This guide validates reproducible local development environments for Gateway/Hypervisor/Grid/Sandbox.

## 1) Seed local fixtures

```bash
python3 scripts/seed_dev_fixtures.py
```

## 2) Validate devcontainer/compose parity

```bash
python3 scripts/check_devcontainer_parity.py
```

Expected output:

- `PASS: devcontainer and docker-compose.dev include required services`

## 3) Start the dev stack

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## 4) Stop the dev stack

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```
