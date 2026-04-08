# mTLS Trust Bootstrap and Rotation Runbook

This runbook defines the operational procedure for mTLS trust bootstrap, certificate rotation, certificate revocation, and clock-skew response for AXIOM-MESH service nodes.

## Scope

- Gateway ↔ Hypervisor ↔ Sandbox ↔ Grid service-to-service traffic.
- Node join identity issuance and enrollment.
- CA certificate lifecycle and emergency replacement.
- Certificate revocation and trust-store convergence.
- Time-drift handling for cert validity and anti-replay windows.

## Preconditions

1. Secret manager access is configured (Vault/KMS/cluster secret backend).
2. Current trust anchor bundle is available as:
   - `MTLS_CA_CERT`
   - `MTLS_CLIENT_CERT`
   - `MTLS_CLIENT_KEY`
3. Replay controls are active in all services (timestamp + nonce checks).
4. NTP/chrony is configured on every node.

## 1) Node Join (Bootstrap Procedure)

1. Generate node keypair in-memory (or HSM-backed if available).
2. Create CSR with SAN entries for node identity and role.
3. Submit CSR to CA workflow with approval ticket.
4. Receive short-lived client cert and trust bundle.
5. Inject certs via environment secrets (never commit cert files to repo).
6. Start service and verify fail-closed mTLS handshake success.
7. Record join evidence:
   - node ID
   - cert serial
   - issuer fingerprint
   - issuance timestamp
   - approval reference

### Automation hooks

- Validate runtime mTLS hard-fail controls:
  - `python scripts/test_mtls.py`
- Capture release evidence package (include join artifacts):
  - `python scripts/verify_evidence_bundles.py`

## 2) CA Rotation (Planned)

1. **T-14 days:** mint new CA and publish staged trust bundle (old + new).
2. Roll all services to trust dual CAs.
3. Re-issue all node certs from new CA.
4. Confirm all inter-service links negotiate with new cert chain.
5. Remove old CA from trust bundle after convergence SLO is met.
6. Run post-rotation verification and archive evidence.

### Automation hooks

- mTLS regression gate:
  - `python scripts/test_mtls.py`
- Evidence freshness gate:
  - `python scripts/check_evidence_freshness.py`

## 3) Certificate Revocation

Triggers:
- Key compromise
- Unauthorized node behavior
- Decommissioned node

Procedure:

1. Revoke cert serial at CA.
2. Publish CRL/OCSP update and propagate to all services.
3. Blocklist node identity at policy layer.
4. Restart affected connections and enforce re-auth.
5. Verify denied handshake from revoked identity (fail-closed).
6. Log incident with timeline and closure signoff.

### Automation hooks

- Security verification gate:
  - `python scripts/test_mtls.py`
- Release-evidence policy checks:
  - `python scripts/validate_release_evidence.py docs/templates/release-summary.example.json`

## 4) Clock-Skew Response

Triggers:
- Certificate appears not-yet-valid/expired unexpectedly.
- Replay protection rejects valid requests due to timestamp skew.

Procedure:

1. Measure node skew against trusted time source.
2. If absolute skew exceeds **60 seconds**, quarantine node from mesh routing.
3. Re-sync time (`chronyc makestep` or platform equivalent).
4. Restart node service and re-run mTLS handshake checks.
5. If skew persists, rotate node cert and perform host-level incident triage.

### Automation hooks

- Audit freshness and evidence checks:
  - `python scripts/check_evidence_freshness.py`
- Synthetic verification sweep:
  - `python scripts/test_telemetry_alerts.py`

## Exit Criteria

- Node join/rotation/revocation/skew procedures executed and documented.
- mTLS checks pass with fail-closed behavior confirmed.
- Evidence artifacts stored in release dossier with operator signoff.
