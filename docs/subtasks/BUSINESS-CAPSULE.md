# Business Skill Capsule (Digital Agency / Investment Node) Structure

**Status**: Proposed — Primary tasks to be tracked in future milestones
**Owner**: @agent+sandbox+ai
**Date**: 2026-04-02

## Overview
The goal is to expand the Capsule Plus model to include a "Business" or "Investment" Node. This specialized Capsule Plus acts as a digital agency and revenue generator. Instead of all generated funds going directly to the general pool, this node strategically manages portfolios, reinvests capital for growth, and operates digital services to replace legacy platforms. It contributes a set percentage back to the main AXIOM-MESH coffers (Network Security and Wealth Generation pools) while maintaining its own treasury for continuous compounding and business operations.

## Core Concepts
- **Revenue Generation**: The node acts as an autonomous or semi-autonomous business, offering digital services (e.g., APIs, AI agents, data processing) to users inside and outside the platform.
- **Strategic Investment**: Funds generated are not entirely swept into the global treasury. A portion is retained for investment portfolios to generate yield and grow the node's operational capacity.
- **Platform Contribution**: The node pays a "tax" or contribution percentage back to the main platform coffers, directly funding the ecosystem's baseline security and shared wealth pools.

## Required Personas/Sub-Agents
The capsule incorporates multiple essential business and financial personalities:
- **Portfolio Manager**: Analyzes yield opportunities, manages risk across different asset classes, and executes investment strategies.
- **Treasury Allocator**: Determines the optimal split between reinvestment, platform contribution, and operational expenses.
- **Digital Service Agent**: Operates the core business logic, fulfilling user requests, negotiating contracts, and collecting payments.

## Architecture & Integration
This capsule will integrate with the existing `UniversalDistributionPool` but introduce intermediary `TreasuryManager` smart contracts specific to the Business Node.

- **Location:** `sandbox/capsules/business/`
- **Schemas:** `schemas/portfolio.schema.json`, `schemas/service_contract.schema.json`
- **Contracts:** (Planned) `BusinessTreasury.sol`, `DigitalAgency.sol`

## Future Tasks
- [ ] Scaffold `sandbox/capsules/business/` structure.
- [ ] Define `schemas/portfolio.schema.json` for asset management.
- [ ] Implement multi-agent persona runtimes for the Portfolio Manager and Digital Service Agent.
- [ ] Create smart contracts for fractional platform contribution and reinvestment locking.