# China Government Capsule

## Overview
This capsule implements the China government structure using a "pull not push" philosophy.
Unlike traditional centralized pushing of local services, this capsule enables citizens to actively "pull" public services from a National/Provincial registry via verified requests.

## Political System
- **National Structure:** High-level policy and treasury management.
- **Provincial Structure:** Sub-level management and localized service deployment.
- **Local Communes:** Ground-level public service execution.

## "Pull Not Push" Mechanism
Services are predefined as smart contract entities. Citizens utilize the `pullService(string memory serviceId)` function to actively initiate service delivery (e.g., social welfare, educational access, infrastructure reports) from the corresponding registry.
