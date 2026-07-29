# Secret Management for Internal Transport

**Current runtime:** AXIOM-MESH 0.11 clean-room Node.js kernel

The supported runtime does not accept raw PEM credentials through
`MTLS_CA_CERT`, `MTLS_CLIENT_CERT`, or `MTLS_CLIENT_KEY`. Multiline secret
environment variables are intentionally avoided because they are easily
exposed through process inspection, crash diagnostics, and deployment
metadata.

Production provisioning writes a private, untracked credential set beneath
the selected secret directory:

```bash
npm run provision:production -- \
  /srv/axiom-mesh/data \
  /srv/axiom-mesh/secrets
```

Set `AXIOM_TRANSPORT_DIR` to the resulting `transport` directory for a host
process, or set `AXIOM_TRANSPORT_DIR_HOST` before using the production Compose
file. Compose mounts only the public CA certificate, active manifest, and
service leaves read-only. The CA signing authority remains host-only.

The single-container candidate still shares the leaf directory among its four
processes. Independently deployed services must receive only their own leaf
key, the CA certificate, and a separately delivered active-peer registry.
External Vault, KMS, HSM, and orchestrator secret providers remain pilot
integration work; do not claim them from this file-backed mechanism.

Use the canonical
[mutually authenticated transport runbook](../operations/MUTUALLY-AUTHENTICATED-TRANSPORT.md)
for verification, rotation, rollback, incident response, and non-claims.
