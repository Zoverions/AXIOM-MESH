# HOWTO: Recovery 2FA

## Overview
This document outlines how an agent or user can recover a Node ID using TOTP and MeshStore encrypted bundles.

## Architecture
```mermaid
sequenceDiagram
    participant CLI
    participant Gateway
    participant IdentityContract

    CLI->>Gateway: POST /auth/2fa/setup
    Gateway-->>CLI: QR Code & Secret
    CLI->>IdentityContract: registerRecovery(Commitments)
    CLI->>Gateway: POST /auth/2fa/recover (TOTP Code)
    Gateway-->>CLI: Recovery Bundle Response
```

## Steps
1. During `make cli`, specify `y` to "Enable 2FA (TOTP + Passkey) for recovery?".
2. The Gateway will generate a TOTP secret and QR Code.
3. The commitment is registered on-chain via `registerRecovery` on the DualLedgerIdentity contract.
4. If a recovery is needed, execute the CLI using `python3 cli/axiom_cli.py recover` and provide the Node ID and TOTP code.

## Version History
- **v15.5.1-Lockdown**: Standardized procedure.