# mTLS Bootstrap and Rotation

The supported procedure has moved to the canonical
[mutually authenticated service transport runbook](../operations/MUTUALLY-AUTHENTICATED-TRANSPORT.md).

The current clean-room runtime uses:

- TLS 1.3 only for internal service calls;
- locally provisioned Ed25519 CA and service leaves;
- DNS and SPIFFE-style URI identities;
- exact active-certificate SHA-256 pinning;
- signed, timestamped, nonce-protected requests above TLS;
- offline atomic leaf rotation and exact rollback;
- `npm run transport:drill` for signed real-stack evidence.

Earlier instructions referencing `MTLS_CA_CERT`, `MTLS_CLIENT_CERT`,
`MTLS_CLIENT_KEY`, Python scripts, CSR enrollment, CRLs, or OCSP describe a
superseded design and are not commands for the 0.11 clean-room kernel.
