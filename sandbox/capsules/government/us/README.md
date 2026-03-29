# United States Government Capsule

## Overview
This capsule implements the US government structure using a "pull not push" philosophy.
Rather than services being pushed onto citizens, citizens can actively "pull" the services they require (e.g. healthcare, DMV, tax processing) from the federal, state, or local registry.

## Political System
- **Executive Branch:** Modeled via administrative service oracles.
- **Legislative Branch:** Modeled via bicameral DAO structures (Senate and House).
- **Judicial Branch:** Modeled via Dialectic Arbitration mechanisms.

## "Pull Not Push" Mechanism
Services are registered on-chain by the respective department. A citizen interacts with the smart contract directly via `pullService(string memory serviceId)` to initiate the service delivery process.
