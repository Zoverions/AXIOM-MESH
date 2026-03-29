# United Kingdom Government Capsule

## Overview
This capsule implements the United Kingdom government structure using a "pull not push" philosophy.
Rather than public services (like NHS, DWP) being strictly centrally distributed, this capsule enables citizens to actively "pull" benefits and public services through verified digital identities.

## Political System
- **Parliament (Westminster):** The central legislative hub.
- **Devolved Administrations:** Autonomous sub-capsules for Scotland, Wales, and Northern Ireland.
- **Local Councils:** The lowest tier of service provision.

## "Pull Not Push" Mechanism
Services are cataloged in an on-chain registry managed by the respective administrative body. Citizens initiate service requests manually via the `pullService(string memory serviceId)` function on the smart contract.
