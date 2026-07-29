# AXIOM-MESH Configuration Reference

> **Historical specification:** this page describes the deprecated
> multi-language line and is not the 0.11 clean-room runtime configuration.
> Use [`mesh/PRODUCTION.md`](../mesh/PRODUCTION.md) and the
> [transport runbook](operations/MUTUALLY-AUTHENTICATED-TRANSPORT.md) for the
> supported production environment.

This document outlines the environment variables required to configure each service within the AXIOM-MESH architecture.

## Global Configurations

These variables are used across multiple services or affect the overall system behavior.

| Variable | Description | Required | Default |
| --- | --- | --- | --- |
| `NODE_ENV` | Environment mode (development, production, test) | No | `development` |
| `MTS_CERT_PATH` | Path to the mTLS certificate directory | Yes | `/app/certs` |

## Gateway (TypeScript/Node.js)

| Variable | Description | Required | Default |
| --- | --- | --- | --- |
| `PORT` | The port the Gateway service listens on | No | `3000` |
| `GATEWAY_INTERNAL_SECRET` | Secret key for service-to-service authentication | Yes | - |
| `JWT_SECRET` | Secret key for signing JWT tokens | Yes | - |
| `JWT_REFRESH_SECRET` | Secret key for signing refresh tokens | Yes | - |
| `WEBRTC_TURN_CREDENTIALS` | Credentials for the WebRTC TURN server | No | - |

## Hypervisor (Python/FastAPI)

| Variable | Description | Required | Default |
| --- | --- | --- | --- |
| `HYPERVISOR_API_KEY` | API key for Hypervisor access control | Yes | - |
| `DATABASE_URL` | Connection string for the database | Yes | - |
| `ZKML_PROVER_ENDPOINT` | Endpoint for the zkML verification service | No | - |

## Grid (Go)

| Variable | Description | Required | Default |
| --- | --- | --- | --- |
| `GRID_P2P_TLS_CERT` | Path to the Grid P2P TLS certificate | Yes | - |
| `GRID_P2P_TLS_KEY` | Path to the Grid P2P TLS key | Yes | - |
| `BLOCKCHAIN_RPC_URL` | URL for the blockchain RPC endpoint | Yes | - |

## Sandbox (TypeScript/Node.js)

| Variable | Description | Required | Default |
| --- | --- | --- | --- |
| `SANDBOX_EXECUTION_TIMEOUT` | Maximum execution time for sandboxed code | No | `30s` |

## Security Best Practices

1. **Never commit `.env` files** containing real secrets to the repository.
2. Use a **secrets manager** (e.g., HashiCorp Vault, AWS Secrets Manager) for production environments.
3. Rotate secrets regularly, especially `JWT_SECRET` and `GATEWAY_INTERNAL_SECRET`.
4. Ensure all P2P communications use **mTLS** with properly managed certificates.
