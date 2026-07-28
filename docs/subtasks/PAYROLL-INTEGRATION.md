# Stablecoin Payroll Integration

**Status**: Implemented — Primary tasks tracked in MASTER-TODO.md Lane M13
**Owner**: @agent+gateway+compliance
**Date**: 2026-03-25 (Updated: 2026-03-28)

## Overview
As part of bridging traditional infrastructure to open-source blockchain infrastructure, we need to implement payroll systems. The system should mirror existing payroll structures based around stablecoins but natively built into our network.

## Completed Work
- [x] **M13.2**: Implemented `StablecoinPayroll.sol` smart contract
  - Handles adding employees to payroll registry
  - Supports depositing funds for payroll distribution
  - Implements streaming/batching salary claims
- [x] ERC-20 interface support for USDC and testnet equivalents

## Remaining Tasks (Tracked in MASTER-TODO.md)
- [x] **M13.8** Complete PAYROLL-INTEGRATION
  - Build UI/Gateway endpoints for:
    - Query pending payroll amounts
    - View historical claims
    - Add users to payroll registry
  - Investigate third-party service integrations:
    - Fiat off-ramping providers
    - Tax withholding services
    - Compliance reporting tools

## Related Documents
- **Master TODO:** `docs/MASTER-TODO.md` (Lane M13.8)
- **Smart Contract:** `grid/contracts/contracts/StablecoinPayroll.sol`
- **Gateway Routes:** `gateway/src/routes/payroll.ts`
