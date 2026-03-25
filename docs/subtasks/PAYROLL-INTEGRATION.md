# Stablecoin Payroll Integration

**Status**: In Progress
**Owner**: @agent
**Date**: 2026-03-25

## Overview
As part of bridging traditional infrastructure to open-source blockchain infrastructure, we need to implement payroll systems. The system should mirror existing payroll structures based around stablecoins but natively built into our network.

## Action Plan
1.  **Smart Contract Implementation**: Create `StablecoinPayroll.sol` to handle adding employees, depositing funds, and streaming/batching salary claims.
2.  **Stablecoin Integration**: Support standard ERC-20 interfaces (like USDC or a testnet equivalent) within the payroll logic.
3.  **UI/Gateway Integration**: Build endpoints to query pending payroll, historical claims, and to add users to the payroll registry.
4.  **Off-chain Integrations**: Investigate 3rd party service interconnects for fiat off-ramping, tax withholding, and compliance.
