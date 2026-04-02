# Android/Termux Expansion

This document outlines the technical specification for expanding the Android/Termux pathway within AXIOM-MESH. The current baseline detects Android and provisions the `minimal-edge` role. The expansion provides mobile-specific utilities required for deep network participation.

## Technical Architecture

The Android/Termux expansion leverages the existing Fast-API `provision_service` and the local Hypervisor orchestrator to serve lightweight mobile web endpoints accessible via localhost.

### 1. QR Sync (Mobile-to-Desktop Pairing)

The QR Sync mechanism establishes a secure session between an Android Termux instance and a `shared-machine`/`education-node`.

- **Implementation Plan**:
  - Expose a `/api/mobile/sync` endpoint in the gateway.
  - The Android node generates an ephemeral RSA key pair.
  - Using Python's `qrcode[pil]`, a QR code containing the Android node's ID and public key is rendered.
  - A desktop camera scans the QR code.
  - The desktop node encrypts an active session token with the public key.
  - The Android node receives the payload and decrypts it, syncing the identities.

### 2. Time-Based One-Time Password (TOTP) 2FA

For secure operations (like voting or wallet transfers) originating from the Android client, 2FA will be mandated.

- **Implementation Plan**:
  - Upon initialization, the Android node uses the `pyotp` library to generate a TOTP secret bound to the node's private key.
  - This secret is backed up to the `machine_profile.json` (encrypted locally) or a secured keychain if available on the device.
  - High-trust actions within the Hypervisor API will enforce an `X-Axiom-2FA` header requirement, verified against the saved secret.

### 3. Wallet and Achievements Dashboard

The wallet interface provides a read-only overview of AXM balances, staked PoER, and attained NFT badges from the Capsule hierarchy (e.g., Ontario Education badges).

- **Implementation Plan**:
  - The Hypervisor will host a minimal React SPA (Single Page Application) accessible at `http://localhost:8081/dashboard/mobile`.
  - The dashboard uses the `web3.js` library to query balances from the local or Grid RPC node.
  - For achievements, the dashboard queries the `EducationTomeRegistry` and regional Attestor contracts (e.g., `OntarioEducationAttestor.sol`) to fetch NFT badge metadata.
  - CSS is strictly designed for mobile-first rendering (responsive grid, touch-friendly tap targets).

## Security Considerations

- Private keys and TOTP secrets must never be exposed via the dashboard endpoints.
- All cross-device syncing must utilize asymmetric encryption, ensuring that intercepted QR codes or payloads are useless without the Android node's private key.
- The dashboard operates purely as an observation layer; mutable state changes (voting, transfers) must require the aforementioned 2FA challenge.
