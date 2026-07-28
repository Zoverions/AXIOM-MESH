# HOWTO Runbook Index

This directory contains executable operational guides. Steps should be copy/paste runnable unless otherwise stated.

## New User Installation
- `../INSTALLATION-GUIDE.md` — comprehensive installation guide for new users with step-by-step instructions.

## Core Runtime Operations
- `run-local-stack.md` — bring up local services and verify health.
- `submit-intent.md` — submit intent via gateway and trace response path.
- `swarm-join.md` — add nodes to mesh and validate participation.
- `add-nodes-via-qr.md` — QR-based node onboarding flow.
- `zkml-infer.md` — execute zkML inference pipeline checks.

## Contracts, Governance, and Claims
- `contracts-local.md` — compile/test/deploy contracts locally.
- `founder-claim.md` — founder claim workflow.
- `meshstore-claim.md` — meshstore claim process.
- `nemoclaw-policy.md` — policy update lifecycle.

## Security, Recovery, and Incident Operations
- `recovery-2fa.md` — 2FA recovery process.
- `secret-management.md` — secret rotation and secure injection.
- `bridge-emergency-runbooks.md` — bridge incident and finality response.

## Release and Delivery Operations
- `release-gate-evidence.md` — assemble and validate release evidence.
- `transformer-foundation-pulsechain.md` — PulseChain transformer package deployment/evidence.
- `create-bootable-usb.md` — produce bootable Live USB media.
- `custom-guis.md` — node-specific GUI customization and validation.

## Coverage Policy
If a feature requires operator action, it must have a HOWTO in this directory and be linked from `index.md`.
