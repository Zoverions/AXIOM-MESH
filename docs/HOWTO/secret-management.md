# Secret Management (mTLS Certificates)

## Background
In a production AXIOM-MESH deployment, relying on the `certs/` directory for inter-service mTLS certificates poses a credential leakage risk. Certificates should be treated as ephemeral and securely injected into the runtime environment via a dedicated secrets manager (e.g., HashiCorp Vault, AWS Secrets Manager, or Kubernetes Secrets).

## Implementation Details

The AXIOM-MESH runtime supports dynamic, in-memory mTLS credential injection via environment variables. If these environment variables are populated, they take precedence over any files present in the local `certs/` directory.

### Environment Variable Injection

To pass your certificates securely, map the raw PEM-encoded strings into the following environment variables:

| Variable | Description |
|---|---|
| `MTLS_CA_CERT` | The Certificate Authority (CA) public certificate used to verify peers. |
| `MTLS_CLIENT_CERT` | The service's own public certificate (e.g., `gateway.crt`, `hypervisor.crt`). |
| `MTLS_CLIENT_KEY` | The service's own private key (e.g., `gateway.key`, `hypervisor.key`). |

**Note**: When using environment variables containing multiline values (like PEM certificates) via Docker Compose or scripts, ensure proper quotation and newline preservation.

### HashiCorp Vault Integration Example
If using Vault's `vault-agent-injector` within a Kubernetes deployment, you can configure an init container or annotations to fetch the certs and write them to a shared memory volume (`tmpfs`), avoiding writing to persistent disk. Alternatively, read directly via the `vault` CLI before starting the Node or Python process and inject them into `process.env`.

```bash
export MTLS_CA_CERT="$(vault kv get -field=ca secret/axiom/mtls)"
export MTLS_CLIENT_CERT="$(vault kv get -field=cert secret/axiom/mtls/gateway)"
export MTLS_CLIENT_KEY="$(vault kv get -field=key secret/axiom/mtls/gateway)"
npm run start
```

### AWS Secrets Manager Example
Similarly, you can use the AWS CLI or SDK to fetch and export the secrets at boot time:
```bash
export MTLS_CA_CERT=$(aws secretsmanager get-secret-value --secret-id axiom/mtls/ca --query SecretString --output text)
export MTLS_CLIENT_CERT=$(aws secretsmanager get-secret-value --secret-id axiom/mtls/gateway/cert --query SecretString --output text)
export MTLS_CLIENT_KEY=$(aws secretsmanager get-secret-value --secret-id axiom/mtls/gateway/key --query SecretString --output text)
npm run start
```
